import { cosmosGetDocumentById } from "@/lib/cosmos"
import { getCachedDocument } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const decodedId = decodeURIComponent(id).trim()
    if (!decodedId) {
      return Response.json({ error: "id is required" }, { status: 400 })
    }

    const forceFresh = new URL(request.url).searchParams.get("fresh") === "1"
    if (!forceFresh) {
      const cached = await getCachedDocument(decodedId)
      if (cached) {
        return Response.json({
          item: cached.item,
          source: "cache",
          entry: cached.entry,
        })
      }
    }

    const item = await cosmosGetDocumentById(decodedId)
    if (!item) {
      return Response.json({ error: "Document not found" }, { status: 404 })
    }

    return Response.json({
      item,
      source: "fresh",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch item"
    console.error("[cosmos/item]", message)
    return Response.json({ error: message }, { status: 500 })
  }
}
