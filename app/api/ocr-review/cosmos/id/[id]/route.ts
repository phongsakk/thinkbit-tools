import {
  cosmosGetDocumentById,
  cosmosGetDocumentByIdInContainer,
  cosmosUpsertDocumentInContainer,
  getCorrectedContainerId,
} from "@/lib/cosmos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const decodedId = decodeURIComponent(id).trim()
    if (!decodedId) {
      return Response.json({ error: "id is required" }, { status: 400 })
    }

    const correctedId = getCorrectedContainerId()
    try {
      const corrected = await cosmosGetDocumentByIdInContainer(
        correctedId,
        decodedId
      )
      if (corrected) {
        return Response.json({ item: corrected, source: "corrected" })
      }
    } catch {
      // corrected container may not exist yet
    }

    const item = await cosmosGetDocumentById(decodedId)
    if (!item) {
      return Response.json({ error: "document not found" }, { status: 404 })
    }
    return Response.json({ item, source: "original" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const notFound = /404|not found/i.test(message)
    return Response.json(
      { error: message },
      { status: notFound ? 404 : 502 }
    )
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const decodedId = decodeURIComponent(id).trim()
    const doc = (await request.json()) as Record<string, unknown>

    if (!doc || doc.id !== decodedId) {
      return Response.json(
        { error: "body.id ต้องตรงกับ :id" },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    doc.updatedAt = now
    doc.correctedAt = now

    const correctedId = getCorrectedContainerId()
    const resource = await cosmosUpsertDocumentInContainer(correctedId, doc)
    console.log(
      `[ocr-review/cosmos] saved corrected → ${decodedId} (container: ${correctedId})`
    )
    return Response.json({ item: resource, source: "corrected" })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
