/**
 * Shared cache TTL for MongoDB-backed caches.
 * Override with CACHE_TTL_MS (milliseconds).
 *
 * `/docs` artifact caches do not expire: cosmos, prepare, blob, cosmos-query.
 * upload-history still uses TTL.
 */

import type { CacheKind } from "./types"

export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000

/** Kinds used by /docs (and related download APIs) — never expire */
export const CACHE_KINDS_WITHOUT_TTL: ReadonlySet<CacheKind> = new Set([
  "cosmos",
  "prepare",
  "blob",
  "cosmos-query",
])

export function cacheKindUsesTtl(kind: CacheKind): boolean {
  return !CACHE_KINDS_WITHOUT_TTL.has(kind)
}

export function getCacheTtlMs(): number {
  const raw = process.env.CACHE_TTL_MS?.trim()
  if (!raw) return DEFAULT_CACHE_TTL_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_TTL_MS
  return Math.floor(parsed)
}

export type CacheTimestamps = {
  savedAt: string
  expiresAt: string | null
  /** MongoDB TTL index field; null = no auto-expiry */
  expireAt: Date | null
}

export function makeCacheTimestamps(
  kind?: CacheKind,
  now = new Date()
): CacheTimestamps {
  const savedAtMs = now.getTime()
  const savedAt = new Date(savedAtMs).toISOString()

  if (kind && !cacheKindUsesTtl(kind)) {
    return {
      savedAt,
      expiresAt: null,
      expireAt: null,
    }
  }

  const expireAt = new Date(savedAtMs + getCacheTtlMs())
  return {
    savedAt,
    expiresAt: expireAt.toISOString(),
    expireAt,
  }
}

export function isCacheFresh(
  expiresAt: string | Date | null | undefined,
  now = Date.now()
): boolean {
  if (expiresAt == null) return false
  const expires =
    expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt))
  return Number.isFinite(expires) && expires > now
}

/** Freshness check that respects per-kind TTL policy */
export function isCacheEntryFresh(
  kind: CacheKind,
  expiresAt: string | Date | null | undefined,
  now = Date.now()
): boolean {
  if (!cacheKindUsesTtl(kind)) return true
  return isCacheFresh(expiresAt, now)
}
