"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { ChevronRight, Home, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CosmosItem = Record<string, unknown> & {
  id?: string
  blobFileName?: string
  docType?: string
  page_number?: number | string
  pageNumber?: number | string
  pageCount?: number | string
}

type QueryResponse = {
  items: CosmosItem[]
  continuationToken: string | null
  hasMore: boolean
  requestCharge?: number
  databaseId?: string
  containerId?: string
  error?: string
}

const DEFAULT_QUERY =
  'SELECT * FROM c WHERE c.docType like "%05-03%" and (IS_DEFINED(c.pageNumber) = false or c.pageNumber = "1" or c.pageNumber = 1)'

const TABLE_COLUMNS = ["id", "blobFileName", "docType", "page_number"] as const

function cellValue(item: CosmosItem, key: (typeof TABLE_COLUMNS)[number]): string {
  const value =
    key === "page_number"
      ? (item.page_number ?? item.pageNumber ?? item.pageCount)
      : item[key]
  if (value == null || value === "") return "—"
  return String(value)
}

function JsonViewer({ value }: { value: unknown }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])
  const lines = text.split("\n")

  return (
    <div className="h-full overflow-auto bg-[#1e1e1e] font-mono text-[13px] leading-5 text-[#d4d4d4]">
      <div className="inline-block min-w-full">
        {lines.map((line, index) => (
          <div key={index} className="flex hover:bg-white/5">
            <span className="sticky left-0 w-12 shrink-0 select-none bg-[#1e1e1e] pr-3 text-right text-[#858585]">
              {index + 1}
            </span>
            <pre className="m-0 whitespace-pre-wrap break-all px-3">
              {highlightJsonLine(line)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function highlightJsonLine(line: string) {
  const parts: ReactNode[] = []
  const regex =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`} className="text-[#d4d4d4]">
          {line.slice(lastIndex, match.index)}
        </span>
      )
    }

    const [full, stringLiteral, colon, keyword] = match

    if (stringLiteral) {
      parts.push(
        <span
          key={`s-${match.index}`}
          className={colon ? "text-[#9cdcfe]" : "text-[#ce9178]"}
        >
          {stringLiteral}
        </span>
      )
      if (colon) {
        parts.push(
          <span key={`c-${match.index}`} className="text-[#d4d4d4]">
            {colon}
          </span>
        )
      }
    } else if (keyword) {
      parts.push(
        <span key={`k-${match.index}`} className="text-[#569cd6]">
          {keyword}
        </span>
      )
    } else if (/^-?\d/.test(full)) {
      parts.push(
        <span key={`n-${match.index}`} className="text-[#b5cea8]">
          {full}
        </span>
      )
    } else {
      parts.push(
        <span key={`p-${match.index}`} className="text-[#d4d4d4]">
          {full}
        </span>
      )
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < line.length) {
    parts.push(
      <span key={`t-${lastIndex}`} className="text-[#d4d4d4]">
        {line.slice(lastIndex)}
      </span>
    )
  }

  return parts
}

export function CosmosExplorer() {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [appliedQuery, setAppliedQuery] = useState(DEFAULT_QUERY)
  const [items, setItems] = useState<CosmosItem[]>([])
  const [continuationToken, setContinuationToken] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState({ databaseId: "document-data", containerId: "doc-data" })
  const [requestCharge, setRequestCharge] = useState<number | null>(null)

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  )

  const fetchItems = useCallback(
    async (options: { queryText: string; token?: string | null; append?: boolean }) => {
      const isAppend = Boolean(options.append)
      if (isAppend) setLoadingMore(true)
      else setLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/cosmos/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: options.queryText,
            continuationToken: options.token ?? null,
            maxItemCount: 50,
          }),
        })

        const data = (await response.json()) as QueryResponse
        if (!response.ok) {
          throw new Error(data.error || "Failed to query Cosmos DB")
        }

        setItems((prev) => (isAppend ? [...prev, ...data.items] : data.items))
        setContinuationToken(data.continuationToken)
        setHasMore(data.hasMore)
        setRequestCharge(data.requestCharge ?? null)
        if (data.databaseId && data.containerId) {
          setMeta({ databaseId: data.databaseId, containerId: data.containerId })
        }

        if (!isAppend) {
          setCheckedIds(new Set())
          const firstId = data.items[0]?.id
          setSelectedId(typeof firstId === "string" ? firstId : null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Query failed")
        if (!isAppend) {
          setItems([])
          setSelectedId(null)
          setContinuationToken(null)
          setHasMore(false)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    []
  )

  useEffect(() => {
    void fetchItems({ queryText: DEFAULT_QUERY })
  }, [fetchItems])

  function applyFilter() {
    setAppliedQuery(query)
    void fetchItems({ queryText: query })
  }

  function loadMore() {
    if (!continuationToken || loadingMore) return
    void fetchItems({
      queryText: appliedQuery,
      token: continuationToken,
      append: true,
    })
  }

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllChecked() {
    if (checkedIds.size === items.length) {
      setCheckedIds(new Set())
      return
    }
    setCheckedIds(
      new Set(items.map((item) => item.id).filter((id): id is string => typeof id === "string"))
    )
  }

  return (
    <div className="flex h-svh flex-col bg-[#f3f2f1] text-[#323130]">
      <header className="flex h-10 items-center gap-1 border-b border-[#edebe9] bg-white px-3 text-sm">
        <Home className="size-4 text-[#605e5c]" />
        <ChevronRight className="size-3.5 text-[#a19f9d]" />
        <span className="text-[#605e5c]">{meta.databaseId}</span>
        <ChevronRight className="size-3.5 text-[#a19f9d]" />
        <span className="font-medium text-[#323130]">{meta.containerId} Items</span>
      </header>

      <div className="flex border-b border-[#edebe9] bg-[#faf9f8] px-2 pt-1">
        <div className="flex items-center gap-2 rounded-t border border-b-0 border-[#edebe9] bg-white px-3 py-1.5 text-sm shadow-sm">
          <span className="max-w-[180px] truncate">{meta.containerId} Items</span>
          <button
            type="button"
            className="rounded p-0.5 text-[#605e5c] hover:bg-[#f3f2f1]"
            aria-label="Close tab"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-stretch gap-2 border-b border-[#edebe9] bg-white px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                applyFilter()
              }
            }}
            rows={2}
            spellCheck={false}
            className="w-full resize-y rounded border border-[#8a8886] bg-white px-3 py-2 font-mono text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
          />
        </div>
        <Button
          type="button"
          onClick={applyFilter}
          disabled={loading}
          className="h-auto self-start rounded-sm bg-[#0078d4] px-4 text-white hover:bg-[#106ebe]"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Apply Filter
        </Button>
      </div>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col border-r border-[#edebe9] bg-white">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#faf9f8]">
                <tr className="border-b border-[#edebe9] text-[#605e5c]">
                  <th className="w-10 px-3 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && checkedIds.size === items.length}
                      onChange={toggleAllChecked}
                      className="size-3.5 accent-[#0078d4]"
                      aria-label="Select all"
                    />
                  </th>
                  {TABLE_COLUMNS.map((column) => (
                    <th key={column} className="px-3 py-2 font-medium whitespace-nowrap">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-[#605e5c]">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Querying Cosmos DB…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-[#605e5c]">
                      No items found
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => {
                    const id = typeof item.id === "string" ? item.id : `row-${index}`
                    const selected = selectedId === item.id
                    return (
                      <tr
                        key={id}
                        onClick={() => setSelectedId(typeof item.id === "string" ? item.id : null)}
                        className={cn(
                          "cursor-pointer border-b border-[#f3f2f1] hover:bg-[#f3f2f1]",
                          selected && "bg-[#deecf9] hover:bg-[#c7e0f4]"
                        )}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checkedIds.has(id)}
                            onChange={() => toggleChecked(id)}
                            className="size-3.5 accent-[#0078d4]"
                            aria-label={`Select ${id}`}
                          />
                        </td>
                        {TABLE_COLUMNS.map((column) => (
                          <td
                            key={column}
                            className="max-w-[220px] truncate px-3 py-2 whitespace-nowrap"
                            title={cellValue(item, column)}
                          >
                            {cellValue(item, column)}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#edebe9] bg-[#faf9f8] px-3 py-2 text-xs text-[#605e5c]">
            <span>
              {items.length} item{items.length === 1 ? "" : "s"}
              {requestCharge != null ? ` · ${requestCharge.toFixed(2)} RU` : ""}
            </span>
            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-sm border-[#8a8886] bg-white"
              >
                {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Load more
              </Button>
            ) : (
              <span>End of results</span>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-[#1e1e1e]">
          <div className="flex items-center justify-between border-b border-[#333] px-3 py-1.5 text-xs text-[#cccccc]">
            <span>{selectedItem?.id ? `Document · ${selectedItem.id}` : "Document JSON"}</span>
            <span className="text-[#858585]">read-only</span>
          </div>
          <div className="min-h-0 flex-1">
            {selectedItem ? (
              <JsonViewer value={selectedItem} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#858585]">
                Select an item to view JSON
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
