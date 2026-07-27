import { readFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ documentId: string }>
}

function sanitizeDocumentId(documentId: string) {
  return documentId.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { documentId: rawId } = await context.params
    const documentId = sanitizeDocumentId(rawId)
    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), "download", `${documentId}.json`)
    const content = await readFile(filePath, "utf8")

    return new Response(content, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${documentId}.json"`,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 })
  }
}
