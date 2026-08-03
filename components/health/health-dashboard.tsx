"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Activity,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CheckResult = {
  name: string
  ok: boolean
  latencyMs: number
  error?: string
  details?: Record<string, unknown>
}

type HealthResponse = {
  ok: boolean
  service: string
  node: string
  vercel: boolean
  vercelEnv: string | null
  region: string | null
  totalMs: number
  now: string
  checks: CheckResult[]
  error?: string
}

type PingResponse = {
  ok?: boolean
  service?: string
  now?: string
}

const CHECK_ICONS: Record<string, typeof Database> = {
  cosmos: Database,
  blob: HardDrive,
  localCache: Activity,
}

const CHECK_LABELS: Record<string, string> = {
  cosmos: "Azure Cosmos DB",
  blob: "Azure Blob Storage",
  localCache: "Local Cache",
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="size-5 text-emerald-500" />
  ) : (
    <XCircle className="size-5 text-red-500" />
  )
}

export function HealthDashboard() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pingText = await fetch("/api/ping", { cache: "no-store" }).then((r) =>
        r.text()
      )
      let pingData: PingResponse | null = null
      try {
        pingData = JSON.parse(pingText) as PingResponse
      } catch {
        throw new Error(
          pingText.startsWith("<!DOCTYPE")
            ? "Ping failed: Unexpected HTML response"
            : `Ping failed: ${pingText.slice(0, 200)}`
        )
      }
      if (!pingData?.ok) {
        throw new Error("Ping failed: API not ready")
      }

      const text = await fetch("/api/health", { cache: "no-store" }).then((r) =>
        r.text()
      )
      try {
        setData(JSON.parse(text) as HealthResponse)
      } catch {
        setError(text.startsWith("<!DOCTYPE") ? "Unexpected HTML response" : text.slice(0, 300))
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
    ? new Date(data.now).toLocaleString("th-TH", {
        hour12: false,
      })
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
              <Activity className="size-3.5" />
              Thinkbit · Oil Tax
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">สุขภาพระบบ</h1>
            <p className="mt-1 text-xs text-slate-400">
              ตรวจสถานะ Cosmos, Blob Storage และ local cache
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void runCheck()}
            className="h-9 border-slate-500 bg-slate-800/80 px-3 text-slate-100 hover:bg-slate-700"
          >
            {loading ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {data && (
          <>
            <div
              className={cn(
                "mb-6 rounded-2xl border p-4 shadow-lg backdrop-blur",
                data.ok
                  ? "border-emerald-500/40 bg-emerald-950/40"
                  : "border-red-700/60 bg-red-950/35"
              )}
            >
              <div className="flex items-start gap-3">
                <StatusIcon ok={data.ok} />
                <div>
                  <div className="text-base font-semibold text-white">
                    {data.ok ? "All systems operational" : "Some checks failed"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    {data.service} · Node {data.node}
                    {data.vercel
                      ? ` · Vercel ${data.vercelEnv ?? ""} (${data.region ?? "?"})`
                      : " · Self-hosted"}
                    {" · "}
                    {data.totalMs}ms total
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {data.checks.map((check) => {
                const Icon = CHECK_ICONS[check.name] ?? Activity
                const label = CHECK_LABELS[check.name] ?? check.name
                return (
                  <div
                    key={check.name}
                    className={cn(
                      "rounded-xl border px-4 py-3 shadow-sm",
                      check.ok
                        ? "border-slate-700 bg-slate-900/70"
                        : "border-red-800/70 bg-red-950/25"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Icon className="size-4 text-slate-300" />
                        <span className="font-medium text-white">{label}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-slate-400">
                          {check.latencyMs}ms
                        </span>
                        <StatusIcon ok={check.ok} />
                      </div>
                    </div>

                    {check.error && (
                      <div className="mt-2 rounded-lg bg-red-950/40 px-3 py-2 font-mono text-xs text-red-300">
                        {check.error}
                      </div>
                    )}

                    {check.ok && check.details && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        {Object.entries(check.details).map(([key, val]) => (
                          <span key={key}>
                            <span className="text-slate-300">{key}:</span>{" "}
                            {typeof val === "object" && val
                              ? JSON.stringify(val)
                              : String(val ?? "—")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 text-right text-xs text-slate-500">
              Last checked: {checkedAt ?? data.now}
            </div>
          </>
        )}

        {!data && !error && loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-slate-500" />
          </div>
        )}
      </div>
    </div>
  )
}
