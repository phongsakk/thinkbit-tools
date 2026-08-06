import {
  asciiSafeFilename,
  postPdfToOcr,
} from "@/lib/ocr-review/upstream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const buf = Buffer.from(await request.arrayBuffer())
    if (!buf.byteLength) {
      return Response.json(
        { error: "empty body (expected raw PDF bytes)" },
        { status: 400 }
      )
    }

    const url = new URL(request.url)
    const fast =
      url.searchParams.get("fast") === "1" ||
      url.searchParams.get("fast") === "true"

    const rawName = request.headers.get("x-filename")
    let displayName = "document.pdf"
    if (rawName) {
      try {
        displayName = decodeURIComponent(rawName)
      } catch {
        displayName = rawName
      }
    }

    const { status, data } = await postPdfToOcr({
      pdf: buf,
      filename: asciiSafeFilename(displayName),
      fast,
    })

    return Response.json(data, { status })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
