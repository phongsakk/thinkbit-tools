import { downloadBlobByFileName, formatUnknownError } from "@/lib/azure-blob"
import { cosmosGetDocumentById, cosmosReplaceDocument } from "@/lib/cosmos"
import {
  buildBlobCacheFileName,
  flushCache,
  getCachedBlob,
  getCachedBlobSharingMonthYear,
  getCachedDocument,
  linkBlobCacheEntry,
  saveBlobFile,
} from "@/lib/local-cache"
import { extractOcrFieldsFromResponse } from "@/lib/ocr-process-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const DEFAULT_OCR_URL =
  "https://api-ocr-staging.devthinkbit.com/process/multi?fast=false"

type OcrBody = {
  documentId?: string
  blobFileName?: string
}

function getOcrProcessUrl() {
  return (
    process.env.OCR_PROCESS_URL?.trim() ||
    process.env.OCR_MULTI_URL?.trim() ||
    DEFAULT_OCR_URL
  )
}

function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff"
  return "application/octet-stream"
}

async function ensurePdfCached(documentId: string, blobFileName: string) {
  const existing = await getCachedBlob(documentId)
  if (existing) {
    const linked = await linkBlobCacheEntry(documentId, blobFileName, {
      fileName: existing.fileName,
      contentType: existing.contentType,
    })
    const cached = await getCachedBlob(linked.fileName)
    if (cached) {
      return {
        buffer: cached.buffer,
        fileName: cached.fileName,
        contentType: cached.contentType,
        path: cached.path,
        source: "cache" as const,
      }
    }
  }

  const shared = await getCachedBlobSharingMonthYear(blobFileName)
  if (shared) {
    const linked = await linkBlobCacheEntry(documentId, blobFileName, {
      fileName: shared.fileName,
      contentType: shared.contentType,
    })
    return {
      buffer: shared.buffer,
      fileName: linked.fileName,
      contentType: linked.contentType,
      path: linked.path,
      source: "cache" as const,
    }
  }

  const downloaded = await downloadBlobByFileName(blobFileName)
  const saved = await saveBlobFile(documentId, downloaded.buffer, {
    blobFileName,
    contentType:
      downloaded.contentType || contentTypeFromFileName(downloaded.fileName),
    fileName: buildBlobCacheFileName(blobFileName),
  })

  return {
    buffer: downloaded.buffer,
    fileName: saved.fileName,
    contentType: saved.contentType,
    path: saved.path,
    source: "fresh" as const,
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OcrBody
    const documentId = body.documentId?.trim()
    let blobFileName = body.blobFileName?.trim() || ""

    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 })
    }

    // Prefer fresh Cosmos doc so we don't overwrite with a stale cache base.
    let cosmosDoc =
      (await cosmosGetDocumentById<Record<string, unknown>>(documentId)) ?? null
    if (!cosmosDoc) {
      const cached = await getCachedDocument(documentId)
      cosmosDoc = cached?.item ?? null
    }
    if (!cosmosDoc) {
      return Response.json({ error: "Document not found" }, { status: 404 })
    }

    if (!blobFileName) {
      blobFileName =
        typeof cosmosDoc.blobFileName === "string" ? cosmosDoc.blobFileName : ""
    }
    if (!blobFileName) {
      return Response.json(
        { error: "blobFileName is required (not on request or document)" },
        { status: 400 }
      )
    }

    const pdf = await ensurePdfCached(documentId, blobFileName)

    const form = new FormData()
    form.append(
      "file",
      new File([new Uint8Array(pdf.buffer)], pdf.fileName, {
        type: pdf.contentType || "application/pdf",
      })
    )

    const ocrUrl = getOcrProcessUrl()
    const ocrResponse = await fetch(ocrUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      cache: "no-store",
    })

    const ocrText = await ocrResponse.text()
    let ocrJson: unknown = null
    try {
      ocrJson = ocrText ? JSON.parse(ocrText) : null
    } catch {
      ocrJson = null
    }

    if (!ocrResponse.ok) {
      return Response.json(
        {
          error: `OCR API failed (${ocrResponse.status})`,
          url: ocrUrl,
          details: ocrJson ?? ocrText.slice(0, 500),
        },
        { status: 502 }
      )
    }

    if (!ocrJson) {
      return Response.json(
        { error: "OCR API returned non-JSON body", details: ocrText.slice(0, 500) },
        { status: 502 }
      )
    }

    const fields = extractOcrFieldsFromResponse(ocrJson)
    const updatedAt = new Date().toISOString()
    const updatedDoc: Record<string, unknown> = {
      ...cosmosDoc,
      fields,
      updatedAt,
    }

    const savedCosmos = await cosmosReplaceDocument(updatedDoc)

    // New OCR invalidates local fetch + prepare caches for this page.
    await flushCache({ kind: "cosmos", documentId })
    await flushCache({ kind: "prepare", documentId })

    return Response.json({
      ok: true,
      documentId,
      item: savedCosmos,
      source: "fresh",
      pdf: {
        source: pdf.source,
        fileName: pdf.fileName,
        path: pdf.path,
      },
      ocrUrl,
      updatedAt,
      flushed: ["cosmos", "prepare"],
    })
  } catch (error) {
    const message = formatUnknownError(error, "OCR process failed")
    console.error("[cosmos/ocr] POST failed", message)
    const status = /schema mismatch/i.test(message) ? 502 : 500
    return Response.json({ error: message }, { status })
  }
}
