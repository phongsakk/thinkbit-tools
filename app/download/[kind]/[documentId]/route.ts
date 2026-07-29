import {
  getCachedBlob,
  getCachedDocument,
  getCachedPrepare,
  sanitizeDocumentId,
} from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ kind: string; documentId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { kind, documentId: rawId } = await context.params
    if (kind !== "cosmos" && kind !== "prepare" && kind !== "blob") {
      return Response.json(
        { error: "kind must be cosmos, prepare, or blob" },
        { status: 400 }
      )
    }

    const documentId = sanitizeDocumentId(rawId)
    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }

    if (kind === "blob") {
      const cached = await getCachedBlob(documentId)
      if (!cached) {
        return Response.json({ error: "File not found" }, { status: 404 })
      }

      return new Response(new Uint8Array(cached.buffer), {
        headers: {
          "Content-Type": cached.contentType,
          "Content-Length": String(cached.buffer.byteLength),
          "Content-Disposition": `inline; filename="${cached.fileName.replace(/"/g, "")}"`,
          "Cache-Control": "no-store",
        },
      })
    }

    if (kind === "cosmos") {
      const cached = await getCachedDocument(documentId)
      if (!cached) {
        return Response.json({ error: "File not found" }, { status: 404 })
      }
      const content = JSON.stringify(cached.item, null, 2)
      return new Response(content, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${documentId}.json"`,
          "Cache-Control": "no-store",
        },
      })
    }

    const cached = await getCachedPrepare(documentId)
    if (!cached) {
      return Response.json({ error: "File not found" }, { status: 404 })
    }
    const content = JSON.stringify(cached.payload, null, 2)
    return new Response(content, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${documentId}.json"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof Error && /Invalid documentId/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return Response.json({ error: "File not found" }, { status: 404 })
  }
}
