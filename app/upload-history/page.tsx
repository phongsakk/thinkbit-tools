import type { Metadata } from "next"

import {
  UploadHistoryPanel,
} from "@/components/upload-history/upload-history-panel"
import { normalizeWarehouses } from "@/lib/upload-history-cache"
import { getUploadHistory } from "@/lib/upload-history-service"

export const metadata: Metadata = {
  title: "Upload History",
  description: "Upload batches with server-side filters and cache",
}

export const dynamic = "force-dynamic"
export const maxDuration = 60

function asSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") return [value]
  return []
}

export default async function UploadHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const fromTime = asSingle(sp.from_time) ?? ""
  const toTime = asSingle(sp.to_time) ?? ""
  const warehousesSelected = normalizeWarehouses(asList(sp.warehouse))
  const forceFresh = asSingle(sp.fresh) === "1"

  let error: string | undefined
  let data: Awaited<ReturnType<typeof getUploadHistory>> | null = null
  try {
    data = await getUploadHistory(forceFresh, {
      fromTime: fromTime || undefined,
      toTime: toTime || undefined,
      warehouses: warehousesSelected,
    })
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load upload history"
    console.error("[upload-history/page]", error)
  }

  return (
    <UploadHistoryPanel
      fromTime={fromTime}
      toTime={toTime}
      warehousesSelected={warehousesSelected}
      groups={data?.groups ?? []}
      warehouses={data?.warehouses ?? []}
      requestCharge={data?.requestCharge}
      source={data?.source}
      savedAt={data?.savedAt}
      cacheKey={data?.cacheKey}
      searchHistory={data?.searchHistory}
      error={error}
    />
  )
}
