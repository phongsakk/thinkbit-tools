import type { Metadata } from "next"
import { headers } from "next/headers"

import {
  UploadHistoryPanel,
  type SearchHistoryEntry,
  type UploadGroup,
} from "@/components/upload-history/upload-history-panel"
import { normalizeWarehouses } from "@/lib/upload-history-cache"

export const metadata: Metadata = {
  title: "Upload History",
  description: "Upload batches with server-side filters and cache",
}

type UploadHistoryResponse = {
  ok?: boolean
  groups?: UploadGroup[]
  warehouses?: string[]
  totalItems?: number
  requestCharge?: number | null
  source?: "cache" | "fresh"
  savedAt?: string
  expiresAt?: string
  cacheKey?: string
  storagePath?: string
  searchHistory?: SearchHistoryEntry[]
  error?: string
}

function asSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") return [value]
  return []
}

async function loadUploadHistory(
  params: URLSearchParams
): Promise<UploadHistoryResponse> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? "http"
  const url = `${proto}://${host}/api/cosmos/upload-history${
    params.toString() ? `?${params.toString()}` : ""
  }`

  const response = await fetch(url, { cache: "no-store" })
  const text = await response.text()
  let data: UploadHistoryResponse = {}
  try {
    data = JSON.parse(text) as UploadHistoryResponse
  } catch {
    data = { error: text.slice(0, 300) || `Unexpected response (${response.status})` }
  }
  if (!response.ok) {
    return { error: data.error || "Failed to load upload history" }
  }
  return data
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

  const apiParams = new URLSearchParams()
  if (fromTime) apiParams.set("from_time", fromTime)
  if (toTime) apiParams.set("to_time", toTime)
  for (const warehouse of warehousesSelected) {
    apiParams.append("warehouse", warehouse)
  }
  if (forceFresh) apiParams.set("fresh", "1")

  const data = await loadUploadHistory(apiParams)

  return (
    <UploadHistoryPanel
      fromTime={fromTime}
      toTime={toTime}
      warehousesSelected={warehousesSelected}
      groups={data.groups ?? []}
      warehouses={data.warehouses ?? []}
      requestCharge={data.requestCharge}
      source={data.source}
      savedAt={data.savedAt}
      cacheKey={data.cacheKey}
      searchHistory={data.searchHistory}
      error={data.error}
    />
  )
}
