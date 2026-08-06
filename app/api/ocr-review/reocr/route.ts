import { downloadBlobByFileName } from "@/lib/azure-blob"
import {
  asciiSafeFilename,
  postPdfToOcr,
} from "@/lib/ocr-review/upstream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    let blobFileName = url.searchParams.get("blobFileName")?.trim() || ""
    let filename = url.searchParams.get("filename")?.trim() || ""

    if (!blobFileName) {
      try {
        const body = (await request.json()) as {
          blobFileName?: string
          filename?: string
        }
        blobFileName = body.blobFileName?.trim() || ""
        filename = body.filename?.trim() || filename
      } catch {
        // no JSON body
      }
    }

    if (!blobFileName) {
      return Response.json({ error: "blobFileName required" }, { status: 400 })
    }

    const downloaded = await downloadBlobByFileName(blobFileName)
    const displayName = (
      filename ||
      blobFileName.split("/").pop() ||
      "document.pdf"
    ).replace(/\.pdf_page\d+$/i, ".pdf")

    const { status, data } = await postPdfToOcr({
      pdf: downloaded.buffer,
      filename: asciiSafeFilename(displayName),
      fast: false,
    })

    return Response.json(data, { status })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const notFound = /404|not found/i.test(message)
    return Response.json(
      { error: message },
      { status: notFound ? 404 : 502 }
    )
  }
}
