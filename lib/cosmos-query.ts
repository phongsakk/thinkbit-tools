import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { cosmosSqlQuery, type CosmosQueryResult as CosmosSqlQueryResult } from "@/lib/cosmos"
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

export * from "@/lib/cosmos-query-shared"

type QueryCachePayload = {
  version: 1
  savedAt: string
  field: CosmosFilterField
  mode: CosmosFilterMode
  value: string
  selectLite: boolean
  items: CosmosLiteItem[]
  requestCharge: number | null
}

function getQueryCacheDir() {
  const configuredRoot = process.env.LOCAL_CACHE_DIR?.trim()
  if (configuredRoot) return path.join(configuredRoot, "cosmos-query")
  if (process.env.VERCEL) {
    return path.join("/tmp", "thinkbit-tools", "download", "cosmos-query")
  }
  return path.join(process.cwd(), "download", "cosmos-query")
}

function getQueryCachePath(cacheKey: string) {
  return path.join(getQueryCacheDir(), `${cacheKey}.json`)
}

async function readQueryCache(cacheKey: string): Promise<QueryCachePayload | null> {
  try {
    const raw = await readFile(getQueryCachePath(cacheKey), "utf8")
    const parsed = JSON.parse(raw) as QueryCachePayload
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.items) ||
      typeof parsed.savedAt !== "string"
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function writeQueryCache(payload: QueryCachePayload, cacheKey: string) {
  await mkdir(getQueryCacheDir(), { recursive: true })
  await writeFile(getQueryCachePath(cacheKey), JSON.stringify(payload, null, 2), "utf8")
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
      await writeQueryCache(
        {
          version: 1,
          savedAt: new Date().toISOString(),
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
