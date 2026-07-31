"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"

import { DeviceGeolocation, DeviceGeolocationSkeleton } from "@/components/health/device-geolocation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type CheckResult = {
  name: string
  ok: boolean
  latencyMs: number
  error?: string
}

type HealthResponse = {
  ok: boolean
  totalMs: number
  now: string
  checks: CheckResult[]
}

type PingResponse = {
  ok?: boolean
}

const CHECK_ICONS: Record<string, typeof Database> = {
  cosmos: Database,
  blob: HardDrive,
  localCache: Activity,
}

const CHECK_LABELS: Record<string, string> = {
  cosmos: "Cosmos",
  blob: "Blob",
  localCache: "Cache",
}

function HealthStatusSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
        <Skeleton className="size-4 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {["cosmos", "blob", "cache"].map((key) => (
          <div
            key={key}
            className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-3.5 shrink-0" />
                <Skeleton className="h-3.5 w-14" />
              </div>
              <Skeleton className="size-3.5 shrink-0 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function HealthSummary() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pingText = await fetch("/api/ping", { cache: "no-store" }).then((r) => r.text())
      let pingData: PingResponse | null = null
      try {
        pingData = JSON.parse(pingText) as PingResponse
      } catch {
        throw new Error(
          pingText.startsWith("<!DOCTYPE")
            ? "Ping failed: Unexpected HTML response"
            : `Ping failed: ${pingText.slice(0, 160)}`
        )
      }
      if (!pingData?.ok) throw new Error("Ping failed: API not ready")

      const text = await fetch("/api/health", { cache: "no-store" }).then((r) => r.text())
      try {
        setData(JSON.parse(text) as HealthResponse)
      } catch {
        setError(
          text.startsWith("<!DOCTYPE") ? "Unexpected HTML response" : text.slice(0, 220)
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runCheck()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [runCheck])

  const checkedAt = data
    ? new Date(data.now).toLocaleString("th-TH", { hour12: false })
    : null

  const showHealthSkeleton = loading && !data && !error

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">System Health</h2>
          <p className="text-[11px] text-slate-400">Live summary</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void runCheck()}
            className="h-8 border-slate-600 bg-slate-800/80 px-2.5 text-slate-100 hover:bg-slate-700"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Link
            href="/health"
            className="rounded-md px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
          >
            Details
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {showHealthSkeleton ? <HealthStatusSkeleton /> : null}

      {data && !showHealthSkeleton ? (
        <div className={cn("space-y-3", loading && "opacity-70")}>
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2",
              data.ok
                ? "border-emerald-500/40 bg-emerald-950/30"
                : "border-red-700/50 bg-red-950/30"
            )}
          >
            {data.ok ? (
              <CheckCircle2 className="size-4 text-emerald-400" />
            ) : (
              <XCircle className="size-4 text-red-400" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">
                {data.ok ? "All systems operational" : "Some checks failed"}
              </div>
              <div className="text-[11px] text-slate-400">
                {data.totalMs}ms total
                {checkedAt ? ` · ${checkedAt}` : ""}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {data.checks.map((check) => {
              const Icon = CHECK_ICONS[check.name] ?? Activity
              const label = CHECK_LABELS[check.name] ?? check.name
              return (
                <div
                  key={check.name}
                  className={cn(
                    "rounded-xl border px-3 py-2",
                    check.ok
                      ? "border-slate-700 bg-slate-900/60"
                      : "border-red-800/60 bg-red-950/20"
                  )}
                  title={check.error}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-200">
                      <Icon className="size-3.5 text-slate-400" />
                      {label}
                    </div>
                    {check.ok ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="size-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{check.latencyMs}ms</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <Suspense fallback={<DeviceGeolocationSkeleton />}>
          <DeviceGeolocation />
        </Suspense>
      </div>
    </section>
  )
}
