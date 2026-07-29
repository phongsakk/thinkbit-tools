export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type RouteContext = {
  params: Promise<{ id: string }>
}

function log(step: string, extra?: Record<string, unknown>) {
  console.log(`[cosmos/item] ${step}`, {
    at: new Date().toISOString(),
    ...extra,
  })
}

export async function GET(request: Request, context: RouteContext) {
  log("start", {
    url: request.url,
    node: process.version,
    vercel: Boolean(process.env.VERCEL),
  })

  try {
    log("await params")
    const { id } = await context.params
    const decodedId = decodeURIComponent(id).trim()
    log("params resolved", { id, decodedId })

    if (!decodedId) {
      return Response.json({ error: "id is required" }, { status: 400 })
    }

    const forceFresh = new URL(request.url).searchParams.get("fresh") === "1"
    log("forceFresh", { forceFresh })

    if (!forceFresh) {
      log("import local-cache")
      const { getCachedDocument } = await import("@/lib/local-cache")
      log("local-cache imported")

      log("read cache")
      const cached = await getCachedDocument(decodedId)
      log("cache result", { hit: Boolean(cached) })

      if (cached) {
        return Response.json({
          item: cached.item,
          source: "cache",
          entry: cached.entry,
        })
      }
    }

    log("import cosmos")
    const { cosmosGetDocumentById } = await import("@/lib/cosmos")
    log("cosmos imported", {
      hasEndpoint: Boolean(process.env.COSMOS_ENDPOINT),
      hasKey: Boolean(process.env.COSMOS_KEY),
      hasDb: Boolean(process.env.COSMOS_DATABASE_ID),
      hasContainer: Boolean(process.env.COSMOS_CONTAINER_ID),
    })

    log("fetch document")
    const item = await cosmosGetDocumentById(decodedId)
    log("fetch done", { found: Boolean(item) })

    if (!item) {
      return Response.json({ error: "Document not found" }, { status: 404 })
    }

    return Response.json({
      item,
      source: "fresh",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch item"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[cosmos/item] error", { message, stack })
    return Response.json(
      {
        error: message,
        where: "cosmos/item",
        node: process.version,
        vercel: Boolean(process.env.VERCEL),
      },
      { status: 500 }
    )
  }
}
