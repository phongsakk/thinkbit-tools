import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type UploadHistoryGroup = {
  timestamp: string
  factory_id: string
  transaction_period: string
  count: number
}

export type UploadHistoryPayload = {
  version: 3
  savedAt: string
  expiresAt: string
  groups: UploadHistoryGroup[]
  totalItems: number
  requestCharge: number | null
  truncated: boolean
  source?: "cache" | "fresh"
}

export const UPLOAD_HISTORY_TTL_MS = 60 * 60 * 1000
export const UPLOAD_HISTORY_FILE = "latest.json"
export const UPLOAD_HISTORY_VERSION = 3 as const
export const UPLOAD_HISTORY_WAREHOUSE_MANIFEST_FILE = "warehouse-manifest.json"
export const UPLOAD_HISTORY_NOFILTER_CACHE_KEY = "nofilter"
export const UPLOAD_HISTORY_SEARCH_MANIFEST_FILE = "search-manifest.json"

function getUploadHistoryDir() {
  const configuredRoot = process.env.LOCAL_CACHE_DIR?.trim()
  if (configuredRoot) {
    return path.join(configuredRoot, "upload-history")
  }
  if (process.env.VERCEL) {
    return path.join("/tmp", "thinkbit-tools", "download", "upload-history")
  }
  return path.join(process.cwd(), "download", "upload-history")
}

function getUploadHistoryPath(cacheKey = UPLOAD_HISTORY_NOFILTER_CACHE_KEY) {
  if (cacheKey === UPLOAD_HISTORY_NOFILTER_CACHE_KEY) {
    return path.join(getUploadHistoryDir(), UPLOAD_HISTORY_FILE)
  }
  return path.join(getUploadHistoryDir(), `latest__${cacheKey}.json`)
}

function getWarehouseManifestPath() {
  return path.join(getUploadHistoryDir(), UPLOAD_HISTORY_WAREHOUSE_MANIFEST_FILE)
}

function getSearchManifestPath() {
  return path.join(getUploadHistoryDir(), UPLOAD_HISTORY_SEARCH_MANIFEST_FILE)
}

export type UploadPathMeta = {
  timestamp: string
  factory_id: string
  transaction_period: string
}

const THAI_MONTHS = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
]

function parseTransactionPeriodLabel(code: string): string {
  const cleaned = code.trim()
  if (!/^\d{8}$/.test(cleaned)) return "ไม่ทราบช่วง"

  const rangePart = cleaned.slice(0, 4)
  const monthPart = Number(cleaned.slice(4, 6))
  const yearPart = Number(cleaned.slice(6, 8))
  const monthLabel = THAI_MONTHS[monthPart] ?? ""
  if (!monthLabel) return "ไม่ทราบช่วง"
  const yearBE = 2500 + yearPart

  if (rangePart === "0000") {
    return `ทั้งเดือน ${monthLabel} ${yearBE}`
  }

  const start = Number(rangePart.slice(0, 2))
  const end = Number(rangePart.slice(2, 4))
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start <= 0 ||
    end <= 0 ||
    start > 31 ||
    end > 31
  ) {
    return `ทั้งเดือน ${monthLabel} ${yearBE}`
  }

  const startStr = String(start).padStart(2, "0")
  const endStr = String(end).padStart(2, "0")
  return `ช่วง ${startStr} - ${endStr} ${monthLabel} ${yearBE}`
}

/**
 * After the first `/` in blobFileName, parse
 * `{prefix}-{unixtime}-{factory_id}-{type}-{transactionCode}-...`
 * Example:
 * BANGCHAK-test/220769-1784714789647-B103-00-00001261-...
 * -> timestamp 1784714789647, factory_id B103, transaction_period "ทั้งเดือน ธันวาคม 2561"
 */
export function extractUploadPathMeta(blobFileName: string): UploadPathMeta | null {
  const slash = blobFileName.indexOf("/")
  if (slash < 0) return null
  const afterFirstSlash = blobFileName.slice(slash + 1)
  const firstSegment = afterFirstSlash.split("/")[0] ?? ""
  const match = firstSegment.match(/^(\d+)-(\d{10,})-([A-Za-z0-9]+)-\d{2}-(\d{8})/)
  if (!match) {
    // Fallback: timestamp only, factory unknown
    const tsOnly = firstSegment.match(/\b(\d{10,})\b/)
    if (!tsOnly?.[1]) return null
    return {
      timestamp: tsOnly[1],
      factory_id: "—",
      transaction_period: "ไม่ทราบช่วง",
    }
  }
  return {
    timestamp: match[2],
    factory_id: match[3],
    transaction_period: parseTransactionPeriodLabel(match[4]),
  }
}

/** @deprecated use extractUploadPathMeta */
export function extractUploadTimestamp(blobFileName: string): string | null {
  return extractUploadPathMeta(blobFileName)?.timestamp ?? null
}

export type UploadHistoryCacheFilters = {
  fromTime?: string | null
  toTime?: string | null
  /** @deprecated use warehouses */
  warehouse?: string | string[] | null
  warehouses?: string | string[] | null
}

export type UploadHistorySearchEntry = {
  cacheKey: string
  fromTime: string | null
  toTime: string | null
  warehouses: string[]
  savedAt: string
  storagePath: string
}

export function normalizeWarehouses(
  input?: string | string[] | null
): string[] {
  const parts = Array.isArray(input) ? input : input ? [input] : []
  const unique = new Set<string>()
  for (const part of parts) {
    for (const token of String(part).split(",")) {
      const trimmed = token.trim()
      if (trimmed) unique.add(trimmed)
    }
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b))
}

export function buildUploadHistoryCacheKey(
  filters?: UploadHistoryCacheFilters
): string {
  const normalized = normalizeUploadHistoryFilters(filters)
  if (!normalized.fromTime && !normalized.toTime && normalized.warehouses.length === 0) {
    return UPLOAD_HISTORY_NOFILTER_CACHE_KEY
  }

  const keyObject = {
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    warehouses: normalized.warehouses.length > 0 ? normalized.warehouses : null,
  }
  const raw = JSON.stringify(keyObject)
  return Buffer.from(raw, "utf8").toString("base64url")
}

export function normalizeUploadHistoryFilters(
  filters?: UploadHistoryCacheFilters
) {
  const fromTime = filters?.fromTime?.trim() || ""
  const toTime = filters?.toTime?.trim() || ""
  const warehouses = normalizeWarehouses(
    filters?.warehouses ?? filters?.warehouse ?? null
  )
  return {
    fromTime: fromTime || null,
    toTime: toTime || null,
    warehouses,
  }
}

async function ensureUploadHistoryDir() {
  await mkdir(getUploadHistoryDir(), { recursive: true })
}

function isValidGroup(group: unknown): group is UploadHistoryGroup {
  if (!group || typeof group !== "object") return false
  const g = group as UploadHistoryGroup
  return (
    typeof g.timestamp === "string" &&
    typeof g.factory_id === "string" &&
    typeof g.transaction_period === "string" &&
    typeof g.count === "number"
  )
}

export async function readUploadHistoryCache(
  cacheKey = UPLOAD_HISTORY_NOFILTER_CACHE_KEY
): Promise<UploadHistoryPayload | null> {
  try {
    const raw = await readFile(getUploadHistoryPath(cacheKey), "utf8")
    const parsed = JSON.parse(raw) as UploadHistoryPayload
    if (
      !parsed ||
      parsed.version !== UPLOAD_HISTORY_VERSION ||
      typeof parsed.savedAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      !Array.isArray(parsed.groups) ||
      !parsed.groups.every(isValidGroup)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function isUploadHistoryFresh(cache: UploadHistoryPayload, now = Date.now()) {
  const expires = Date.parse(cache.expiresAt)
  return Number.isFinite(expires) && expires > now
}

export async function writeUploadHistoryCache(input: {
  groups: UploadHistoryGroup[]
  totalItems: number
  requestCharge: number | null
  truncated: boolean
  savedAt?: string
  cacheKey?: string
}): Promise<UploadHistoryPayload> {
  const savedAt = input.savedAt ?? new Date().toISOString()
  const expiresAt = new Date(Date.parse(savedAt) + UPLOAD_HISTORY_TTL_MS).toISOString()
  const payload: UploadHistoryPayload = {
    version: UPLOAD_HISTORY_VERSION,
    savedAt,
    expiresAt,
    groups: input.groups,
    totalItems: input.totalItems,
    requestCharge: input.requestCharge,
    truncated: input.truncated,
  }

  await ensureUploadHistoryDir()
  await writeFile(
    getUploadHistoryPath(input.cacheKey),
    JSON.stringify(payload, null, 2),
    "utf8"
  )
  return payload
}

export function getUploadHistoryStoragePath(
  cacheKey = UPLOAD_HISTORY_NOFILTER_CACHE_KEY
) {
  return getUploadHistoryPath(cacheKey)
}

type WarehouseManifest = {
  version: 1
  warehouses: string[]
  updatedAt: string
}

type SearchManifest = {
  version: 1
  entries: UploadHistorySearchEntry[]
  updatedAt: string
}

export async function readWarehouseManifest(): Promise<string[]> {
  try {
    const raw = await readFile(getWarehouseManifestPath(), "utf8")
    const parsed = JSON.parse(raw) as WarehouseManifest
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.warehouses)
    ) {
      return []
    }
    return parsed.warehouses
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
  } catch {
    return []
  }
}

export async function mergeWarehouseManifest(found: string[]): Promise<string[]> {
  const current = await readWarehouseManifest()
  const merged = Array.from(
    new Set(
      [...current, ...found]
        .filter((item) => item && item !== "—")
        .map((item) => item.trim())
    )
  ).sort((a, b) => a.localeCompare(b))

  await ensureUploadHistoryDir()
  const payload: WarehouseManifest = {
    version: 1,
    warehouses: merged,
    updatedAt: new Date().toISOString(),
  }
  await writeFile(getWarehouseManifestPath(), JSON.stringify(payload, null, 2), "utf8")
  return merged
}

function normalizeSearchEntry(entry: unknown): UploadHistorySearchEntry | null {
  if (!entry || typeof entry !== "object") return null
  const raw = entry as Record<string, unknown>
  if (
    typeof raw.cacheKey !== "string" ||
    typeof raw.savedAt !== "string" ||
    typeof raw.storagePath !== "string"
  ) {
    return null
  }
  const warehouses = normalizeWarehouses(
    (raw.warehouses as string | string[] | null | undefined) ??
      (raw.warehouse as string | string[] | null | undefined) ??
      null
  )
  return {
    cacheKey: raw.cacheKey,
    fromTime: typeof raw.fromTime === "string" ? raw.fromTime : null,
    toTime: typeof raw.toTime === "string" ? raw.toTime : null,
    warehouses,
    savedAt: raw.savedAt,
    storagePath: raw.storagePath,
  }
}

function isSearchFilterEntry(entry: UploadHistorySearchEntry) {
  return (
    entry.cacheKey !== UPLOAD_HISTORY_NOFILTER_CACHE_KEY &&
    Boolean(entry.fromTime || entry.toTime || entry.warehouses.length > 0)
  )
}

export async function readSearchManifest(): Promise<UploadHistorySearchEntry[]> {
  try {
    const raw = await readFile(getSearchManifestPath(), "utf8")
    const parsed = JSON.parse(raw) as SearchManifest
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return []
    }
    return parsed.entries
      .map(normalizeSearchEntry)
      .filter((entry): entry is UploadHistorySearchEntry => Boolean(entry))
      .filter(isSearchFilterEntry)
  } catch {
    return []
  }
}

export async function upsertSearchManifest(
  filters: UploadHistoryCacheFilters | undefined,
  savedAt: string,
  cacheKey?: string
) {
  const normalized = normalizeUploadHistoryFilters(filters)
  const key = cacheKey ?? buildUploadHistoryCacheKey(normalized)
  const current = await readSearchManifest()

  // Default view (ทุกคลัง · ไม่กำหนด → ไม่กำหนด) is not a filter result.
  if (
    key === UPLOAD_HISTORY_NOFILTER_CACHE_KEY ||
    !(normalized.fromTime || normalized.toTime || normalized.warehouses.length > 0)
  ) {
    return current
  }

  const nextEntry: UploadHistorySearchEntry = {
    cacheKey: key,
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
    warehouses: normalized.warehouses,
    savedAt,
    storagePath: getUploadHistoryStoragePath(key),
  }
  const merged = [nextEntry, ...current.filter((entry) => entry.cacheKey !== key)]
    .filter(isSearchFilterEntry)
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, 10)
  const payload: SearchManifest = {
    version: 1,
    entries: merged,
    updatedAt: new Date().toISOString(),
  }
  await ensureUploadHistoryDir()
  await writeFile(getSearchManifestPath(), JSON.stringify(payload, null, 2), "utf8")
  return merged
}
