import { assertCosmosEnv, cosmosSqlQuery, getCosmosMeta } from "@/lib/cosmos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

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
    return { query: selectClause, parameters: [] as { name: string; value: string }[] }
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
    assertCosmosEnv()
    return Response.json({ ok: true, ...getCosmosMeta() })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cosmos config error"
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    assertCosmosEnv()

    const body = (await request.json()) as QueryBody
    const maxItemCount = Math.min(Math.max(body.maxItemCount ?? 50, 1), 100)
    const querySpec = buildQuery(body)

    const result = await cosmosSqlQuery(querySpec.query, querySpec.parameters, {
      maxItemCount,
      continuationToken: body.continuationToken,
    })

    return Response.json({
      items: result.items,
      continuationToken: result.continuationToken,
      hasMore: Boolean(result.continuationToken),
      requestCharge: result.requestCharge,
      ...getCosmosMeta(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed"
    console.error("[cosmos/query]", message)
    return Response.json({ error: message }, { status: 500 })
  }
}
