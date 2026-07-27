import { getBatchCacheStatus } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type BatchBody = {
  documentIds?: string[]
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BatchBody
    const documentIds = Array.isArray(body.documentIds)
      ? body.documentIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : []

    if (documentIds.length === 0) {
      return Response.json({ pages: {} })
    }

    const result = await getBatchCacheStatus(documentIds)
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read batch cache status"
    return Response.json({ error: message }, { status: 500 })
  }
}
