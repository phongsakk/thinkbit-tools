import { cosmosSqlQuery, type CosmosQueryResult } from "@/lib/cosmos"
import {
  buildUploadHistoryCacheKey,
  extractUploadPathMeta,
  getUploadHistoryStoragePath,
  isUploadHistoryFresh,
  mergeWarehouseManifest,
  normalizeUploadHistoryFilters,
  readWarehouseManifest,
  readUploadHistoryCache,
  UPLOAD_HISTORY_VERSION,
  upsertSearchManifest,
  writeUploadHistoryCache,
  type UploadHistoryGroup,
  type UploadHistoryPayload,
  type UploadHistorySearchEntry,
} from "@/lib/upload-history-cache"
import { makeCacheTimestamps } from "@/lib/services/cache"

type LiteItem = {
  id?: string
  blobFileName?: string
  createdAt?: string
}

function groupKey(timestamp: string, factoryId: string, period: string) {
  return `${timestamp}\0${factoryId}\0${period}`
}

export type UploadHistoryFilters = {
  fromTime?: string
  toTime?: string
  warehouses?: string | string[]
}

function normalizeFilters(filters?: UploadHistoryFilters) {
  return normalizeUploadHistoryFilters(filters)
}

function toIsoOrNull(input: string | null) {
  if (!input) return null
  const parsed = Date.parse(input)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

async function buildUploadHistory(filters?: UploadHistoryFilters): Promise<{
  payload: UploadHistoryPayload
  warehouses: string[]
  cacheKey: string
  searchHistory: UploadHistorySearchEntry[]
}> {
  const normalized = normalizeFilters(filters)
  const cacheKey = buildUploadHistoryCacheKey(normalized)
  const fromIso = toIsoOrNull(normalized.fromTime)
  const toIso = toIsoOrNull(normalized.toTime)
  const warehouseSet = new Set(normalized.warehouses)
  if (normalized.fromTime && !fromIso) {
    throw new Error("Invalid from_time")
  }
  if (normalized.toTime && !toIso) {
    throw new Error("Invalid to_time")
  }
  if (fromIso && toIso && Date.parse(fromIso) > Date.parse(toIso)) {
    throw new Error("from_time must be earlier than to_time")
  }

  const counts = new Map<
    string,
    {
      timestamp: string
      factory_id: string
      transaction_period: string
      count: number
      latestCreatedAtMs: number | null
    }
  >()
  const foundWarehouses = new Set<string>()
  let continuationToken: string | null = null
  let pages = 0
  let itemsLoaded = 0
  let ru = 0
  const maxPages = 200

  const whereParts: string[] = []
  const parameters: Array<{ name: string; value: string }> = []
  if (fromIso) {
    whereParts.push("c.createdAt >= @fromTime")
    parameters.push({ name: "@fromTime", value: fromIso })
  }
  if (toIso) {
    whereParts.push("c.createdAt <= @toTime")
    parameters.push({ name: "@toTime", value: toIso })
  }
  const query =
    `SELECT c.id, c.blobFileName, c.createdAt FROM c` +
    (whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "")

  do {
    const result: CosmosQueryResult<LiteItem> = await cosmosSqlQuery<LiteItem>(
      query,
      parameters,
      {
        maxItemCount: 100,
        continuationToken,
      }
    )

    for (const item of result.items) {
      if (typeof item.blobFileName !== "string") continue
      const meta = extractUploadPathMeta(item.blobFileName)
      if (!meta) continue
      if (warehouseSet.size > 0 && !warehouseSet.has(meta.factory_id)) continue

      if (meta.factory_id && meta.factory_id !== "—") {
        foundWarehouses.add(meta.factory_id)
      }
      const key = groupKey(meta.timestamp, meta.factory_id, meta.transaction_period)
      const createdAtMs =
        typeof item.createdAt === "string" && item.createdAt.trim().length > 0
          ? Date.parse(item.createdAt)
          : Number.NaN
      const normalizedCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : null
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
        if (
          normalizedCreatedAtMs != null &&
          (existing.latestCreatedAtMs == null ||
            normalizedCreatedAtMs > existing.latestCreatedAtMs)
        ) {
          existing.latestCreatedAtMs = normalizedCreatedAtMs
        }
      } else {
        counts.set(key, {
          timestamp: meta.timestamp,
          factory_id: meta.factory_id,
          transaction_period: meta.transaction_period,
          count: 1,
          latestCreatedAtMs: normalizedCreatedAtMs,
        })
      }
      itemsLoaded += 1
    }

    if (typeof result.requestCharge === "number") {
      ru += result.requestCharge
    }
    continuationToken = result.continuationToken
    pages += 1
  } while (continuationToken && pages < maxPages)

  const groups: UploadHistoryGroup[] = Array.from(counts.values())
    .sort((a, b) => {
      if (a.latestCreatedAtMs != null && b.latestCreatedAtMs != null) {
        if (a.latestCreatedAtMs !== b.latestCreatedAtMs) {
          return b.latestCreatedAtMs - a.latestCreatedAtMs
        }
      } else if (a.latestCreatedAtMs != null || b.latestCreatedAtMs != null) {
        return a.latestCreatedAtMs == null ? 1 : -1
      }
      const an = Number(a.timestamp)
      const bn = Number(b.timestamp)
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return bn - an
      const tsCmp = b.timestamp.localeCompare(a.timestamp)
      if (tsCmp !== 0) return tsCmp
      const facCmp = a.factory_id.localeCompare(b.factory_id)
      if (facCmp !== 0) return facCmp
      return a.transaction_period.localeCompare(b.transaction_period)
    })
    .map(({ timestamp, factory_id, transaction_period, count }) => ({
      timestamp,
      factory_id,
      transaction_period,
      count,
    }))

  const timestamps = makeCacheTimestamps("upload-history")
  const payloadToSave: UploadHistoryPayload = {
    version: UPLOAD_HISTORY_VERSION,
    savedAt: timestamps.savedAt,
    expiresAt: timestamps.expiresAt,
    groups,
    totalItems: itemsLoaded,
    requestCharge: ru > 0 ? ru : null,
    truncated: Boolean(continuationToken),
  }

  const hasFilters = Boolean(
    normalized.fromTime || normalized.toTime || normalized.warehouses.length > 0
  )
  const payload = hasFilters
    ? payloadToSave
    : await writeUploadHistoryCache({
        groups,
        totalItems: itemsLoaded,
        requestCharge: ru > 0 ? ru : null,
        truncated: Boolean(continuationToken),
        cacheKey,
      })

  if (hasFilters) {
    await writeUploadHistoryCache({
      groups,
      totalItems: itemsLoaded,
      requestCharge: ru > 0 ? ru : null,
      truncated: Boolean(continuationToken),
      savedAt: payloadToSave.savedAt,
      cacheKey,
    })
  }
  const searchHistory = await upsertSearchManifest(normalized, payloadToSave.savedAt, cacheKey)
  const warehouses = await mergeWarehouseManifest(Array.from(foundWarehouses))
  return { payload, warehouses, cacheKey, searchHistory }
}

export type UploadHistoryResult = UploadHistoryPayload & {
  source: "cache" | "fresh"
  warehouses: string[]
  cacheKey: string
  searchHistory: UploadHistorySearchEntry[]
  storagePath: string
}

/**
 * Read upload-history from MongoDB cache only (no Cosmos).
 * Returns null when missing, invalid, or expired (all entries use TTL).
 */
export async function getCachedUploadHistory(
  filters?: UploadHistoryFilters
): Promise<UploadHistoryResult | null> {
  const normalized = normalizeFilters(filters)
  const cacheKey = buildUploadHistoryCacheKey(normalized)
  const cached = await readUploadHistoryCache(cacheKey)
  if (!cached || !isUploadHistoryFresh(cached)) return null

  const warehouses = await readWarehouseManifest()
  const searchHistory = await upsertSearchManifest(normalized, cached.savedAt, cacheKey)
  return {
    ...cached,
    source: "cache",
    warehouses,
    cacheKey,
    searchHistory,
    storagePath: getUploadHistoryStoragePath(cacheKey),
  }
}

export async function getUploadHistory(
  forceFresh: boolean,
  filters?: UploadHistoryFilters
): Promise<UploadHistoryResult> {
  if (!forceFresh) {
    const cached = await getCachedUploadHistory(filters)
    if (cached) return cached
  }

  const { payload, warehouses, cacheKey: builtCacheKey, searchHistory } =
    await buildUploadHistory(filters)
  return {
    ...payload,
    source: "fresh",
    warehouses,
    cacheKey: builtCacheKey,
    searchHistory,
    storagePath: getUploadHistoryStoragePath(builtCacheKey),
  }
}
