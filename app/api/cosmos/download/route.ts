import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DownloadBody = {
  documentId?: string
  document?: Record<string, unknown>
}

function getDownloadDir() {
  return path.join(process.cwd(), "download")
}

function sanitizeDocumentId(documentId: string) {
  const cleaned = documentId.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
  if (!cleaned) throw new Error("Invalid documentId")
  return cleaned
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DownloadBody
    const rawId = body.documentId?.trim() || (typeof body.document?.id === "string" ? body.document.id : "")
    if (!rawId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }
    if (!body.document || typeof body.document !== "object") {
      return Response.json({ error: "document is required" }, { status: 400 })
    }

    const documentId = sanitizeDocumentId(rawId)
    const dir = getDownloadDir()
    await mkdir(dir, { recursive: true })

    const filePath = path.join(dir, `${documentId}.json`)
    await writeFile(filePath, JSON.stringify(body.document, null, 2), "utf8")

    return Response.json({
      ok: true,
      documentId,
      path: `/download/${documentId}`,
      fileName: `${documentId}.json`,
      storagePath: filePath,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
