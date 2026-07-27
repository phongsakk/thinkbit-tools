import { getCosmosContainer, getCosmosMeta } from "@/lib/cosmos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type QueryBody = {
  query?: string
  continuationToken?: string | null
  maxItemCount?: number
}

function isSafeSelectQuery(query: string): boolean {
  const normalized = query.trim().replace(/\s+/g, " ")
  if (!/^select\b/i.test(normalized)) return false
  if (/\b(insert|update|delete|replace|upsert|create|drop|alter)\b/i.test(normalized)) {
    return false
  }
  return true
}

export async function GET() {
  try {
    return Response.json({ ok: true, ...getCosmosMeta() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cosmos config error"
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QueryBody
    const query = (body.query ?? "SELECT * FROM c").trim()
    const maxItemCount = Math.min(Math.max(body.maxItemCount ?? 50, 1), 100)

    if (!isSafeSelectQuery(query)) {
      return Response.json(
        { error: "Only safe SELECT queries are allowed." },
        { status: 400 }
      )
    }

    const container = getCosmosContainer()
    const iterator = container.items.query(
      { query },
      {
        maxItemCount,
        continuationToken: body.continuationToken || undefined,
      }
    )

    const response = await iterator.fetchNext()
    const items = (response.resources ?? []) as Record<string, unknown>[]

    return Response.json({
      items,
      continuationToken: response.continuationToken ?? null,
      hasMore: Boolean(response.continuationToken),
      requestCharge: response.requestCharge,
      ...getCosmosMeta(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
