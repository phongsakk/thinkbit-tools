import { Binary, type Collection, type Db } from "mongodb"
import { getMongoDb } from "@/lib/providers/mongodb"
import type {
  BlobCacheDocument,
  CacheKind,
  JsonCacheDocument,
  ManifestEntry,
  ManifestFile,
} from "./types"
import {
  contentTypeFromFileName,
  mergeBlobFileNames,
  mergeDocumentIds,
  normalizeBlobFileNames,
  toBuffer,
} from "./helpers"

const COLLECTION = {
  cosmos: "cache_cosmos",
  prepare: "cache_prepare",
  blob: "cache_blob",
} as const

async function getDb(): Promise<Db> {
  return getMongoDb()
}

async function jsonCollection(
  kind: "cosmos" | "prepare"
): Promise<Collection<JsonCacheDocument>> {
  const db = await getDb()
  return db.collection<JsonCacheDocument>(COLLECTION[kind])
}

async function blobCollection(): Promise<Collection<BlobCacheDocument>> {
  const db = await getDb()
  return db.collection<BlobCacheDocument>(COLLECTION.blob)
}

function entryFromJsonDoc(doc: JsonCacheDocument): ManifestEntry {
  return {
    savedAt: doc.savedAt,
    fileName: doc.fileName,
    docType: doc.docType,
    url: doc.url,
  }
}

function entryFromBlobDoc(doc: BlobCacheDocument): ManifestEntry {
  return {
    savedAt: doc.savedAt,
    fileName: doc.fileName,
    contentType: doc.contentType,
    blobFileName: normalizeBlobFileNames(doc.blobFileName),
    documentIds: mergeDocumentIds(doc.documentIds),
  }
}

export async function getJsonCache(
  kind: "cosmos" | "prepare",
  documentId: string
): Promise<{ data: Record<string, unknown>; entry: ManifestEntry } | null> {
  const col = await jsonCollection(kind)
  const doc = await col.findOne({ _id: documentId })
  if (!doc?.data || typeof doc.data !== "object") return null
  return {
    data: doc.data,
    entry: entryFromJsonDoc(doc),
  }
}

export async function saveJsonCache(
  kind: "cosmos" | "prepare",
  documentId: string,
  data: Record<string, unknown>,
  meta?: { docType?: string; url?: string }
): Promise<ManifestEntry> {
  const col = await jsonCollection(kind)
  const savedAt = new Date().toISOString()
  const fileName = `${documentId}.json`
  const entry: ManifestEntry = {
    savedAt,
    fileName,
    docType: meta?.docType,
    url: meta?.url,
  }

  await col.updateOne(
    { _id: documentId },
    {
      $set: {
        _id: documentId,
        kind,
        fileName,
        savedAt,
        docType: meta?.docType,
        url: meta?.url,
        data,
      },
    },
    { upsert: true }
  )

  return entry
}

export async function deleteJsonCache(
  kind: "cosmos" | "prepare",
  documentId: string
) {
  const col = await jsonCollection(kind)
  await col.deleteOne({ _id: documentId })
}

export async function getJsonCacheMeta(
  kind: "cosmos" | "prepare",
  documentId: string
): Promise<ManifestEntry | null> {
  const col = await jsonCollection(kind)
  const doc = await col.findOne(
    { _id: documentId },
    { projection: { data: 0 } }
  )
  if (!doc) return null
  return entryFromJsonDoc(doc)
}

export async function hasJsonCache(
  kind: "cosmos" | "prepare",
  documentId: string
) {
  const col = await jsonCollection(kind)
  const doc = await col.findOne({ _id: documentId }, { projection: { _id: 1 } })
  return Boolean(doc)
}

export async function countJsonCache(kind: "cosmos" | "prepare") {
  const col = await jsonCollection(kind)
  return col.countDocuments()
}

export async function getJsonManifest(
  kind: "cosmos" | "prepare"
): Promise<ManifestFile> {
  const col = await jsonCollection(kind)
  const docs = await col
    .find(
      {},
      {
        projection: {
          _id: 1,
          fileName: 1,
          savedAt: 1,
          docType: 1,
          url: 1,
        },
      }
    )
    .toArray()

  const entries: Record<string, ManifestEntry> = {}
  for (const doc of docs) {
    entries[doc._id] = {
      savedAt: doc.savedAt,
      fileName: doc.fileName || `${doc._id}.json`,
      docType: doc.docType,
      url: doc.url,
    }
  }
  return { version: 1, entries }
}

export async function getBlobCache(fileName: string): Promise<{
  buffer: Buffer
  entry: ManifestEntry
  fileName: string
} | null> {
  const resolved = fileName.trim()
  if (!resolved) return null

  const col = await blobCollection()
  const doc = await col.findOne({ _id: resolved })
  if (!doc) return null

  const buffer = toBuffer(doc.data)
  if (!buffer) return null

  return {
    buffer,
    fileName: doc.fileName || resolved,
    entry: entryFromBlobDoc(doc),
  }
}

export async function getBlobCacheMeta(
  fileName: string
): Promise<ManifestEntry | null> {
  const col = await blobCollection()
  const doc = await col.findOne(
    { _id: fileName },
    { projection: { data: 0 } }
  )
  if (!doc) return null
  return entryFromBlobDoc(doc as BlobCacheDocument)
}

export async function listBlobCacheMeta(): Promise<
  Array<{ fileName: string; entry: ManifestEntry }>
> {
  const col = await blobCollection()
  const docs = await col.find({}, { projection: { data: 0 } }).toArray()
  return docs.map((doc) => ({
    fileName: doc.fileName || doc._id,
    entry: entryFromBlobDoc(doc as BlobCacheDocument),
  }))
}

export async function getBlobManifest(): Promise<ManifestFile> {
  const items = await listBlobCacheMeta()
  const entries: Record<string, ManifestEntry> = {}
  for (const item of items) {
    entries[item.fileName] = {
      ...item.entry,
      fileName: item.fileName,
      blobFileName: normalizeBlobFileNames(item.entry.blobFileName),
      documentIds: mergeDocumentIds(item.entry.documentIds),
    }
  }
  return { version: 1, entries }
}

export async function findBlobByDocumentId(documentId: string): Promise<{
  fileName: string
  entry: ManifestEntry
} | null> {
  const col = await blobCollection()
  const doc = await col.findOne(
    { documentIds: documentId },
    { projection: { data: 0 } }
  )
  if (!doc) return null
  return {
    fileName: doc.fileName || doc._id,
    entry: entryFromBlobDoc(doc as BlobCacheDocument),
  }
}

export async function saveBlobCache(
  fileName: string,
  buffer: Buffer,
  meta: {
    blobFileName?: string | string[]
    documentIds?: string | string[]
    contentType?: string
  }
): Promise<ManifestEntry> {
  const col = await blobCollection()
  const existing = await col.findOne(
    { _id: fileName },
    { projection: { data: 0 } }
  )

  const savedAt = new Date().toISOString()
  const contentType =
    meta.contentType && meta.contentType !== "application/octet-stream"
      ? meta.contentType
      : existing?.contentType || contentTypeFromFileName(fileName)

  const blobFileName = mergeBlobFileNames(
    existing?.blobFileName,
    meta.blobFileName
  )
  const documentIds = mergeDocumentIds(existing?.documentIds, meta.documentIds)

  const entry: ManifestEntry = {
    savedAt,
    fileName,
    contentType,
    blobFileName,
    documentIds,
  }

  await col.updateOne(
    { _id: fileName },
    {
      $set: {
        _id: fileName,
        fileName,
        savedAt,
        contentType,
        blobFileName,
        documentIds,
        data: new Binary(new Uint8Array(buffer)),
      },
    },
    { upsert: true }
  )

  return entry
}

export async function updateBlobCacheMeta(
  fileName: string,
  patch: {
    savedAt?: string
    contentType?: string
    blobFileName?: string[]
    documentIds?: string[]
  }
): Promise<ManifestEntry | null> {
  const col = await blobCollection()
  const existing = await col.findOne(
    { _id: fileName },
    { projection: { data: 0 } }
  )
  if (!existing) return null

  const next: ManifestEntry = {
    savedAt: patch.savedAt || existing.savedAt || new Date().toISOString(),
    fileName,
    contentType: patch.contentType || existing.contentType,
    blobFileName: patch.blobFileName
      ? normalizeBlobFileNames(patch.blobFileName)
      : normalizeBlobFileNames(existing.blobFileName),
    documentIds: patch.documentIds
      ? mergeDocumentIds(patch.documentIds)
      : mergeDocumentIds(existing.documentIds),
  }

  await col.updateOne(
    { _id: fileName },
    {
      $set: {
        savedAt: next.savedAt,
        contentType: next.contentType,
        blobFileName: next.blobFileName,
        documentIds: next.documentIds,
        fileName,
      },
    }
  )

  return next
}

export async function deleteBlobCache(fileName: string) {
  const col = await blobCollection()
  await col.deleteOne({ _id: fileName })
}

export async function unlinkDocumentFromOtherBlobs(
  documentId: string,
  keepFileName: string
) {
  const col = await blobCollection()
  const others = await col
    .find(
      {
        _id: { $ne: keepFileName },
        documentIds: documentId,
      },
      { projection: { data: 0 } }
    )
    .toArray()

  for (const doc of others) {
    const remaining = mergeDocumentIds(doc.documentIds).filter(
      (id) => id !== documentId
    )
    if (remaining.length === 0) {
      await col.deleteOne({ _id: doc._id })
    } else {
      await col.updateOne(
        { _id: doc._id },
        { $set: { documentIds: remaining } }
      )
    }
  }
}

export async function countBlobCache() {
  const col = await blobCollection()
  return col.countDocuments()
}

export async function flushCacheKind(
  kind: CacheKind,
  documentId?: string | null
): Promise<string[]> {
  const removed: string[] = []

  if (kind === "blob") {
    const col = await blobCollection()
    if (!documentId) {
      const result = await col.deleteMany({})
      if (result.deletedCount > 0) {
        removed.push(`mongodb://cache/blob/* (${result.deletedCount})`)
      }
      return removed
    }

    const asFileName = /\.(pdf|png|jpe?g|tiff?)$/i.test(documentId)
      ? documentId
      : null

    let doc =
      (asFileName
        ? await col.findOne({ _id: asFileName }, { projection: { data: 0 } })
        : null) ||
      (await col.findOne(
        { documentIds: documentId },
        { projection: { data: 0 } }
      ))

    if (!doc && asFileName) {
      doc = await col.findOne(
        { fileName: asFileName },
        { projection: { data: 0 } }
      )
    }

    if (!doc) return removed

    const byFile = Boolean(
      asFileName && (doc._id === asFileName || doc.fileName === asFileName)
    )
    const remaining = mergeDocumentIds(doc.documentIds).filter(
      (id) => id !== documentId
    )
    const removeFile = byFile || remaining.length === 0

    if (removeFile) {
      await col.deleteOne({ _id: doc._id })
      removed.push(`mongodb://cache/blob/${doc.fileName || doc._id}`)
    } else {
      await col.updateOne(
        { _id: doc._id },
        { $set: { documentIds: remaining } }
      )
    }
    return removed
  }

  const col = await jsonCollection(kind)
  if (!documentId) {
    const result = await col.deleteMany({})
    if (result.deletedCount > 0) {
      removed.push(`mongodb://cache/${kind}/* (${result.deletedCount})`)
    }
    return removed
  }

  const result = await col.deleteOne({ _id: documentId })
  if (result.deletedCount > 0) {
    removed.push(`mongodb://cache/${kind}/${documentId}`)
  }
  return removed
}

export async function ensureCacheIndexes() {
  const cosmos = await jsonCollection("cosmos")
  const prepare = await jsonCollection("prepare")
  const blob = await blobCollection()

  await Promise.all([
    cosmos.createIndex({ savedAt: -1 }),
    prepare.createIndex({ savedAt: -1 }),
    blob.createIndex({ documentIds: 1 }),
    blob.createIndex({ savedAt: -1 }),
  ])
}
