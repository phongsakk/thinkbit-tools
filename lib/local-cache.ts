import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export type CacheSource = "cache" | "fresh"

export type CacheKind = "cosmos" | "prepare" | "blob"

export type ManifestEntry = {
  savedAt: string
  fileName: string
  docType?: string
  url?: string
  blobFileName?: string
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

export async function getCachedBlob(documentId: string) {
  const id = sanitizeDocumentId(documentId)
  const manifest = await readManifest("blob")
  const entry = manifest.entries[id] ?? null
  const filePath = getItemPath("blob", id, entry?.fileName)

  if (!(await fileExists(filePath))) {
    return null
  }

  const buffer = await readFile(filePath)
  const fileName = entry?.fileName ?? path.basename(filePath)
  return {
    buffer,
    source: "cache" as const,
    entry,
    storagePath: filePath,
    fileName,
    contentType:
      entry?.contentType ||
      contentTypeFromFileName(fileName),
    path: `/download/blob/${id}`,
  }
}

export async function saveBlobFile(
  documentId: string,
  buffer: Buffer,
  meta: { blobFileName: string; contentType?: string; fileName?: string }
) {
  const id = sanitizeDocumentId(documentId)
  await ensureDir("blob")

  const originalName =
    meta.fileName?.trim() ||
    meta.blobFileName.split("/").pop()?.trim() ||
    "page.pdf"
  const ext = extensionFromFileName(originalName)
  const fileName = `${id}${ext}`
  const filePath = getItemPath("blob", id, fileName)
  await writeFile(filePath, buffer)

  const contentType =
    meta.contentType && meta.contentType !== "application/octet-stream"
      ? meta.contentType
      : contentTypeFromFileName(fileName)

  const manifest = await readManifest("blob")
  manifest.entries[id] = {
    savedAt: new Date().toISOString(),
    fileName,
    blobFileName: meta.blobFileName,
    contentType,
  }
  await writeManifest("blob", manifest)

  return {
    documentId: id,
    fileName,
    storagePath: filePath,
    path: `/download/blob/${id}`,
    entry: manifest.entries[id],
    contentType,
  }
}

export async function getCacheStatus(documentId?: string | null) {
  const cosmosManifest = await readManifest("cosmos")
  const prepareManifest = await readManifest("prepare")
  const blobManifest = await readManifest("blob")

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
  const blobEntry = blobManifest.entries[id]
  const hasBlob =
    Boolean(blobEntry) ||
    (await fileExists(getItemPath("blob", id, blobEntry?.fileName)))

  return {
    document: hasDownload ? ("cache" as const) : null,
    prepare: hasPrepare ? ("cache" as const) : null,
    blob: hasBlob ? ("cache" as const) : null,
    downloadEntry: cosmosManifest.entries[id] ?? null,
    prepareEntry: prepareManifest.entries[id] ?? null,
    blobEntry: blobEntry ?? null,
    downloadCount: Object.keys(cosmosManifest.entries).length,
    prepareCount: Object.keys(prepareManifest.entries).length,
    blobCount: Object.keys(blobManifest.entries).length,
  }
}

export async function getBatchCacheStatus(documentIds: string[]) {
  const cosmosManifest = await readManifest("cosmos")
  const prepareManifest = await readManifest("prepare")
  const blobManifest = await readManifest("blob")
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
    const blobEntry = blobManifest.entries[id]
    const hasBlob =
      Boolean(blobEntry) ||
      (await fileExists(getItemPath("blob", id, blobEntry?.fileName)))
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
