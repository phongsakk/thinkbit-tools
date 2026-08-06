import type { Metadata } from "next"

import {
  UploadHistoryPanel,
} from "@/components/upload-history/upload-history-panel"
import {
  normalizeWarehouses,
  readSearchManifest,
  readWarehouseManifest,
} from "@/lib/upload-history-cache"
import { getCachedUploadHistory } from "@/lib/upload-history-service"

export const metadata: Metadata = {
  title: "ชุดอัปโหลด",
  description: "ดูชุดอัปโหลดเอกสารแบบจัดกลุ่มตาม batch / คลัง / ช่วงธุรกรรม",
}

export const dynamic = "force-dynamic"

function asSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") return [value]
  return []
}

export default async function UploadBatchesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const fromTime = asSingle(sp.from_time) ?? ""
  const toTime = asSingle(sp.to_time) ?? ""
  const warehousesSelected = normalizeWarehouses(asList(sp.warehouse))
  const forceFresh = asSingle(sp.fresh) === "1"

  const filters = {
    fromTime: fromTime || undefined,
    toTime: toTime || undefined,
    warehouses: warehousesSelected,
  }

  // SSR: cache only. Missing / expired / fresh=1 → empty UI; panel fetches Cosmos.
  const data = forceFresh ? null : await getCachedUploadHistory(filters)
  const needsClientFetch = !data
  const warehouses = data?.warehouses ?? (await readWarehouseManifest())
  const searchHistory = data?.searchHistory ?? (await readSearchManifest())

  return (
    <UploadHistoryPanel
      fromTime={fromTime}
      toTime={toTime}
      warehousesSelected={warehousesSelected}
      groups={data?.groups ?? []}
      warehouses={warehouses}
      requestCharge={data?.requestCharge}
      source={data?.source}
      savedAt={data?.savedAt}
      cacheKey={data?.cacheKey}
      searchHistory={searchHistory}
      needsClientFetch={needsClientFetch}
      forceFresh={forceFresh}
    />
  )
}
