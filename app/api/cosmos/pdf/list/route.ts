import { listCachedBlobs } from "@/lib/local-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** List PDFs cached under download/blob (from manifest.json). */
export async function GET() {
  try {
    const items = await listCachedBlobs()
    return Response.json({
      ok: true,
      count: items.length,
      items,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list cached PDFs"
    console.error("[pdf/list]", message)
    return Response.json({ error: message }, { status: 500 })
  }
}
