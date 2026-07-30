import {
  runCosmosQuery,
  type CosmosFilterField,
  type CosmosFilterMode,
} from "@/lib/cosmos-query"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function log(step: string, extra?: Record<string, unknown>) {
  console.log(`[cosmos/query] ${step}`, {
    at: new Date().toISOString(),
    ...extra,
  })
}

type QueryBody = {
  field?: CosmosFilterField
  mode?: CosmosFilterMode
  value?: string
  selectLite?: boolean
  continuationToken?: string | null
  maxItemCount?: number
  fetchAll?: boolean
  forceFresh?: boolean
}

export async function GET() {
  log("GET start")
  try {
    const { assertCosmosEnv, getCosmosMeta } = await import("@/lib/cosmos")
    assertCosmosEnv()
    return Response.json({ ok: true, ...getCosmosMeta() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cosmos config error"
    console.error("[cosmos/query] GET error", message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  log("POST start", {
    node: process.version,
    vercel: Boolean(process.env.VERCEL),
  })

  try {
    const { getCosmosMeta } = await import("@/lib/cosmos")
    const body = (await request.json()) as QueryBody
    log("body", {
      field: body.field,
      mode: body.mode,
      valueLen: body.value?.length ?? 0,
      selectLite: Boolean(body.selectLite),
      maxItemCount: body.maxItemCount ?? null,
      fetchAll: Boolean(body.fetchAll),
    })

    const result = await runCosmosQuery({
      field: body.field,
      mode: body.mode,
      value: body.value,
      selectLite: body.selectLite,
      continuationToken: body.continuationToken,
      maxItemCount: body.maxItemCount,
      fetchAll: body.fetchAll,
      forceFresh: body.forceFresh,
    })

    log("query done", {
      itemCount: result.items.length,
      hasMore: result.hasMore,
      requestCharge: result.requestCharge,
      source: result.source,
    })

    return Response.json({
      items: result.items,
      continuationToken: result.continuationToken,
      hasMore: result.hasMore,
      requestCharge: result.requestCharge,
      source: result.source,
      ...getCosmosMeta(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed"
    const stack = error instanceof Error ? error.stack : undefined
    console.error("[cosmos/query] POST error", { message, stack })
    return Response.json(
      {
        error: message,
        where: "cosmos/query",
        node: process.version,
        vercel: Boolean(process.env.VERCEL),
      },
      { status: 500 }
    )
  }
}
