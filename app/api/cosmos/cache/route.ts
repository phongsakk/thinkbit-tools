export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function log(step: string, extra?: Record<string, unknown>) {
  console.log(`[cosmos/cache] ${step}`, {
    at: new Date().toISOString(),
    ...extra,
  })
}

export async function GET(request: Request) {
  log("GET start", {
    url: request.url,
    node: process.version,
    vercel: Boolean(process.env.VERCEL),
  })

  try {
    const documentId = new URL(request.url).searchParams.get("documentId")
    log("import local-cache", { documentId })
    const { getCacheStatus } = await import("@/lib/local-cache")
    const status = await getCacheStatus(documentId)
    log("status ok", {
      document: status.document,
      prepare: status.prepare,
    })
    return Response.json({ ok: true, ...status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read cache status"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[cosmos/cache] GET error", { message, stack })
    return Response.json(
      {
        error: message,
        where: "cosmos/cache",
        node: process.version,
        vercel: Boolean(process.env.VERCEL),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  log("POST start")
  try {
    const body = (await request.json().catch(() => ({}))) as {
      kind?: "cosmos" | "prepare" | "download" | "all"
      documentId?: string
    }
    log("body", { kind: body.kind ?? "all", documentId: body.documentId ?? null })

    const { flushCache } = await import("@/lib/local-cache")
    const result = await flushCache({
      kind: body.kind ?? "all",
      documentId: body.documentId,
    })
    log("flush ok", { removed: result.removed.length })
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to flush cache"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[cosmos/cache] POST error", { message, stack })
    return Response.json(
      {
        error: message,
        where: "cosmos/cache",
        node: process.version,
      },
      { status: 500 }
    )
  }
}
