export const COSMOS_FILTER_FIELDS = ["id", "docType", "documentGroup", "unixtime"] as const
export const COSMOS_FILTER_MODES = ["exact", "like"] as const

export type CosmosFilterField = (typeof COSMOS_FILTER_FIELDS)[number]
export type CosmosFilterMode = (typeof COSMOS_FILTER_MODES)[number]

export type CosmosLiteItem = {
  id?: string
  blobFileName?: string
  [key: string]: unknown
}

export type CosmosQueryInput = {
  field?: CosmosFilterField
  mode?: CosmosFilterMode
  value?: string
  selectLite?: boolean
  continuationToken?: string | null
  maxItemCount?: number
  /** Aggregate all pages into one result (uses disk cache when possible). */
  fetchAll?: boolean
  forceFresh?: boolean
}

export type CosmosQueryResult = {
  items: CosmosLiteItem[]
  continuationToken: string | null
  hasMore: boolean
  requestCharge: number | null
  source: "cache" | "fresh"
}

export function isCosmosFilterField(value: unknown): value is CosmosFilterField {
  return typeof value === "string" && COSMOS_FILTER_FIELDS.includes(value as CosmosFilterField)
}

export function isCosmosFilterMode(value: unknown): value is CosmosFilterMode {
  return typeof value === "string" && COSMOS_FILTER_MODES.includes(value as CosmosFilterMode)
}

export function buildCosmosSqlQuery(input: CosmosQueryInput) {
  const value = input.value?.trim() ?? ""
  const selectClause = input.selectLite
    ? "SELECT c.id, c.blobFileName FROM c"
    : "SELECT * FROM c"

  if (!value) {
    return { query: selectClause, parameters: [] as { name: string; value: string }[] }
  }

  if (!isCosmosFilterField(input.field) || !isCosmosFilterMode(input.mode)) {
    throw new Error("Invalid filter field or mode.")
  }

  if (input.field === "unixtime") {
    return {
      query: `${selectClause} WHERE c.blobFileName LIKE @pattern`,
      parameters: [{ name: "@pattern", value: `%${value}%` }],
    }
  }

  if (input.mode === "exact") {
    return {
      query: `${selectClause} WHERE c.${input.field} = @value`,
      parameters: [{ name: "@value", value }],
    }
  }

  return {
    query: `${selectClause} WHERE CONTAINS(c.${input.field}, @value, true)`,
    parameters: [{ name: "@value", value }],
  }
}

export function buildCosmosQueryCacheKey(input: {
  field: CosmosFilterField
  mode: CosmosFilterMode
  value: string
  selectLite: boolean
}) {
  const raw = JSON.stringify({
    field: input.field,
    mode: input.mode,
    value: input.value,
    selectLite: input.selectLite,
  })
  return Buffer.from(raw, "utf8").toString("base64url")
}

export function buildCosmosSearchHref(filter: {
  field: CosmosFilterField
  mode: CosmosFilterMode
  value: string
}) {
  const params = new URLSearchParams()
  const value = filter.value.trim()
  if (!value) return "/cosmos"

  if (filter.field === "unixtime") {
    params.set("unixtime", value)
  } else if (filter.field === "id") {
    params.set("id", value)
  } else {
    params.set("field", filter.field)
    params.set("mode", filter.mode)
    params.set("value", value)
  }
  return `/cosmos?${params.toString()}`
}

export type ResolvedCosmosInitialFilter = {
  field: CosmosFilterField
  mode: CosmosFilterMode
  value: string
} | null

export function resolveFilterFromSearchParams(sp: {
  unixtime?: string
  id?: string
  field?: string
  mode?: string
  value?: string
}): ResolvedCosmosInitialFilter {
  const unixtime = sp.unixtime?.trim()
  if (unixtime) {
    return { field: "unixtime", mode: "like", value: unixtime }
  }

  const id = sp.id?.trim()
  if (id) {
    return { field: "id", mode: "exact", value: id }
  }

  const value = sp.value?.trim()
  if (value && isCosmosFilterField(sp.field) && isCosmosFilterMode(sp.mode)) {
    return { field: sp.field, mode: sp.mode, value }
  }

  if (value && isCosmosFilterField(sp.field)) {
    return {
      field: sp.field,
      mode: sp.field === "unixtime" ? "like" : "exact",
      value,
    }
  }

  return null
}
