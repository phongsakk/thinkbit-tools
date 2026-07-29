import { cosmosSqlQuery } from "@/lib/cosmos"
import {
  extractUploadTimestamp,
  getUploadHistoryStoragePath,
  isUploadHistoryFresh,
  readUploadHistoryCache,
  writeUploadHistoryCache,
  type UploadHistoryGroup,
  type UploadHistoryPayload,
} from "@/lib/upload-history-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type LiteItem = {
  id?: string
  blobFileName?: string
}

async function buildUploadHistory(): Promise<UploadHistoryPayload> {
  const counts = new Map<string, number>()
  let continuationToken: string | null = null
  let pages = 0
  let itemsLoaded = 0
  let ru = 0
  const maxPages = 40

  do {
    const result = await cosmosSqlQuery<LiteItem>(
      "SELECT c.id, c.blobFileName FROM c",
      [],
      {
        maxItemCount: 100,
        continuationToken,
      }
    )

    for (const item of result.items) {
      if (typeof item.blobFileName !== "string") continue
      const ts = extractUploadTimestamp(item.blobFileName)
      if (!ts) continue
      counts.set(ts, (counts.get(ts) ?? 0) + 1)
      itemsLoaded += 1
    }

    if (typeof result.requestCharge === "number") {
      ru += result.requestCharge
    }
    continuationToken = result.continuationToken
    pages += 1
  } while (continuationToken && pages < maxPages)

  const groups: UploadHistoryGroup[] = Array.from(counts.entries())
    .map(([timestamp, count]) => ({ timestamp, count }))
    .sort((a, b) => {
      const an = Number(a.timestamp)
      const bn = Number(b.timestamp)
      if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an
      return b.timestamp.localeCompare(a.timestamp)
    })

  return writeUploadHistoryCache({
    groups,
    totalItems: itemsLoaded,
    requestCharge: ru > 0 ? ru : null,
    truncated: Boolean(continuationToken),
  })
}

async function getUploadHistory(forceFresh: boolean) {
  if (!forceFresh) {
    const cached = await readUploadHistoryCache()
    if (cached && isUploadHistoryFresh(cached)) {
      return { ...cached, source: "cache" as const }
    }
  }

  const fresh = await buildUploadHistory()
  return { ...fresh, source: "fresh" as const }
}

export async function GET(request: Request) {
  try {
    const forceFresh = new URL(request.url).searchParams.get("fresh") === "1"
    const payload = await getUploadHistory(forceFresh)
    return Response.json({
      ok: true,
      ...payload,
      storagePath: getUploadHistoryStoragePath(),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load upload history"
    console.error("[upload-history]", message)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean }
    const forceFresh = body.force !== false
    const payload = await getUploadHistory(forceFresh)
    return Response.json({
      ok: true,
      ...payload,
      storagePath: getUploadHistoryStoragePath(),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to refresh upload history"
    console.error("[upload-history]", message)
    return Response.json({ error: message }, { status: 500 })
  }
}
