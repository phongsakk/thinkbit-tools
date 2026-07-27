import { getCosmosContainer } from "@/lib/cosmos"
import { getCachedDocument } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

    const container = getCosmosContainer()
    const iterator = container.items.query({
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: decodedId }],
    })
    const result = await iterator.fetchNext()
    const item = (result.resources?.[0] ?? null) as Record<string, unknown> | null

    if (!item) {
      return Response.json({ error: "Document not found" }, { status: 404 })
    }

    return Response.json({
      item,
      source: "fresh",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch item"
    return Response.json({ error: message }, { status: 500 })
  }
}
