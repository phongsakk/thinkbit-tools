import JSZip from "jszip"

import { readCachedPrepareJson, readCachedRawJson } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ZipPage = {
  id: string
  page?: string
}

type ZipBody = {
  kind?: "raw" | "prepared"
  docId?: string
  batchId?: string
  pages?: ZipPage[]
}

function safePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown"
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ZipBody
    const kind = body.kind
    const docId = body.docId?.trim() || "DOC"
    const batchId = body.batchId?.trim() || "batch"
    const pages = Array.isArray(body.pages) ? body.pages : []

    if (kind !== "raw" && kind !== "prepared") {
      return Response.json({ error: "kind must be raw or prepared" }, { status: 400 })
    }
    if (pages.length === 0) {
      return Response.json({ error: "pages are required" }, { status: 400 })
    }

    const zip = new JSZip()
    let included = 0

    for (const page of pages) {
      const pageName = safePart(page.page || page.id)
      const fileName = `${pageName}.json`
      if (kind === "raw") {
        const raw = await readCachedRawJson(page.id)
        if (!raw) continue
        zip.file(fileName, raw.content)
        included += 1
      } else {
        const prepared = await readCachedPrepareJson(page.id)
        if (!prepared) continue
        zip.file(fileName, prepared.content)
        included += 1
      }
    }

    if (included === 0) {
      return Response.json(
        { error: `No ${kind} cache files available for this DOC`, included: 0 },
        { status: 404 }
      )
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    const fileName = `${safePart(batchId)}_${safePart(docId)}_${kind}.zip`

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Included-Files": String(included),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build zip"
    return Response.json({ error: message }, { status: 500 })
  }
}
