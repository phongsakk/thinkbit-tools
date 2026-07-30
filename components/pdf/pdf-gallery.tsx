"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CachedPdfItem = {
  documentId: string
  fileName: string
  blobFileName?: string[]
  contentType?: string
  savedAt: string
  path: string
  pageLabel: string
}

type ListResponse = {
  ok?: boolean
  count?: number
  items?: CachedPdfItem[]
  error?: string
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

function formatSavedAt(value: string) {
  try {
    return new Date(value).toLocaleString("th-TH", { hour12: false })
  } catch {
    return value
  }
}

export function PdfGallery() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<CachedPdfItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/cosmos/pdf/list", { cache: "no-store" })
      const data = await readApiPayload<ListResponse>(response)
      if (!response.ok) {
        throw new Error(data.error || "Failed to load PDF list")
      }
      setItems(data.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
              <FileText className="size-3.5" />
              PDF Cache
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Cached PDFs
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Files from <code className="text-slate-300">download/blob</code> via{" "}
              <code className="text-slate-300">manifest.json</code>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
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
          <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        )}

        <div className="mb-4 text-xs text-slate-400">{items.length} PDF(s)</div>

        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="mb-2 size-6 animate-spin" />
            Loading cached PDFs…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-6 py-16 text-center">
            <FileText className="mx-auto mb-3 size-8 text-slate-600" />
            <p className="text-sm text-slate-400">No cached PDFs yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Use the PDF button in{" "}
              <Link href="/cosmos" className="text-cyan-300 hover:underline">
                Cosmos Explorer
              </Link>{" "}
              to download pages
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.documentId}
                className={cn(
                  "overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70 shadow-xl",
                  "transition hover:border-cyan-500/40 hover:shadow-cyan-500/5"
                )}
              >
                <div className="relative h-56 bg-slate-900">
                  <iframe
                    title={item.pageLabel}
                    src={`${item.path}#toolbar=0&navpanes=0&scrollbar=0`}
                    className="h-full w-full border-0"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-2 p-3">
                  <div className="truncate text-sm font-medium text-white" title={item.pageLabel}>
                    {item.pageLabel}
                  </div>
                  <div
                    className="truncate font-mono text-[11px] text-slate-500"
                    title={item.documentId}
                  >
                    {item.documentId}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatSavedAt(item.savedAt)}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 text-xs font-medium text-slate-950 hover:bg-cyan-400"
                    >
                      <ExternalLink className="size-3.5" />
                      Open
                    </a>
                    <Link
                      href={`/cosmos?id=${encodeURIComponent(item.documentId)}`}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 px-3 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Cosmos
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
