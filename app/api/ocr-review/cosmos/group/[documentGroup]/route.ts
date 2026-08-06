import {
  cosmosQueryByDocumentGroupPrefix,
  getCorrectedContainerId,
} from "@/lib/cosmos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type RouteContext = {
  params: Promise<{ documentGroup: string }>
}

type DocItem = Record<string, unknown> & {
  id?: string
  pageNumber?: string | number
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { documentGroup } = await context.params
    const dg = decodeURIComponent(documentGroup).trim()
    if (!dg) {
      return Response.json(
        { error: "documentGroup is required" },
        { status: 400 }
      )
    }

    const resources = await cosmosQueryByDocumentGroupPrefix<DocItem>(dg)
    resources.sort(
      (a, b) => (Number(a.pageNumber) || 0) - (Number(b.pageNumber) || 0)
    )

    try {
      const correctedId = getCorrectedContainerId()
      const correctedItems =
        await cosmosQueryByDocumentGroupPrefix<DocItem>(dg, correctedId)
      if (correctedItems.length) {
        const map = new Map(
          correctedItems
            .filter((d) => typeof d.id === "string")
            .map((d) => [d.id as string, d])
        )
        for (let i = 0; i < resources.length; i++) {
          const id = resources[i].id
          if (typeof id === "string" && map.has(id)) {
            resources[i] = map.get(id)!
          }
        }
      }
    } catch {
      // corrected container unavailable — use originals
    }

    return Response.json({ items: resources, count: resources.length })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
