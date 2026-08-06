import { cosmosSearchDocumentGroups } from "@/lib/cosmos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q")?.trim() || ""
    if (!q || q.length < 2) {
      return Response.json({ items: [] })
    }
    const items = await cosmosSearchDocumentGroups(q)
    return Response.json({ items })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
