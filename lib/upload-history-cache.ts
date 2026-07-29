import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type UploadHistoryGroup = {
  timestamp: string
  count: number
}

export type UploadHistoryPayload = {
  version: 1
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

function getUploadHistoryPath() {
  return path.join(getUploadHistoryDir(), UPLOAD_HISTORY_FILE)
}

/**
 * After the first `/` in blobFileName, take only the unix timestamp digits.
 * Example: OR-test/270769-1785139119001-K148-... → 1785139119001
 */
export function extractUploadTimestamp(blobFileName: string): string | null {
  const slash = blobFileName.indexOf("/")
  if (slash < 0) return null
  const afterFirstSlash = blobFileName.slice(slash + 1)
  const firstSegment = afterFirstSlash.split("/")[0] ?? ""
  const match = firstSegment.match(/\b(\d{10,})\b/)
  return match?.[1] ?? null
}

async function ensureUploadHistoryDir() {
  await mkdir(getUploadHistoryDir(), { recursive: true })
}

export async function readUploadHistoryCache(): Promise<UploadHistoryPayload | null> {
  try {
    const raw = await readFile(getUploadHistoryPath(), "utf8")
    const parsed = JSON.parse(raw) as UploadHistoryPayload
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.savedAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      !Array.isArray(parsed.groups)
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
}): Promise<UploadHistoryPayload> {
  const savedAt = input.savedAt ?? new Date().toISOString()
  const expiresAt = new Date(Date.parse(savedAt) + UPLOAD_HISTORY_TTL_MS).toISOString()
  const payload: UploadHistoryPayload = {
    version: 1,
    savedAt,
    expiresAt,
    groups: input.groups,
    totalItems: input.totalItems,
    requestCharge: input.requestCharge,
    truncated: input.truncated,
  }

  await ensureUploadHistoryDir()
  await writeFile(getUploadHistoryPath(), JSON.stringify(payload, null, 2), "utf8")
  return payload
}

export function getUploadHistoryStoragePath() {
  return getUploadHistoryPath()
}
