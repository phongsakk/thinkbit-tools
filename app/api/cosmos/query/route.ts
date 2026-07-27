import { getCosmosContainer, getCosmosMeta } from "@/lib/cosmos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FILTER_FIELDS = ["id", "docType", "documentGroup", "unixtime"] as const
const FILTER_MODES = ["exact", "like"] as const

type FilterField = (typeof FILTER_FIELDS)[number]
type FilterMode = (typeof FILTER_MODES)[number]

type QueryBody = {
  field?: FilterField
  mode?: FilterMode
  value?: string
  selectLite?: boolean
  continuationToken?: string | null
  maxItemCount?: number
}

function isFilterField(value: unknown): value is FilterField {
  return typeof value === "string" && FILTER_FIELDS.includes(value as FilterField)
}

function isFilterMode(value: unknown): value is FilterMode {
  return typeof value === "string" && FILTER_MODES.includes(value as FilterMode)
}

function buildQuery(body: QueryBody) {
  const value = body.value?.trim() ?? ""
  const selectClause = body.selectLite
    ? "SELECT c.id, c.blobFileName FROM c"
    : "SELECT * FROM c"

  if (!value) {
    return { query: selectClause }
  }

  if (!isFilterField(body.field) || !isFilterMode(body.mode)) {
    throw new Error("Invalid filter field or mode.")
  }

  if (body.field === "unixtime") {
    return {
      query: `${selectClause} WHERE c.blobFileName LIKE @pattern`,
      parameters: [{ name: "@pattern", value: `%${value}%` }],
    }
  }

  if (body.mode === "exact") {
    return {
      query: `${selectClause} WHERE c.${body.field} = @value`,
      parameters: [{ name: "@value", value }],
    }
  }

  return {
    query: `${selectClause} WHERE CONTAINS(c.${body.field}, @value, true)`,
    parameters: [{ name: "@value", value }],
  }
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
    const maxItemCount = Math.min(Math.max(body.maxItemCount ?? 50, 1), 100)
    const querySpec = buildQuery(body)

    const container = getCosmosContainer()
    const iterator = container.items.query(querySpec, {
      maxItemCount,
      continuationToken: body.continuationToken || undefined,
    })

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
