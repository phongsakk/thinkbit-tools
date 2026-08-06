import path from "node:path"
import {
  blobCacheMonthYearKey,
  blobDownloadPath,
  buildBlobCacheFileName,
  contentTypeFromFileName,
  mergeBlobFileNames,
  mergeDocumentIds,
  normalizeBlobFileNames,
  pageLabelFromBlobFileName,
  parseBlobCacheFileName,
  parseBlobCacheNameParts,
  sanitizeDocumentId,
  storageRef,
} from "./helpers"
import * as mongoCache from "./mongodb-provider"
import type { CachedBlobListItem, CacheKind, ManifestEntry } from "./types"

export type {
  BlobCacheNameParts,
  CacheKind,
  CacheSource,
  CachedBlobListItem,
  ManifestEntry,
  ManifestFile,
} from "./types"

export {
  blobCacheMonthYearKey,
  buildBlobCacheFileName,
  normalizeBlobFileNames,
  parseBlobCacheFileName,
  parseBlobCacheNameParts,
  sanitizeDocumentId,
} from "./helpers"

function resolveFlushDocumentId(documentId?: string): string | null {
  if (!documentId) return null
  const raw = documentId.trim()
  const asFile = path.basename(raw)
  if (/\.(pdf|png|jpe?g|tiff?)$/i.test(asFile)) return asFile
  return sanitizeDocumentId(raw)
}

export async function getCachedDocument(documentId: string) {
  const id = sanitizeDocumentId(documentId)
  const cached = await mongoCache.getJsonCache("cosmos", id)
  if (!cached) return null

  return {
    item: cached.data,
    source: "cache" as const,
    entry: cached.entry,
    storagePath: storageRef("cosmos", id),
  }
}

export async function saveDownloadedDocument(
  documentId: string,
  document: Record<string, unknown>
) {
  const id = sanitizeDocumentId(documentId)
  const entry = await mongoCache.saveJsonCache("cosmos", id, document, {
    docType: typeof document.docType === "string" ? document.docType : undefined,
  })

  return {
    documentId: id,
    fileName: entry.fileName,
    storagePath: storageRef("cosmos", id),
    path: `/download/cosmos/${id}`,
    entry,
  }
}

export async function getCachedPrepare(documentId: string) {
  const id = sanitizeDocumentId(documentId)
  const cached = await mongoCache.getJsonCache("prepare", id)
  if (!cached) return null

  return {
    payload: cached.data,
    source: "cache" as const,
    entry: cached.entry,
    storagePath: storageRef("prepare", id),
  }
}

export async function savePrepareResult(
  documentId: string,
  payload: Record<string, unknown>,
  meta?: { docType?: string; url?: string }
) {
  const id = sanitizeDocumentId(documentId)
  const entry = await mongoCache.saveJsonCache("prepare", id, payload, meta)

  return {
    documentId: id,
    fileName: entry.fileName,
    storagePath: storageRef("prepare", id),
    path: `/download/prepare/${id}`,
    entry,
  }
}

export async function getCachedBlob(documentIdOrFileName: string) {
  const raw = documentIdOrFileName.trim()
  if (!raw) return null

  const asFileName = path.basename(raw)
  const byName = await mongoCache.getBlobCache(asFileName)
  if (byName) {
    const fileName = byName.fileName
    return {
      buffer: byName.buffer,
      source: "cache" as const,
      entry: {
        ...byName.entry,
        fileName,
        blobFileName: normalizeBlobFileNames(byName.entry.blobFileName),
        documentIds: mergeDocumentIds(byName.entry.documentIds),
      },
      storagePath: storageRef("blob", fileName),
      fileName,
      contentType: byName.entry.contentType || contentTypeFromFileName(fileName),
      path: blobDownloadPath(fileName),
    }
  }

  let found: { fileName: string; entry: ManifestEntry } | null = null
  try {
    found = await mongoCache.findBlobByDocumentId(sanitizeDocumentId(raw))
  } catch {
    return null
  }
  if (!found) return null

  const cached = await mongoCache.getBlobCache(found.fileName)
  if (!cached) return null

  const fileName = found.fileName
  return {
    buffer: cached.buffer,
    source: "cache" as const,
    entry: {
      ...cached.entry,
      fileName,
      blobFileName: normalizeBlobFileNames(cached.entry.blobFileName),
      documentIds: mergeDocumentIds(cached.entry.documentIds),
    },
    storagePath: storageRef("blob", fileName),
    fileName,
    contentType: cached.entry.contentType || contentTypeFromFileName(fileName),
    path: blobDownloadPath(fileName),
  }
}

/** Find cached blob by exact cache fileName (manifest key). */
export async function getCachedBlobByFileName(fileName: string) {
  const resolved = path.basename(fileName.trim())
  if (!resolved) return null

  const cached = await mongoCache.getBlobCache(resolved)
  if (!cached) return null

  return {
    documentId: mergeDocumentIds(cached.entry.documentIds)[0] || resolved,
    buffer: cached.buffer,
    source: "cache" as const,
    entry: {
      ...cached.entry,
      fileName: resolved,
      blobFileName: normalizeBlobFileNames(cached.entry.blobFileName),
      documentIds: mergeDocumentIds(cached.entry.documentIds),
    },
    storagePath: storageRef("blob", resolved),
    fileName: resolved,
    contentType: cached.entry.contentType || contentTypeFromFileName(resolved),
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
  const items = await mongoCache.listBlobCacheMeta()

  for (const item of items) {
    const entryParts = parseBlobCacheFileName(item.entry.fileName || item.fileName)
    if (!entryParts || blobCacheMonthYearKey(entryParts) !== shareKey) continue

    const cached = await mongoCache.getBlobCache(item.fileName)
    if (!cached) continue

    const resolved = cached.fileName || item.fileName
    return {
      documentId: mergeDocumentIds(cached.entry.documentIds)[0] || resolved,
      buffer: cached.buffer,
      source: "cache" as const,
      entry: {
        ...cached.entry,
        fileName: resolved,
        blobFileName: normalizeBlobFileNames(cached.entry.blobFileName),
        documentIds: mergeDocumentIds(cached.entry.documentIds),
      },
      storagePath: storageRef("blob", resolved),
      fileName: resolved,
      contentType: cached.entry.contentType || contentTypeFromFileName(resolved),
      path: blobDownloadPath(resolved),
    }
  }

  return null
}

export async function listCachedBlobs(): Promise<CachedBlobListItem[]> {
  const items = await mongoCache.listBlobCacheMeta()
  const list: CachedBlobListItem[] = []

  for (const item of items) {
    const resolved = item.entry.fileName || item.fileName
    const documentIds = mergeDocumentIds(item.entry.documentIds)
    const blobFileNames = normalizeBlobFileNames(item.entry.blobFileName)

    list.push({
      documentId: documentIds[0] || resolved,
      fileName: resolved,
      blobFileName: blobFileNames,
      documentIds,
      contentType: item.entry.contentType,
      savedAt: item.entry.savedAt,
      path: blobDownloadPath(resolved),
      pageLabel: pageLabelFromBlobFileName(blobFileNames, resolved),
    })
  }

  list.sort((a, b) => {
    const at = Date.parse(a.savedAt)
    const bt = Date.parse(b.savedAt)
    if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at
    return b.fileName.localeCompare(a.fileName)
  })

  return list
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
  const fileName = path.basename(shared.fileName)
  const existing = await mongoCache.getBlobCacheMeta(fileName)
  if (!existing) {
    throw new Error(`Shared blob cache not found: ${fileName}`)
  }

  const savedAt = new Date().toISOString()
  const contentType =
    shared.contentType ||
    existing.contentType ||
    contentTypeFromFileName(fileName)

  await mongoCache.unlinkDocumentFromOtherBlobs(id, fileName)

  const entry = await mongoCache.updateBlobCacheMeta(fileName, {
    savedAt,
    contentType,
    blobFileName: mergeBlobFileNames(existing.blobFileName, blobFileName),
    documentIds: mergeDocumentIds(existing.documentIds, id),
  })

  return {
    documentId: id,
    fileName,
    storagePath: storageRef("blob", fileName),
    path: blobDownloadPath(fileName),
    entry: entry!,
    contentType,
  }
}

export async function saveBlobFile(
  documentId: string,
  buffer: Buffer,
  meta: { blobFileName: string; contentType?: string; fileName?: string }
) {
  const id = sanitizeDocumentId(documentId)
  const fileName =
    meta.fileName?.trim() || buildBlobCacheFileName(meta.blobFileName)
  const resolved = path.basename(fileName)

  const previous = await mongoCache.findBlobByDocumentId(id)
  if (previous && previous.fileName !== resolved) {
    const remaining = mergeDocumentIds(previous.entry.documentIds).filter(
      (item) => item !== id
    )
    if (remaining.length === 0) {
      await mongoCache.deleteBlobCache(previous.fileName)
    } else {
      await mongoCache.updateBlobCacheMeta(previous.fileName, {
        documentIds: remaining,
      })
    }
  }

  const entry = await mongoCache.saveBlobCache(resolved, buffer, {
    blobFileName: meta.blobFileName,
    documentIds: id,
    contentType: meta.contentType,
  })

  return {
    documentId: id,
    fileName: resolved,
    storagePath: storageRef("blob", resolved),
    path: blobDownloadPath(resolved),
    entry,
    contentType: entry.contentType || contentTypeFromFileName(resolved),
  }
}

export async function getCacheStatus(documentId?: string | null) {
  if (!documentId) {
    const [downloadCount, prepareCount, blobCount] = await Promise.all([
      mongoCache.countJsonCache("cosmos"),
      mongoCache.countJsonCache("prepare"),
      mongoCache.countBlobCache(),
    ])
    return {
      document: null,
      prepare: null,
      blob: null,
      downloadCount,
      prepareCount,
      blobCount,
    }
  }

  const id = sanitizeDocumentId(documentId)
  const [
    cosmosEntry,
    prepareEntry,
    blobHit,
    downloadCount,
    prepareCount,
    blobCount,
  ] = await Promise.all([
    mongoCache.getJsonCacheMeta("cosmos", id),
    mongoCache.getJsonCacheMeta("prepare", id),
    mongoCache.findBlobByDocumentId(id),
    mongoCache.countJsonCache("cosmos"),
    mongoCache.countJsonCache("prepare"),
    mongoCache.countBlobCache(),
  ])

  return {
    document: cosmosEntry ? ("cache" as const) : null,
    prepare: prepareEntry ? ("cache" as const) : null,
    blob: blobHit ? ("cache" as const) : null,
    downloadEntry: cosmosEntry,
    prepareEntry,
    blobEntry: blobHit?.entry ?? null,
    downloadCount,
    prepareCount,
    blobCount,
  }
}

export async function getBatchCacheStatus(documentIds: string[]) {
  const pages: Record<
    string,
    { document: boolean; prepare: boolean; blob: boolean; complete: boolean }
  > = {}

  await Promise.all(
    documentIds.map(async (rawId) => {
      const id = sanitizeDocumentId(rawId)
      const [hasDownload, hasPrepare, blobHit] = await Promise.all([
        mongoCache.hasJsonCache("cosmos", id),
        mongoCache.hasJsonCache("prepare", id),
        mongoCache.findBlobByDocumentId(id),
      ])
      pages[id] = {
        document: hasDownload,
        prepare: hasPrepare,
        blob: Boolean(blobHit),
        complete: hasDownload && hasPrepare,
      }
    })
  )

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
  const flushId = resolveFlushDocumentId(options?.documentId)

  const kinds: CacheKind[] =
    requested === "all" || requested === "download"
      ? ["cosmos", "prepare", "blob"]
      : [requested]

  const removed: string[] = []
  for (const current of kinds) {
    const result = await mongoCache.flushCacheKind(current, flushId)
    removed.push(...result)
  }

  return { ok: true, removed }
}
