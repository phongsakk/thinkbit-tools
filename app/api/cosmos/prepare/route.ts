import {
  resolvePreparePlan,
  resolvePrepareUrl,
} from "@/lib/ocr-prepare-config"
import { getCachedPrepare, savePrepareResult } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PrepareBody = {
  documentId?: string
  docType?: string
  forceFresh?: boolean
  /** Persist local/empty prepare without calling upstream OCR prepare API. */
  skipUpstream?: boolean
  data?: unknown
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

let cachedToken: { value: string; expiresAt: number } | null = null

function getLoginCredentials() {
  return {
    email: process.env.OCR_PREPARE_EMAIL ?? "ja.test006+shell@gmail.com",
    password: process.env.OCR_PREPARE_PASSWORD ?? "shellpass",
  }
}

async function getPrepareBearerToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }

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

  cachedToken = {
    value: token,
    expiresAt: Date.now() + 25 * 60 * 1000,
  }

  return token
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PrepareBody
    const documentId = body.documentId?.trim() ?? ""
    const docType = body.docType?.trim() ?? ""
    const forceFresh = Boolean(body.forceFresh)

    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }

    if (!forceFresh) {
      const cached = await getCachedPrepare(documentId)
      if (cached) {
        return Response.json({
          ...cached.payload,
          source: "cache",
          entry: cached.entry,
        })
      }
    }

    if (!docType) {
      return Response.json({ error: "docType is required" }, { status: 400 })
    }

    const plan = resolvePreparePlan(docType)

    if (body.skipUpstream || plan.kind === "empty" || plan.kind === "local") {
      const data =
        body.data !== undefined
          ? body.data
          : plan.kind === "empty"
            ? {}
            : body.data ?? {}

      if (plan.kind === "local" && body.data === undefined && !body.skipUpstream) {
        return Response.json(
          {
            error:
              "Local prepare requires client-built data (warehouse/company from localStorage)",
            plan,
          },
          { status: 400 }
        )
      }

      const payload = {
        ok: true,
        url: null as string | null,
        method: plan.kind === "empty" ? "empty" : "local",
        docType,
        documentId,
        data: plan.kind === "empty" && body.data === undefined ? {} : data,
        plan,
      }

      await savePrepareResult(documentId, payload, { docType, url: undefined })

      return Response.json({
        ...payload,
        source: "fresh",
      })
    }

    const url = resolvePrepareUrl(docType, documentId)
    if (!url) {
      return Response.json(
        { error: `No prepare route configured for docType: ${docType}` },
        { status: 400 }
      )
    }

    const token = await getPrepareBearerToken()
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })

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
      if (upstream.status === 401 || upstream.status === 403) {
        cachedToken = null
      }
      return Response.json(
        {
          error: `Prepare API failed (${upstream.status})`,
          url,
          details: data,
        },
        { status: 502 }
      )
    }

    const payload = {
      ok: true,
      url,
      method: "GET",
      docType,
      documentId,
      data,
    }

    await savePrepareResult(documentId, payload, { docType, url })

    return Response.json({
      ...payload,
      source: "fresh",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prepare failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
