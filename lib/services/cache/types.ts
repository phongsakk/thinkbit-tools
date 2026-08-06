export type CacheSource = "cache" | "fresh"

/** All MongoDB-backed cache kinds */
export type CacheKind =
  | "cosmos"
  | "prepare"
  | "blob"
  | "cosmos-query"
  | "upload-history"

export type JsonCacheKind = Exclude<CacheKind, "blob">

export type ManifestEntry = {
  savedAt: string
  /** null when kind has no TTL (docs caches) */
  expiresAt: string | null
  fileName: string
  docType?: string
  url?: string
  /** Source Azure blob path(s); array when multiple docs share the same cache fileName. */
  blobFileName?: string[]
  /** Document IDs linked to this shared blob file (blob manifest keyed by fileName). */
  documentIds?: string[]
  contentType?: string
}

export type ManifestFile = {
  version: 1
  entries: Record<string, ManifestEntry>
}

export type BlobCacheNameParts = {
  factory: string
  /** 8-digit transaction period, e.g. 00000463 */
  period: string
  /** Month+year from period (last 4 digits), e.g. 0463 */
  monthYear: string
  doc: string
  page: string
  fileName: string
}

export type CachedBlobListItem = {
  documentId: string
  fileName: string
  blobFileName: string[]
  documentIds: string[]
  contentType?: string
  savedAt: string
  expiresAt?: string
  path: string
  pageLabel: string
}

export type JsonCacheDocument = {
  _id: string
  kind: JsonCacheKind
  fileName: string
  savedAt: string
  expiresAt: string | null
  /** Mongo TTL sweeper; null = never auto-delete */
  expireAt: Date | null
  docType?: string
  url?: string
  data: Record<string, unknown>
}

export type BlobCacheDocument = {
  _id: string
  fileName: string
  savedAt: string
  expiresAt: string | null
  expireAt: Date | null
  contentType?: string
  blobFileName: string[]
  documentIds: string[]
  data: unknown
}
