import { flushCache, getCacheStatus } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const documentId = new URL(request.url).searchParams.get("documentId")
    const status = await getCacheStatus(documentId)
    return Response.json({ ok: true, ...status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read cache status"
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      kind?: "cosmos" | "prepare" | "download" | "all"
      documentId?: string
    }

    const result = await flushCache({
      kind: body.kind ?? "all",
      documentId: body.documentId,
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to flush cache"
    return Response.json({ error: message }, { status: 500 })
  }
}
