import path from "node:path"
import type { BlobCacheNameParts, ManifestEntry } from "./types"

export function sanitizeDocumentId(documentId: string) {
  const cleaned = documentId.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
  if (!cleaned) throw new Error("Invalid documentId")
  return cleaned
}

export function blobDownloadPath(fileName: string) {
  return `/download/blob/${encodeURIComponent(path.basename(fileName.trim()))}`
}

export function storageRef(kind: string, key: string) {
  return `mongodb://cache/${kind}/${key}`
}

export function isBlobFileKey(key: string) {
  return /\.(pdf|png|jpe?g|tiff?)$/i.test(path.basename(key.trim()))
}

export function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  return "application/octet-stream"
}

function pageTokenFromLeaf(leaf: string): string {
  const pageBase = leaf.replace(/\.pdf$/i, "")
  return /^page\d+$/i.test(pageBase) ? pageBase.toLowerCase() : pageBase
}

/** Parse cache file name like `H504-00000463-DOC0009-page001.pdf`. */
export function parseBlobCacheFileName(
  fileName: string
): BlobCacheNameParts | null {
  const base = path.basename(fileName.trim())
  const match = base.match(
    /^([A-Za-z0-9]+)-(\d{8})-(DOC\d+)-(page.+)\.pdf$/i
  )
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null
  const period = match[2]
  const page = pageTokenFromLeaf(`${match[4]}.pdf`)
  return {
    factory: match[1],
    period,
    monthYear: period.slice(4),
    doc: match[3].toUpperCase(),
    page,
    fileName: `${match[1]}-${period}-${match[3].toUpperCase()}-${page}.pdf`,
  }
}

/**
 * Parse Azure blob path into cache naming parts.
 * Example path segment: `300769-1785...-H504-00-00000463-DOC0009`
 */
export function parseBlobCacheNameParts(
  blobFileName: string
): BlobCacheNameParts | null {
  const normalized = blobFileName.replace(/\\/g, "/").trim()
  const leaf = normalized.split("/").pop() || "page000.pdf"
  const page = pageTokenFromLeaf(leaf)

  const afterFirstSlash = normalized.includes("/")
    ? normalized.slice(normalized.indexOf("/") + 1)
    : normalized
  const firstSegment = afterFirstSlash.split("/")[0] ?? ""
  const match = firstSegment.match(
    /^(\d+)-(\d{10,})-([A-Za-z0-9]+)-\d{2}-(\d{8})-(DOC\d+)/i
  )
  if (!match?.[3] || !match[4] || !match[5]) return null

  const factory = match[3]
  const period = match[4]
  const doc = match[5].toUpperCase()
  return {
    factory,
    period,
    monthYear: period.slice(4),
    doc,
    page,
    fileName: `${factory}-${period}-${doc}-${page}.pdf`,
  }
}

/** Same factory + DOC + page + month/year → share one cache file. */
export function blobCacheMonthYearKey(
  parts: Pick<BlobCacheNameParts, "factory" | "monthYear" | "doc" | "page">
): string {
  return `${parts.factory}-${parts.monthYear}-${parts.doc}-${parts.page}`.toLowerCase()
}

/**
 * PDF cache file name: `{factory}-{period}-{DOC}-{page}.pdf`
 */
export function buildBlobCacheFileName(blobFileName: string): string {
  const parts = parseBlobCacheNameParts(blobFileName)
  if (parts) return parts.fileName

  const normalized = blobFileName.replace(/\\/g, "/").trim()
  const leaf = normalized.split("/").pop() || "page000.pdf"
  return `${sanitizeDocumentId(pageTokenFromLeaf(leaf))}.pdf`
}

/** Normalize legacy string | string[] manifest values to a unique string[]. */
export function normalizeBlobFileNames(
  value?: string | string[] | null
): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : []
  const unique = new Set<string>()
  for (const item of list) {
    const trimmed = String(item).trim()
    if (trimmed) unique.add(trimmed)
  }
  return Array.from(unique)
}

export function mergeBlobFileNames(
  ...groups: Array<string | string[] | null | undefined>
): string[] {
  const unique = new Set<string>()
  for (const group of groups) {
    for (const item of normalizeBlobFileNames(group)) {
      unique.add(item)
    }
  }
  return Array.from(unique)
}

export function mergeDocumentIds(
  ...groups: Array<string | string[] | null | undefined>
): string[] {
  const unique = new Set<string>()
  for (const group of groups) {
    const list = Array.isArray(group) ? group : group ? [group] : []
    for (const item of list) {
      const trimmed = String(item).trim()
      if (!trimmed) continue
      try {
        unique.add(sanitizeDocumentId(trimmed))
      } catch {
        // skip invalid
      }
    }
  }
  return Array.from(unique)
}

export function findBlobEntryByDocumentId(
  entries: Record<string, ManifestEntry>,
  documentId: string
): { fileName: string; entry: ManifestEntry } | null {
  const id = sanitizeDocumentId(documentId)
  for (const [fileName, entry] of Object.entries(entries)) {
    if (!entry) continue
    const ids = mergeDocumentIds(entry.documentIds)
    if (ids.includes(id)) {
      return { fileName: entry.fileName || fileName, entry }
    }
  }
  return null
}

export function pageLabelFromBlobFileName(
  blobFileName?: string | string[],
  fileName?: string
) {
  if (fileName) {
    return fileName.replace(/\.pdf$/i, "") || "PDF"
  }
  const first = normalizeBlobFileNames(blobFileName)[0]
  if (first) {
    return buildBlobCacheFileName(first).replace(/\.pdf$/i, "")
  }
  return "PDF"
}

export function toBuffer(data: unknown): Buffer | null {
  if (!data) return null
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)

  if (typeof data === "object" && data !== null && "buffer" in data) {
    const inner = (data as { buffer: unknown }).buffer
    if (Buffer.isBuffer(inner)) return inner
    if (inner instanceof Uint8Array) return Buffer.from(inner)
    if (inner instanceof ArrayBuffer) {
      const binary = data as {
        buffer: ArrayBuffer
        byteOffset?: number
        byteLength?: number
      }
      return Buffer.from(
        binary.buffer,
        binary.byteOffset ?? 0,
        binary.byteLength ?? binary.buffer.byteLength
      )
    }
  }

  return null
}
