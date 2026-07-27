import { saveDownloadedDocument, savePrepareResult } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DownloadBody = {
  documentId?: string
  document?: Record<string, unknown>
  prepare?: Record<string, unknown>
  docType?: string
  prepareUrl?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DownloadBody
    const rawId =
      body.documentId?.trim() ||
      (typeof body.document?.id === "string" ? body.document.id : "")
    if (!rawId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }
    if (!body.document || typeof body.document !== "object") {
      return Response.json({ error: "document is required" }, { status: 400 })
    }
    if (!body.prepare || typeof body.prepare !== "object") {
      return Response.json(
        { error: "prepare result is required for download" },
        { status: 400 }
      )
    }

    const savedDocument = await saveDownloadedDocument(rawId, body.document)
    const docType =
      body.docType ||
      (typeof body.document.docType === "string" ? body.document.docType : undefined) ||
      (typeof body.prepare.docType === "string" ? body.prepare.docType : undefined)
    const prepareUrl =
      body.prepareUrl ||
      (typeof body.prepare.url === "string" ? body.prepare.url : undefined)

    const savedPrepare = await savePrepareResult(rawId, body.prepare, {
      docType,
      url: prepareUrl,
    })

    return Response.json({
      ok: true,
      documentId: savedDocument.documentId,
      path: savedDocument.path,
      fileName: savedDocument.fileName,
      storagePath: savedDocument.storagePath,
      prepareStoragePath: savedPrepare.storagePath,
      source: "fresh",
      entry: savedDocument.entry,
      prepareEntry: savedPrepare.entry,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
