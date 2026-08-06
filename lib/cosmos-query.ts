import {
  buildCosmosQueryCacheKey,
  buildCosmosSqlQuery,
  isCosmosFilterField,
  isCosmosFilterMode,
  resolveFilterFromSearchParams,
  type CosmosFilterField,
  type CosmosFilterMode,
  type CosmosLiteItem,
  type CosmosQueryInput,
  type CosmosQueryResult,
} from "@/lib/cosmos-query-shared"
import { cosmosSqlQuery, type CosmosQueryResult as CosmosSqlQueryResult } from "@/lib/cosmos"
import {
  getJsonCache,
  makeCacheTimestamps,
  saveJsonCache,
  storageRef,
} from "@/lib/services/cache"

export * from "@/lib/cosmos-query-shared"

type QueryCachePayload = {
  version: 1
  savedAt: string
  expiresAt: string | null
  field: CosmosFilterField
  mode: CosmosFilterMode
  value: string
  selectLite: boolean
  items: CosmosLiteItem[]
  requestCharge: number | null
}

function isValidQueryCache(data: Record<string, unknown>): data is QueryCachePayload {
  return (
    data.version === 1 &&
    typeof data.savedAt === "string" &&
    (data.expiresAt === null || typeof data.expiresAt === "string") &&
    Array.isArray(data.items) &&
    typeof data.field === "string" &&
    typeof data.mode === "string" &&
    typeof data.value === "string"
  )
}

async function readQueryCache(cacheKey: string): Promise<QueryCachePayload | null> {
  const cached = await getJsonCache("cosmos-query", cacheKey)
  if (!cached || !isValidQueryCache(cached.data)) return null
  // cosmos-query has no TTL (/docs); provider already skips expiry.
  return cached.data
}

async function writeQueryCache(payload: QueryCachePayload, cacheKey: string) {
  await saveJsonCache("cosmos-query", cacheKey, payload)
}

export function getCosmosQueryStoragePath(cacheKey: string) {
  return storageRef("cosmos-query", cacheKey)
}

export async function runCosmosQuery(
  input: CosmosQueryInput
): Promise<CosmosQueryResult> {
  const { assertCosmosEnv } = await import("@/lib/cosmos")
  assertCosmosEnv()

  const value = input.value?.trim() ?? ""
  const selectLite = Boolean(input.selectLite)
  const maxItemCount = Math.min(Math.max(input.maxItemCount ?? 50, 1), 100)
  const querySpec = buildCosmosSqlQuery(input)

  const canUseSetCache =
    Boolean(input.fetchAll) &&
    selectLite &&
    Boolean(value) &&
    isCosmosFilterField(input.field) &&
    isCosmosFilterMode(input.mode) &&
    !input.continuationToken

  if (canUseSetCache && !input.forceFresh) {
    const cacheKey = buildCosmosQueryCacheKey({
      field: input.field!,
      mode: input.mode!,
      value,
      selectLite,
    })
    const cached = await readQueryCache(cacheKey)
    if (cached) {
      return {
        items: cached.items,
        continuationToken: null,
        hasMore: false,
        requestCharge: cached.requestCharge,
        source: "cache",
      }
    }
  }

  if (input.fetchAll && value) {
    const items: CosmosLiteItem[] = []
    let continuationToken: string | null = null
    let requestCharge = 0
    let pages = 0
    const maxPages = 100

    do {
      const page: CosmosSqlQueryResult<CosmosLiteItem> = await cosmosSqlQuery<CosmosLiteItem>(
        querySpec.query,
        querySpec.parameters,
        {
          maxItemCount,
          continuationToken,
        }
      )
      items.push(...page.items)
      if (typeof page.requestCharge === "number") requestCharge += page.requestCharge
      continuationToken = page.continuationToken
      pages += 1
    } while (continuationToken && pages < maxPages)

    if (
      canUseSetCache &&
      isCosmosFilterField(input.field) &&
      isCosmosFilterMode(input.mode)
    ) {
      const cacheKey = buildCosmosQueryCacheKey({
        field: input.field,
        mode: input.mode,
        value,
        selectLite,
      })
      const timestamps = makeCacheTimestamps("cosmos-query")
      await writeQueryCache(
        {
          version: 1,
          savedAt: timestamps.savedAt,
          expiresAt: timestamps.expiresAt,
          field: input.field,
          mode: input.mode,
          value,
          selectLite,
          items,
          requestCharge: requestCharge > 0 ? requestCharge : null,
        },
        cacheKey
      )
    }

    return {
      items,
      continuationToken: null,
      hasMore: false,
      requestCharge: requestCharge > 0 ? requestCharge : null,
      source: "fresh",
    }
  }

  const result: CosmosSqlQueryResult<CosmosLiteItem> = await cosmosSqlQuery<CosmosLiteItem>(
    querySpec.query,
    querySpec.parameters,
    {
      maxItemCount,
      continuationToken: input.continuationToken,
    }
  )

  return {
    items: result.items,
    continuationToken: result.continuationToken,
    hasMore: Boolean(result.continuationToken),
    requestCharge:
      typeof result.requestCharge === "number" ? result.requestCharge : null,
    source: "fresh",
  }
}

export type ResolvedCosmosInitialQuery = {
  filter: {
    field: CosmosFilterField
    mode: CosmosFilterMode
    value: string
  } | null
  result: CosmosQueryResult | null
  error: string | null
}

export async function loadInitialCosmosQuery(sp: {
  unixtime?: string
  id?: string
  field?: string
  mode?: string
  value?: string
  fresh?: string
}): Promise<ResolvedCosmosInitialQuery> {
  const filter = resolveFilterFromSearchParams(sp)
  if (!filter) {
    return { filter: null, result: null, error: null }
  }

  try {
    const result = await runCosmosQuery({
      field: filter.field,
      mode: filter.mode,
      value: filter.value,
      selectLite: true,
      maxItemCount: 100,
      fetchAll: true,
      forceFresh: sp.fresh === "1",
    })
    return { filter, result, error: null }
  } catch (error) {
    return {
      filter,
      result: null,
      error: error instanceof Error ? error.message : "Failed to load Cosmos query",
    }
  }
}
