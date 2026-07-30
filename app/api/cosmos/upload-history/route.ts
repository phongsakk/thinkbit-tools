import {
  getUploadHistory,
  type UploadHistoryFilters,
} from "@/lib/upload-history-service"
import { normalizeWarehouses } from "@/lib/upload-history-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const forceFresh = url.searchParams.get("fresh") === "1"
    const warehouses = normalizeWarehouses(url.searchParams.getAll("warehouse"))
    const payload = await getUploadHistory(forceFresh, {
      fromTime: url.searchParams.get("from_time") ?? undefined,
      toTime: url.searchParams.get("to_time") ?? undefined,
      warehouses,
    })
    return Response.json({
      ok: true,
      ...payload,
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
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean
      from_time?: string
      to_time?: string
      warehouse?: string | string[]
      warehouses?: string | string[]
    }
    const forceFresh = body.force !== false
    const filters: UploadHistoryFilters = {
      fromTime: body.from_time,
      toTime: body.to_time,
      warehouses: body.warehouses ?? body.warehouse,
    }
    const payload = await getUploadHistory(forceFresh, filters)
    return Response.json({
      ok: true,
      ...payload,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to refresh upload history"
    console.error("[upload-history]", message)
    return Response.json({ error: message }, { status: 500 })
  }
}
