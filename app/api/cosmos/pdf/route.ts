import { downloadBlobByFileName } from "@/lib/azure-blob"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  return "application/octet-stream"
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const blobFileName = searchParams.get("blobFileName")?.trim()
    if (!blobFileName) {
      return Response.json({ error: "blobFileName is required" }, { status: 400 })
    }

    const { buffer, contentType, fileName } = await downloadBlobByFileName(blobFileName)

    const headers = new Headers()
    headers.set("Content-Type", contentType || contentTypeFromFileName(fileName))
    headers.set("Content-Length", String(buffer.byteLength))
    headers.set(
      "Content-Disposition",
      `attachment; filename="${fileName.replace(/"/g, "")}"`
    )
    headers.set("Cache-Control", "no-store")

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF download failed"
    const status = /not found/i.test(message) ? 404 : 500
    return Response.json({ error: message }, { status })
  }
}
