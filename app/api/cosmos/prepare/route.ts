import { resolvePrepareUrl } from "@/lib/ocr-prepare-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PrepareBody = {
  documentId?: string
  docType?: string
  document?: Record<string, unknown>
}

type LoginResponse = {
  accessToken?: string
  token?: string
  data?: {
    accessToken?: string
    token?: string
  }
}

const AUTH_LOGIN_URL = "https://api-oil.devthinkbit.com/api/auth/login"

function getLoginCredentials() {
  return {
    email: process.env.OCR_PREPARE_EMAIL ?? "ja.test006+shell@gmail.com",
    password: process.env.OCR_PREPARE_PASSWORD ?? "shellpass",
  }
}

async function getPrepareBearerToken() {
  const credentials = getLoginCredentials()
  const authResponse = await fetch(AUTH_LOGIN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://staging.d26mnga930lpod.amplifyapp.com",
      Referer: "https://staging.d26mnga930lpod.amplifyapp.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(credentials),
    cache: "no-store",
  })

  const authText = await authResponse.text()
  let authData: LoginResponse | null = null
  try {
    authData = JSON.parse(authText) as LoginResponse
  } catch {
    authData = null
  }

  if (!authResponse.ok) {
    throw new Error(`Auth login failed (${authResponse.status})`)
  }

  const token =
    authData?.accessToken ??
    authData?.token ??
    authData?.data?.accessToken ??
    authData?.data?.token

  if (!token) {
    throw new Error("Auth token not found in login response")
  }

  return token
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PrepareBody
    const documentId =
      body.documentId?.trim() ||
      (typeof body.document?.id === "string" ? body.document.id : "")
    const docType =
      body.docType?.trim() ||
      (typeof body.document?.docType === "string" ? body.document.docType : "")

    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }
    if (!docType) {
      return Response.json({ error: "docType is required" }, { status: 400 })
    }

    const url = resolvePrepareUrl(docType, documentId)
    if (!url) {
      return Response.json(
        { error: `No prepare route configured for docType: ${docType}` },
        { status: 400 }
      )
    }

    const token = await getPrepareBearerToken()
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    }

    let methodUsed: "POST" | "GET" = "POST"
    let upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body.document ?? { id: documentId, docType }),
      cache: "no-store",
    })

    if (upstream.status === 404) {
      methodUsed = "GET"
      upstream = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      })
    }

    const contentType = upstream.headers.get("content-type") ?? ""
    const rawText = await upstream.text()
    let data: unknown = rawText
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(rawText)
      } catch {
        data = rawText
      }
    }

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Prepare API failed (${upstream.status})`,
          url,
          details: data,
        },
        { status: 502 }
      )
    }

    return Response.json({
      ok: true,
      url,
      method: methodUsed,
      docType,
      documentId,
      data,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prepare failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
