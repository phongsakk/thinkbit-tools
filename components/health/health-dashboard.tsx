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

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#cccccc]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">System Health</h1>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void runCheck()}
            className="h-8 border-[#555] bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3a3a3a] hover:text-white"
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
          <div className="mb-4 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Overall banner */}
            <div
              className={cn(
                "mb-6 flex items-center gap-3 rounded-lg border px-4 py-3",
                data.ok
                  ? "border-emerald-800 bg-emerald-950/30"
                  : "border-red-800 bg-red-950/30"
              )}
            >
              <StatusIcon ok={data.ok} />
              <div>
                <div className="font-medium text-white">
                  {data.ok ? "All systems operational" : "Some checks failed"}
                </div>
                <div className="text-xs text-[#999]">
                  {data.service} · Node {data.node}
                  {data.vercel ? ` · Vercel ${data.vercelEnv ?? ""} (${data.region ?? "?"})` : " · Self-hosted"}
                  {" · "}
                  {data.totalMs}ms total
                </div>
              </div>
            </div>

            {/* Individual checks */}
            <div className="space-y-3">
              {data.checks.map((check) => {
                const Icon = CHECK_ICONS[check.name] ?? Activity
                const label = CHECK_LABELS[check.name] ?? check.name
                return (
                  <div
                    key={check.name}
                    className={cn(
                      "rounded-lg border px-4 py-3",
                      check.ok
                        ? "border-[#333] bg-[#252525]"
                        : "border-red-900 bg-red-950/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Icon className="size-4 text-[#999]" />
                        <span className="font-medium text-white">{label}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-[#888]">
                          {check.latencyMs}ms
                        </span>
                        <StatusIcon ok={check.ok} />
                      </div>
                    </div>

                    {check.error && (
                      <div className="mt-2 rounded bg-red-950/40 px-3 py-2 font-mono text-xs text-red-300">
                        {check.error}
                      </div>
                    )}

                    {check.ok && check.details && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#888]">
                        {Object.entries(check.details).map(([key, val]) => (
                          <span key={key}>
                            <span className="text-[#aaa]">{key}:</span>{" "}
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

            <div className="mt-4 text-right text-xs text-[#666]">
              Last checked: {data.now}
            </div>
          </>
        )}

        {!data && !error && loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-[#666]" />
          </div>
        )}
      </div>
    </div>
  )
}
