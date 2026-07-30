"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type UploadGroup = {
  timestamp: string
  factory_id: string
  transaction_period: string
  count: number
}

type UploadHistoryResponse = {
  ok?: boolean
  savedAt?: string
  expiresAt?: string
  groups?: UploadGroup[]
  warehouses?: string[]
  totalItems?: number
  requestCharge?: number | null
  truncated?: boolean
  source?: "cache" | "fresh"
  storagePath?: string
  cacheKey?: string
  searchHistory?: SearchHistoryEntry[]
  error?: string
}

type SearchHistoryEntry = {
  cacheKey: string
  fromTime: string | null
  toTime: string | null
  warehouse: string | null
  savedAt: string
  storagePath: string
}

function formatTimestamp(ts: string) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return "—"
  const ms = ts.length >= 13 ? n : n * 1000
  try {
    return new Date(ms).toLocaleString("th-TH", { hour12: false })
  } catch {
    return "—"
  }
}

async function readApiPayload<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text()
  if (!text) return {} as T & { error?: string }
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    const trimmed = text.trim()
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      return { error: `Unexpected HTML response (${response.status})` } as T & {
        error?: string
      }
    }
    return {
      error: trimmed.slice(0, 300) || `Unexpected response (${response.status})`,
    } as T & { error?: string }
  }
}

export function UploadHistory() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<UploadGroup[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [requestCharge, setRequestCharge] = useState<number | null>(null)
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [warehouses, setWarehouses] = useState<string[]>([])
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([])
  const [cacheKey, setCacheKey] = useState<string | null>(null)
  const [fromTime, setFromTime] = useState("")
  const [toTime, setToTime] = useState("")
  const [warehouse, setWarehouse] = useState("")

  const loadHistory = useCallback(async (options?: {
    force?: boolean
    filters?: { fromTime?: string; toTime?: string; warehouse?: string }
  }) => {
    const force = Boolean(options?.force)
    const selectedFromTime = options?.filters?.fromTime ?? fromTime
    const selectedToTime = options?.filters?.toTime ?? toTime
    const selectedWarehouse = options?.filters?.warehouse ?? warehouse
    setLoading(true)
    setError(null)

    try {
      const search = new URLSearchParams()
      if (force) search.set("fresh", "1")
      if (selectedFromTime) search.set("from_time", new Date(selectedFromTime).toISOString())
      if (selectedToTime) search.set("to_time", new Date(selectedToTime).toISOString())
      if (selectedWarehouse) search.set("warehouse", selectedWarehouse)
      const query = search.toString()
      const response = await fetch(`/api/cosmos/upload-history${query ? `?${query}` : ""}`, {
        cache: "no-store",
      })
      const data = await readApiPayload<UploadHistoryResponse>(response)
      if (!response.ok) {
        throw new Error(data.error || "Failed to load upload history")
      }

      setGroups(data.groups ?? [])
      setTotalItems(data.totalItems ?? 0)
      setRequestCharge(data.requestCharge ?? null)
      setLoadedAt(data.savedAt ?? null)
      setExpiresAt(data.expiresAt ?? null)
      setFromCache(data.source === "cache")
      setStoragePath(data.storagePath ?? null)
      setCacheKey(data.cacheKey ?? null)
      setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : [])
      setSearchHistory(Array.isArray(data.searchHistory) ? data.searchHistory : [])

      if (data.truncated) {
        setError("Result was truncated (hit page limit). Refresh to retry.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed")
      setGroups([])
      setTotalItems(0)
      setRequestCharge(null)
      setFromCache(false)
      setExpiresAt(null)
      setStoragePath(null)
      setCacheKey(null)
      setWarehouses([])
      setSearchHistory([])
    } finally {
      setLoading(false)
    }
  }, [fromTime, toTime, warehouse])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const checkedAt = useMemo(() => {
    if (!loadedAt) return null
    return new Date(loadedAt).toLocaleString("th-TH", { hour12: false })
  }, [loadedAt])

  const cacheExpiresLabel = useMemo(() => {
    if (!expiresAt) return null
    return new Date(expiresAt).toLocaleString("th-TH", { hour12: false })
  }, [expiresAt])

  function toInputDateTime(value: string | null) {
    if (!value) return ""
    const d = new Date(value)
    if (!Number.isFinite(d.getTime())) return ""
    return d.toISOString().slice(0, 16)
  }

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
              <Upload className="size-3.5" />
              Upload History
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Upload batches
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Grouped by timestamp + factory_id + transaction period from{" "}
              <code className="text-slate-300">blobFileName</code> after the first{" "}
              <code className="text-slate-300">/</code>
              {" · "}API cache 1 hour in{" "}
              <code className="text-slate-300">download/upload-history</code>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void loadHistory({ force: true })}
            className="h-9 border-slate-500 bg-slate-800/80 px-3 text-slate-100 hover:bg-slate-700"
            title="Force refresh API cache"
          >
            {loading ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        <div className="mb-4 grid gap-2 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            ตั้งแต่เวลาอัปโหลด
            <input
              type="datetime-local"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="h-9 rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            ถึงเวลาอัปโหลด
            <input
              type="datetime-local"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="h-9 rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            คลัง
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="h-9 rounded-md border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100"
            >
              <option value="">ทั้งหมด</option>
              {warehouses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void loadHistory({ force: true })}
              className="h-9 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              Filter
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setFromTime("")
                setToTime("")
                setWarehouse("")
              }}
              className="h-9 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800"
            >
              Clear
            </Button>
          </div>
        </div>

        {searchHistory.length > 0 ? (
          <div className="mb-4 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
            <div className="mb-2 text-xs text-slate-400">ประวัติการค้นหา (จาก cache)</div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((entry) => (
                <button
                  key={entry.cacheKey}
                  type="button"
                  onClick={() => {
                    const nextFrom = toInputDateTime(entry.fromTime)
                    const nextTo = toInputDateTime(entry.toTime)
                    const nextWarehouse = entry.warehouse ?? ""
                    setFromTime(nextFrom)
                    setToTime(nextTo)
                    setWarehouse(nextWarehouse)
                    void loadHistory({
                      filters: {
                        fromTime: nextFrom,
                        toTime: nextTo,
                        warehouse: nextWarehouse,
                      },
                    })
                  }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition",
                    cacheKey === entry.cacheKey
                      ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200"
                      : "border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  )}
                  title={entry.storagePath}
                >
                  <div className="font-medium">
                    {entry.warehouse || "ทุกคลัง"} ·{" "}
                    {entry.fromTime ? new Date(entry.fromTime).toLocaleString("th-TH", { hour12: false }) : "ไม่กำหนด"}{" "}
                    →{" "}
                    {entry.toTime ? new Date(entry.toTime).toLocaleString("th-TH", { hour12: false }) : "ไม่กำหนด"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error && (
          <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>{groups.length} groups</span>
          <span>·</span>
          <span>{totalItems} items</span>
          {requestCharge != null ? (
            <>
              <span>·</span>
              <span>{requestCharge.toFixed(2)} RU</span>
            </>
          ) : null}
          {checkedAt ? (
            <>
              <span>·</span>
              <span>
                {fromCache ? "Cache" : "Fresh"} · {checkedAt}
              </span>
            </>
          ) : null}
          {cacheExpiresLabel ? (
            <>
              <span>·</span>
              <span>Expires {cacheExpiresLabel}</span>
            </>
          ) : null}
          {cacheKey ? (
            <>
              <span>·</span>
              <span>Key {cacheKey}</span>
            </>
          ) : null}
        </div>

        {storagePath ? (
          <div className="mb-3 truncate text-[11px] text-slate-500" title={storagePath}>
            {storagePath}
          </div>
        ) : null}

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
              {loading && groups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                    Loading upload history…
                  </td>
                </tr>
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
                    <td className="px-4 py-3 font-mono text-slate-200">
                      {group.factory_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{group.transaction_period}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatTimestamp(group.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                      {group.count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/cosmos?unixtime=${encodeURIComponent(group.timestamp)}`}
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
