import { downloadBlobByFileName, formatUnknownError } from "@/lib/azure-blob"
import {
  blobCacheMonthYearKey,
  getCachedBlob,
  getCachedBlobSharingMonthYear,
  linkBlobCacheEntry,
  parseBlobCacheFileName,
  parseBlobCacheNameParts,
  saveBlobFile,
} from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  return "application/octet-stream"
}

type PdfBody = {
  documentId?: string
  blobFileName?: string
}

/** Cache Azure blob under /download/blob/{documentId} (skips Azure when already cached). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PdfBody
    const documentId = body.documentId?.trim()
    const blobFileName = body.blobFileName?.trim()

    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }
    if (!blobFileName) {
      return Response.json({ error: "blobFileName is required" }, { status: 400 })
    }

    const existing = await getCachedBlob(documentId)
    if (existing) {
      const incoming = parseBlobCacheNameParts(blobFileName)
      const cached = parseBlobCacheFileName(existing.fileName)
      const sameMonthYear =
        !incoming ||
        !cached ||
        blobCacheMonthYearKey(incoming) === blobCacheMonthYearKey(cached)

      if (sameMonthYear) {
        // Ensure this source path is recorded on the shared cache entry.
        const linked = await linkBlobCacheEntry(documentId, blobFileName, {
          fileName: existing.fileName,
          contentType: existing.contentType,
        })
        return Response.json({
          ok: true,
          source: "cache",
          documentId,
          path: linked.path,
          fileName: linked.fileName,
          contentType: linked.contentType,
          blobFileName: linked.entry.blobFileName,
        })
      }
    }

    const shared = await getCachedBlobSharingMonthYear(blobFileName)
    if (shared) {
      const linked = await linkBlobCacheEntry(documentId, blobFileName, {
        fileName: shared.fileName,
        contentType: shared.contentType,
      })
      return Response.json({
        ok: true,
        source: "cache",
        documentId,
        path: linked.path,
        fileName: linked.fileName,
        contentType: linked.contentType,
        blobFileName: linked.entry.blobFileName,
      })
    }

    const { buffer, contentType, fileName } = await downloadBlobByFileName(blobFileName)
    const saved = await saveBlobFile(documentId, buffer, {
      blobFileName,
      contentType: contentType || contentTypeFromFileName(fileName),
    })

    return Response.json({
      ok: true,
      source: "fresh",
      documentId,
      path: saved.path,
      fileName: saved.fileName,
      contentType: saved.contentType,
      storagePath: saved.storagePath,
      blobFileName: saved.entry.blobFileName,
    })
  } catch (error) {
    const message = formatUnknownError(error, "PDF download failed")
    console.error("[cosmos/pdf] POST failed", message)
    const status = /not found|failed \(404\)/i.test(message) ? 404 : 500
    return Response.json({ error: message }, { status })
  }
}

/** Stream PDF: prefer local blob cache, otherwise fetch Azure (does not write cache). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get("documentId")?.trim()
    const blobFileName = searchParams.get("blobFileName")?.trim()

    if (documentId) {
      const cached = await getCachedBlob(documentId)
      if (cached) {
        return new Response(new Uint8Array(cached.buffer), {
          status: 200,
          headers: {
            "Content-Type": cached.contentType,
            "Content-Length": String(cached.buffer.byteLength),
            "Content-Disposition": `inline; filename="${cached.fileName.replace(/"/g, "")}"`,
            "Cache-Control": "no-store",
            "X-Cache-Source": "cache",
          },
        })
      }
    }

    if (!blobFileName) {
      return Response.json(
        {
          error: documentId
            ? "Blob not cached; blobFileName is required"
            : "blobFileName is required",
        },
        { status: documentId ? 404 : 400 }
      )
    }

    const { buffer, contentType, fileName } = await downloadBlobByFileName(blobFileName)

    const headers = new Headers()
    const isGenericType =
      !contentType || contentType === "application/octet-stream"
    headers.set(
      "Content-Type",
      isGenericType ? contentTypeFromFileName(fileName) : contentType
    )
    headers.set("Content-Length", String(buffer.byteLength))
    headers.set(
      "Content-Disposition",
      `inline; filename="${fileName.replace(/"/g, "")}"`
    )
    headers.set("Cache-Control", "no-store")
    headers.set("X-Cache-Source", "fresh")

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers,
    })
  } catch (error) {
    const message = formatUnknownError(error, "PDF download failed")
    console.error("[cosmos/pdf] GET failed", message)
    const status = /not found|failed \(404\)/i.test(message) ? 404 : 500
    return Response.json({ error: message }, { status })
  }
}
