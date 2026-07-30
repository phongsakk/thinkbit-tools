import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export type CacheSource = "cache" | "fresh"

export type CacheKind = "cosmos" | "prepare" | "blob"

export type ManifestEntry = {
  savedAt: string
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

export function sanitizeDocumentId(documentId: string) {
  const cleaned = documentId.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
  if (!cleaned) throw new Error("Invalid documentId")
  return cleaned
}

function getRootDir(kind: CacheKind) {
  const configuredRoot = process.env.LOCAL_CACHE_DIR?.trim()
  if (configuredRoot) {
    return path.join(configuredRoot, kind)
  }

  // Vercel serverless runtime is read-only except `/tmp`.
  if (process.env.VERCEL) {
    return path.join("/tmp", "thinkbit-tools", "download", kind)
  }

  return path.join(process.cwd(), "download", kind)
}

function getManifestPath(kind: CacheKind) {
  return path.join(getRootDir(kind), "manifest.json")
}

function getItemPath(kind: CacheKind, documentId: string, fileName?: string) {
  const id = sanitizeDocumentId(documentId)
  if (kind === "blob") {
    const resolved = fileName?.trim() || `${id}.pdf`
    return path.join(getRootDir(kind), path.basename(resolved))
  }
  return path.join(getRootDir(kind), `${id}.json`)
}

function getBlobFilePath(fileName: string) {
  return path.join(getRootDir("blob"), path.basename(fileName.trim()))
}

function blobDownloadPath(fileName: string) {
  return `/download/blob/${encodeURIComponent(path.basename(fileName.trim()))}`
}

function isBlobFileKey(key: string) {
  return /\.(pdf|png|jpe?g|tiff?)$/i.test(path.basename(key.trim()))
}

function extensionFromFileName(fileName: string) {
  const ext = path.extname(fileName)
  return ext || ".pdf"
}

function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  return "application/octet-stream"
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
 * Example:
 *   .../1783...-H504-00-00000463-DOC0009/.../page001.pdf
 *   → H504-00000463-DOC0009-page001.pdf
 *
 * Different periods (month/year) get separate files; same month/year still share.
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

function mergeBlobFileNames(
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

function mergeDocumentIds(
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

/**
 * Blob manifest uses fileName as the entry key.
 * Migrates legacy documentId-keyed entries on read.
 */
async function readBlobManifest(): Promise<ManifestFile> {
  const raw = await readManifest("blob")
  const normalized: ManifestFile = { version: 1, entries: {} }
  let changed = false

  for (const [key, entry] of Object.entries(raw.entries)) {
    if (!entry) continue
    const fileName = path.basename((entry.fileName || key).trim())
    if (!fileName) continue

    const indexKey = isBlobFileKey(key) ? path.basename(key) : fileName
    const legacyDocId = !isBlobFileKey(key) && key !== indexKey ? key : null

    if (key !== indexKey) changed = true
    if (entry.fileName !== indexKey) changed = true
    if (legacyDocId && !entry.documentIds?.includes(legacyDocId)) changed = true

    const prev = normalized.entries[indexKey]
    if (prev) {
      changed = true
      const prevTime = Date.parse(prev.savedAt)
      const nextTime = Date.parse(entry.savedAt)
      const savedAt =
        Number.isFinite(prevTime) && Number.isFinite(nextTime)
          ? prevTime >= nextTime
            ? prev.savedAt
            : entry.savedAt
          : entry.savedAt || prev.savedAt
      normalized.entries[indexKey] = {
        savedAt,
        fileName: indexKey,
        blobFileName: mergeBlobFileNames(prev.blobFileName, entry.blobFileName),
        documentIds: mergeDocumentIds(
          prev.documentIds,
          entry.documentIds,
          legacyDocId
        ),
        contentType: prev.contentType || entry.contentType,
      }
    } else {
      normalized.entries[indexKey] = {
        savedAt: entry.savedAt,
        fileName: indexKey,
        blobFileName: normalizeBlobFileNames(entry.blobFileName),
        documentIds: mergeDocumentIds(entry.documentIds, legacyDocId),
        contentType: entry.contentType,
      }
    }
  }

  if (changed) {
    await writeManifest("blob", normalized)
  }
  return normalized
}

function findBlobEntryByDocumentId(
  manifest: ManifestFile,
  documentId: string
): { fileName: string; entry: ManifestEntry } | null {
  const id = sanitizeDocumentId(documentId)
  for (const [fileName, entry] of Object.entries(manifest.entries)) {
    if (!entry) continue
    const ids = mergeDocumentIds(entry.documentIds)
    if (ids.includes(id)) {
      return { fileName: entry.fileName || fileName, entry }
    }
  }
  return null
}

async function ensureDir(kind: CacheKind) {
  await mkdir(getRootDir(kind), { recursive: true })
}

async function readManifest(kind: CacheKind): Promise<ManifestFile> {
  try {
    const raw = await readFile(getManifestPath(kind), "utf8")
    const parsed = JSON.parse(raw) as ManifestFile
    if (!parsed || typeof parsed !== "object" || !parsed.entries) {
      return { version: 1, entries: {} }
    }
    return { version: 1, entries: parsed.entries }
  } catch {
    return { version: 1, entries: {} }
  }
}

async function writeManifest(kind: CacheKind, manifest: ManifestFile) {
  await ensureDir(kind)
  await writeFile(getManifestPath(kind), JSON.stringify(manifest, null, 2), "utf8")
}

async function fileExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function getCachedDocument(documentId: string) {
  const id = sanitizeDocumentId(documentId)
  const filePath = getItemPath("cosmos", id)

  try {
    const raw = await readFile(filePath, "utf8")
    const item = JSON.parse(raw) as Record<string, unknown>
    const manifest = await readManifest("cosmos")
    return {
      item,
      source: "cache" as const,
      entry: manifest.entries[id] ?? null,
      storagePath: filePath,
    }
  } catch {
    return null
  }
}

export async function saveDownloadedDocument(
  documentId: string,
  document: Record<string, unknown>
) {
  const id = sanitizeDocumentId(documentId)
  await ensureDir("cosmos")
  const fileName = `${id}.json`
  const filePath = getItemPath("cosmos", id)
  await writeFile(filePath, JSON.stringify(document, null, 2), "utf8")

  const manifest = await readManifest("cosmos")
  manifest.entries[id] = {
    savedAt: new Date().toISOString(),
    fileName,
    docType: typeof document.docType === "string" ? document.docType : undefined,
  }
  await writeManifest("cosmos", manifest)

  return {
    documentId: id,
    fileName,
    storagePath: filePath,
    path: `/download/cosmos/${id}`,
    entry: manifest.entries[id],
  }
}

export async function getCachedPrepare(documentId: string) {
  const id = sanitizeDocumentId(documentId)
  const filePath = getItemPath("prepare", id)

  try {
    const raw = await readFile(filePath, "utf8")
    const payload = JSON.parse(raw) as Record<string, unknown>
    const manifest = await readManifest("prepare")
    return {
      payload,
      source: "cache" as const,
      entry: manifest.entries[id] ?? null,
      storagePath: filePath,
    }
  } catch {
    return null
  }
}

export async function savePrepareResult(
  documentId: string,
  payload: Record<string, unknown>,
  meta?: { docType?: string; url?: string }
) {
  const id = sanitizeDocumentId(documentId)
  await ensureDir("prepare")
  const fileName = `${id}.json`
  const filePath = getItemPath("prepare", id)
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8")

  const manifest = await readManifest("prepare")
  manifest.entries[id] = {
    savedAt: new Date().toISOString(),
    fileName,
    docType: meta?.docType,
    url: meta?.url,
  }
  await writeManifest("prepare", manifest)

  return {
    documentId: id,
    fileName,
    storagePath: filePath,
    path: `/download/prepare/${id}`,
    entry: manifest.entries[id],
  }
}

export async function getCachedBlob(documentIdOrFileName: string) {
  const raw = documentIdOrFileName.trim()
  if (!raw) return null

  const manifest = await readBlobManifest()
  const asFileName = path.basename(raw)

  let fileName: string | null = null
  let entry: ManifestEntry | null = null

  if (manifest.entries[asFileName]) {
    fileName = asFileName
    entry = manifest.entries[asFileName]
  } else {
    try {
      const found = findBlobEntryByDocumentId(manifest, raw)
      if (found) {
        fileName = found.fileName
        entry = found.entry
      }
    } catch {
      return null
    }
  }

  if (!fileName || !entry) return null

  const filePath = getBlobFilePath(fileName)
  if (!(await fileExists(filePath))) {
    return null
  }

  const buffer = await readFile(filePath)
  return {
    buffer,
    source: "cache" as const,
    entry: {
      ...entry,
      fileName,
      blobFileName: normalizeBlobFileNames(entry.blobFileName),
      documentIds: mergeDocumentIds(entry.documentIds),
    },
    storagePath: filePath,
    fileName,
    contentType: entry.contentType || contentTypeFromFileName(fileName),
    path: blobDownloadPath(fileName),
  }
}

/** Find cached blob by exact cache fileName (manifest key). */
export async function getCachedBlobByFileName(fileName: string) {
  const resolved = path.basename(fileName.trim())
  if (!resolved) return null

  const manifest = await readBlobManifest()
  const entry = manifest.entries[resolved]
  if (!entry) return null

  const filePath = getBlobFilePath(resolved)
  if (!(await fileExists(filePath))) return null

  const buffer = await readFile(filePath)
  return {
    documentId: mergeDocumentIds(entry.documentIds)[0] || resolved,
    buffer,
    source: "cache" as const,
    entry: {
      ...entry,
      fileName: resolved,
      blobFileName: normalizeBlobFileNames(entry.blobFileName),
      documentIds: mergeDocumentIds(entry.documentIds),
    },
    storagePath: filePath,
    fileName: resolved,
    contentType: entry.contentType || contentTypeFromFileName(resolved),
    path: blobDownloadPath(resolved),
  }
}

/**
 * Find a shared PDF cache for the same factory + DOC + page + month/year.
 * Exact fileName match first; otherwise reuse any file in the same month/year.
 */
export async function getCachedBlobSharingMonthYear(blobFileName: string) {
  const parts = parseBlobCacheNameParts(blobFileName)
  if (!parts) {
    return getCachedBlobByFileName(buildBlobCacheFileName(blobFileName))
  }

  const exact = await getCachedBlobByFileName(parts.fileName)
  if (exact) return exact

  const shareKey = blobCacheMonthYearKey(parts)
  const manifest = await readBlobManifest()
  for (const [fileName, entry] of Object.entries(manifest.entries)) {
    if (!entry) continue
    const entryParts = parseBlobCacheFileName(entry.fileName || fileName)
    if (!entryParts || blobCacheMonthYearKey(entryParts) !== shareKey) continue

    const filePath = getBlobFilePath(entry.fileName || fileName)
    if (!(await fileExists(filePath))) continue
    const buffer = await readFile(filePath)
    const resolved = entry.fileName || fileName
    return {
      documentId: mergeDocumentIds(entry.documentIds)[0] || resolved,
      buffer,
      source: "cache" as const,
      entry: {
        ...entry,
        fileName: resolved,
        blobFileName: normalizeBlobFileNames(entry.blobFileName),
        documentIds: mergeDocumentIds(entry.documentIds),
      },
      storagePath: filePath,
      fileName: resolved,
      contentType: entry.contentType || contentTypeFromFileName(resolved),
      path: blobDownloadPath(resolved),
    }
  }
  return null
}

export type CachedBlobListItem = {
  documentId: string
  fileName: string
  blobFileName: string[]
  documentIds: string[]
  contentType?: string
  savedAt: string
  path: string
  pageLabel: string
}

function pageLabelFromBlobFileName(
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

export async function listCachedBlobs(): Promise<CachedBlobListItem[]> {
  const manifest = await readBlobManifest()
  const items: CachedBlobListItem[] = []

  for (const [fileName, entry] of Object.entries(manifest.entries)) {
    if (!entry) continue
    const resolved = entry.fileName || fileName
    const filePath = getBlobFilePath(resolved)
    if (!(await fileExists(filePath))) continue

    const documentIds = mergeDocumentIds(entry.documentIds)
    const blobFileNames = normalizeBlobFileNames(entry.blobFileName)

    items.push({
      documentId: documentIds[0] || resolved,
      fileName: resolved,
      blobFileName: blobFileNames,
      documentIds,
      contentType: entry.contentType,
      savedAt: entry.savedAt,
      path: blobDownloadPath(resolved),
      pageLabel: pageLabelFromBlobFileName(blobFileNames, resolved),
    })
  }

  items.sort((a, b) => {
    const at = Date.parse(a.savedAt)
    const bt = Date.parse(b.savedAt)
    if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at
    return b.fileName.localeCompare(a.fileName)
  })

  return items
}

/**
 * Link a documentId to an existing shared PDF cache file and append blob path.
 */
export async function linkBlobCacheEntry(
  documentId: string,
  blobFileName: string,
  shared: { fileName: string; contentType?: string }
) {
  const id = sanitizeDocumentId(documentId)
  await ensureDir("blob")
  const fileName = path.basename(shared.fileName)
  const manifest = await readBlobManifest()
  const existing = manifest.entries[fileName]
  const savedAt = new Date().toISOString()
  const contentType =
    shared.contentType ||
    existing?.contentType ||
    contentTypeFromFileName(fileName)

  // Unlink this document from any other fileName entry.
  for (const [otherName, otherEntry] of Object.entries(manifest.entries)) {
    if (otherName === fileName || !otherEntry) continue
    const ids = mergeDocumentIds(otherEntry.documentIds)
    if (!ids.includes(id)) continue
    const remaining = ids.filter((item) => item !== id)
    if (remaining.length === 0) {
      delete manifest.entries[otherName]
    } else {
      manifest.entries[otherName] = {
        ...otherEntry,
        documentIds: remaining,
      }
    }
  }

  manifest.entries[fileName] = {
    savedAt,
    fileName,
    blobFileName: mergeBlobFileNames(existing?.blobFileName, blobFileName),
    documentIds: mergeDocumentIds(existing?.documentIds, id),
    contentType,
  }

  await writeManifest("blob", manifest)
  const filePath = getBlobFilePath(fileName)
  return {
    documentId: id,
    fileName,
    storagePath: filePath,
    path: blobDownloadPath(fileName),
    entry: manifest.entries[fileName],
    contentType,
  }
}

export async function saveBlobFile(
  documentId: string,
  buffer: Buffer,
  meta: { blobFileName: string; contentType?: string; fileName?: string }
) {
  const id = sanitizeDocumentId(documentId)
  await ensureDir("blob")

  const fileName =
    meta.fileName?.trim() ||
    buildBlobCacheFileName(meta.blobFileName)

  const resolved = path.basename(fileName)
  const manifest = await readBlobManifest()

  const previous = findBlobEntryByDocumentId(manifest, id)
  if (previous && previous.fileName !== resolved) {
    const remaining = mergeDocumentIds(previous.entry.documentIds).filter(
      (item) => item !== id
    )
    if (remaining.length === 0) {
      try {
        await rm(getBlobFilePath(previous.fileName), { force: true })
      } catch {
        // ignore
      }
      delete manifest.entries[previous.fileName]
    } else {
      manifest.entries[previous.fileName] = {
        ...previous.entry,
        documentIds: remaining,
      }
    }
  }

  const filePath = getBlobFilePath(resolved)
  await writeFile(filePath, buffer)

  const contentType =
    meta.contentType && meta.contentType !== "application/octet-stream"
      ? meta.contentType
      : contentTypeFromFileName(resolved)

  const existing = manifest.entries[resolved]
  const savedAt = new Date().toISOString()
  manifest.entries[resolved] = {
    savedAt,
    fileName: resolved,
    blobFileName: mergeBlobFileNames(existing?.blobFileName, meta.blobFileName),
    documentIds: mergeDocumentIds(existing?.documentIds, id),
    contentType: existing?.contentType || contentType,
  }

  await writeManifest("blob", manifest)

  return {
    documentId: id,
    fileName: resolved,
    storagePath: filePath,
    path: blobDownloadPath(resolved),
    entry: manifest.entries[resolved],
    contentType: manifest.entries[resolved].contentType || contentType,
  }
}

export async function getCacheStatus(documentId?: string | null) {
  const cosmosManifest = await readManifest("cosmos")
  const prepareManifest = await readManifest("prepare")
  const blobManifest = await readBlobManifest()

  if (!documentId) {
    return {
      document: null,
      prepare: null,
      blob: null,
      downloadCount: Object.keys(cosmosManifest.entries).length,
      prepareCount: Object.keys(prepareManifest.entries).length,
      blobCount: Object.keys(blobManifest.entries).length,
    }
  }

  const id = sanitizeDocumentId(documentId)
  const hasDownload =
    Boolean(cosmosManifest.entries[id]) || (await fileExists(getItemPath("cosmos", id)))
  const hasPrepare =
    Boolean(prepareManifest.entries[id]) || (await fileExists(getItemPath("prepare", id)))
  const blobHit = findBlobEntryByDocumentId(blobManifest, id)
  const hasBlob =
    Boolean(blobHit) &&
    (await fileExists(getBlobFilePath(blobHit!.fileName)))

  return {
    document: hasDownload ? ("cache" as const) : null,
    prepare: hasPrepare ? ("cache" as const) : null,
    blob: hasBlob ? ("cache" as const) : null,
    downloadEntry: cosmosManifest.entries[id] ?? null,
    prepareEntry: prepareManifest.entries[id] ?? null,
    blobEntry: blobHit?.entry ?? null,
    downloadCount: Object.keys(cosmosManifest.entries).length,
    prepareCount: Object.keys(prepareManifest.entries).length,
    blobCount: Object.keys(blobManifest.entries).length,
  }
}

export async function getBatchCacheStatus(documentIds: string[]) {
  const cosmosManifest = await readManifest("cosmos")
  const prepareManifest = await readManifest("prepare")
  const blobManifest = await readBlobManifest()
  const pages: Record<
    string,
    { document: boolean; prepare: boolean; blob: boolean; complete: boolean }
  > = {}

  for (const rawId of documentIds) {
    const id = sanitizeDocumentId(rawId)
    const hasDownload =
      Boolean(cosmosManifest.entries[id]) || (await fileExists(getItemPath("cosmos", id)))
    const hasPrepare =
      Boolean(prepareManifest.entries[id]) || (await fileExists(getItemPath("prepare", id)))
    const blobHit = findBlobEntryByDocumentId(blobManifest, id)
    const hasBlob =
      Boolean(blobHit) &&
      (await fileExists(getBlobFilePath(blobHit!.fileName)))
    pages[id] = {
      document: hasDownload,
      prepare: hasPrepare,
      blob: hasBlob,
      complete: hasDownload && hasPrepare,
    }
  }

  return { pages }
}

export async function readCachedRawJson(documentId: string) {
  const cached = await getCachedDocument(documentId)
  if (!cached) return null
  return {
    id: sanitizeDocumentId(documentId),
    content: JSON.stringify(cached.item, null, 2),
  }
}

export async function readCachedPrepareJson(documentId: string) {
  const cached = await getCachedPrepare(documentId)
  if (!cached) return null
  return {
    id: sanitizeDocumentId(documentId),
    content: JSON.stringify(cached.payload, null, 2),
  }
}

export async function flushCache(options?: {
  kind?: "cosmos" | "prepare" | "blob" | "download" | "all"
  documentId?: string
}) {
  const requested = options?.kind ?? "all"
  const documentId = options?.documentId
    ? sanitizeDocumentId(options.documentId)
    : null

  const kinds: CacheKind[] =
    requested === "all" || requested === "download"
      ? ["cosmos", "prepare", "blob"]
      : [requested]

  const removed: string[] = []

  for (const current of kinds) {
    if (documentId) {
      if (current === "blob") {
        const manifest = await readBlobManifest()
        const asFileName = path.basename(documentId)
        const byFile = manifest.entries[asFileName]
          ? { fileName: asFileName, entry: manifest.entries[asFileName] }
          : null
        const found = byFile || findBlobEntryByDocumentId(manifest, documentId)

        if (found) {
          const remaining = mergeDocumentIds(found.entry.documentIds).filter(
            (item) => item !== documentId
          )
          // Flushing by fileName (or last linked doc) removes the shared file.
          const removeFile = Boolean(byFile) || remaining.length === 0
          if (removeFile) {
            const itemPath = getBlobFilePath(found.fileName)
            try {
              await rm(itemPath, { force: true })
              removed.push(itemPath)
            } catch {
              // ignore
            }
            delete manifest.entries[found.fileName]
          } else {
            manifest.entries[found.fileName] = {
              ...found.entry,
              documentIds: remaining,
            }
          }
          await writeManifest("blob", manifest)
        }
        continue
      }

      const manifest = await readManifest(current)
      const entry = manifest.entries[documentId]
      const itemPath = getItemPath(current, documentId, entry?.fileName)
      try {
        await rm(itemPath, { force: true })
        removed.push(itemPath)
      } catch {
        // ignore
      }
      if (manifest.entries[documentId]) {
        delete manifest.entries[documentId]
        await writeManifest(current, manifest)
      }
    } else {
      const root = getRootDir(current)
      try {
        await rm(root, { recursive: true, force: true })
        removed.push(root)
      } catch {
        // ignore
      }
      await ensureDir(current)
      await writeManifest(current, { version: 1, entries: {} })
    }
  }

  return { ok: true, removed }
}
