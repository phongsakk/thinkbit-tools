"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eraser, Loader2, RefreshCw, Search, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { WarehouseSearchSelect } from "@/components/upload-history/warehouse-search-select"
import {
  dateTimeLocalToIso,
  formatDateTime,
  formatUnixTimestamp,
  toDateTimeLocalValue,
} from "@/lib/time"
import { cn } from "@/lib/utils"

export type UploadGroup = {
  timestamp: string
  factory_id: string
  transaction_period: string
  count: number
}

export type SearchHistoryEntry = {
  cacheKey: string
  fromTime: string | null
  toTime: string | null
  warehouses: string[]
  savedAt: string
  storagePath: string
}

export type UploadHistoryPanelProps = {
  fromTime: string
  toTime: string
  warehousesSelected: string[]
  groups: UploadGroup[]
  warehouses: string[]
  requestCharge?: number | null
  source?: "cache" | "fresh"
  savedAt?: string
  cacheKey?: string
  searchHistory?: SearchHistoryEntry[]
  error?: string
}

function buildHref(params: {
  fromTime?: string
  toTime?: string
  warehouses?: string[]
  fresh?: boolean
}) {
  const url = new URLSearchParams()
  if (params.fromTime) url.set("from_time", params.fromTime)
  if (params.toTime) url.set("to_time", params.toTime)
  for (const warehouse of params.warehouses ?? []) {
    if (warehouse) url.append("warehouse", warehouse)
  }
  if (params.fresh) url.set("fresh", "1")
  url.set("_q", String(Date.now()))
  const qs = url.toString()
  return qs ? `/upload-history?${qs}` : "/upload-history"
}

function formatWarehousesLabel(warehouses: string[]) {
  if (warehouses.length === 0) return "ทุกคลัง"
  if (warehouses.length <= 3) return warehouses.join(", ")
  return `${warehouses.slice(0, 2).join(", ")} +${warehouses.length - 2}`
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr
          key={index}
          className={cn(
            "border-t border-slate-800/80",
            index % 2 === 0 ? "bg-slate-950/40" : "bg-slate-900/30"
          )}
        >
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-700/70" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-14 animate-pulse rounded bg-slate-700/70" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-700/70" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-36 animate-pulse rounded bg-slate-700/70" />
          </td>
          <td className="px-4 py-3 text-right">
            <div className="ml-auto h-4 w-10 animate-pulse rounded bg-slate-700/70" />
          </td>
          <td className="px-4 py-3 text-right">
            <div className="ml-auto h-4 w-24 animate-pulse rounded bg-slate-700/70" />
          </td>
        </tr>
      ))}
    </>
  )
}

export function UploadHistoryPanel({
  fromTime,
  toTime,
  warehousesSelected,
  groups,
  warehouses,
  requestCharge,
  source,
  savedAt,
  cacheKey,
  searchHistory = [],
  error,
}: UploadHistoryPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [fromValue, setFromValue] = useState(toDateTimeLocalValue(fromTime))
  const [toValue, setToValue] = useState(toDateTimeLocalValue(toTime))
  const [warehouseValue, setWarehouseValue] = useState(warehousesSelected)

  useEffect(() => {
    setFromValue(toDateTimeLocalValue(fromTime))
    setToValue(toDateTimeLocalValue(toTime))
    setWarehouseValue(warehousesSelected)
  }, [fromTime, toTime, warehousesSelected])

  function navigate(href: string) {
    startTransition(() => {
      router.push(href)
    })
  }

  function onFilter(e: FormEvent) {
    e.preventDefault()
    navigate(
      buildHref({
        fromTime: dateTimeLocalToIso(fromValue),
        toTime: dateTimeLocalToIso(toValue),
        warehouses: warehouseValue,
      })
    )
  }

  function onRefresh() {
    navigate(
      buildHref({
        fromTime: fromTime || undefined,
        toTime: toTime || undefined,
        warehouses: warehousesSelected,
        fresh: true,
      })
    )
  }

  function onClear() {
    navigate("/upload-history")
  }

  const inputClass =
    "h-9 rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
              <Upload className="size-3.5" />
              Upload History (Server Side)
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Upload batches</h1>
            <p className="mt-1 text-xs text-slate-400">
              SSR table + filter ผ่าน query params
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 border-slate-500 bg-slate-800/80 px-3 text-slate-100 hover:bg-slate-700"
            type="button"
            disabled={isPending}
            onClick={onRefresh}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        <form
          onSubmit={onFilter}
          className="mb-4 grid gap-2 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 md:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            ตั้งแต่เวลาอัปโหลด
            <input
              type="datetime-local"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              disabled={isPending}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            ถึงเวลาอัปโหลด
            <input
              type="datetime-local"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
              disabled={isPending}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            คลัง
            <WarehouseSearchSelect
              value={warehouseValue}
              warehouses={warehouses}
              disabled={isPending}
              onChange={setWarehouseValue}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="h-9 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}
              Search
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={onClear}
              className="h-9 border-slate-600 bg-slate-900 px-3 text-slate-100 hover:bg-slate-800"
            >
              <Eraser className="size-3.5" />
              Clear
            </Button>
          </div>
        </form>

        {searchHistory.length > 0 ? (
          <div className="mb-4 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
            <div className="mb-2 text-xs text-slate-400">ประวัติการค้นหา (จาก cache)</div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((entry) => {
                const href = buildHref({
                  fromTime: entry.fromTime ?? undefined,
                  toTime: entry.toTime ?? undefined,
                  warehouses: entry.warehouses,
                })
                return (
                  <button
                    key={entry.cacheKey}
                    type="button"
                    disabled={isPending}
                    onClick={() => navigate(href)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50",
                      cacheKey === entry.cacheKey
                        ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200"
                        : "border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    )}
                    title={entry.storagePath}
                  >
                    <div className="font-medium">
                      {formatWarehousesLabel(entry.warehouses)} ·{" "}
                      {formatDateTime(entry.fromTime, "ไม่กำหนด")} →{" "}
                      {formatDateTime(entry.toTime, "ไม่กำหนด")}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-400">
          {isPending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              กำลังโหลด…
            </span>
          ) : (
            <>
              <span>{groups.length} groups</span>
              {requestCharge != null ? (
                <>
                  <span>·</span>
                  <span>{requestCharge.toFixed(2)} RU</span>
                </>
              ) : null}
              {savedAt ? (
                <>
                  <span>·</span>
                  <span>
                    {source === "cache" ? "Cache" : "Fresh"} ·{" "}
                    {formatDateTime(savedAt)}
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-xl">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/90 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">factory_id</th>
                <th className="px-4 py-3 font-medium">ช่วงธุรกรรม</th>
                <th className="px-4 py-3 font-medium">Local time</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <TableSkeleton />
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No upload groups found
                  </td>
                </tr>
              ) : (
                groups.map((group, index) => (
                  <tr
                    key={`${group.timestamp}-${group.factory_id}-${group.transaction_period}`}
                    className={cn(
                      "border-t border-slate-800/80",
                      index % 2 === 0 ? "bg-slate-950/40" : "bg-slate-900/30",
                      "hover:bg-cyan-500/5"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-cyan-200">{group.timestamp}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{group.factory_id}</td>
                    <td className="px-4 py-3 text-slate-200">{group.transaction_period}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatUnixTimestamp(group.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                      {group.count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/doc-workbench?unixtime=${encodeURIComponent(group.timestamp)}`}
                        className="text-xs text-cyan-300 hover:text-cyan-200 hover:underline"
                      >
                        Open in Cosmos
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
