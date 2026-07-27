"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ChevronRight, Download, FileText, FolderTree, Loader2, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CosmosItem = Record<string, unknown> & {
  id?: string
  blobFileName?: string
}

type QueryResponse = {
  items: CosmosItem[]
  continuationToken: string | null
  hasMore: boolean
  requestCharge?: number
  error?: string
}

type ItemResponse = {
  item?: CosmosItem
  error?: string
}
type PrepareResult = {
  ok?: boolean
  url?: string
  docType?: string
  documentId?: string
  data?: unknown
  details?: unknown
  error?: string
}

type FilterField = "id" | "docType" | "documentGroup" | "unixtime"
type FilterMode = "exact" | "like"

type AppliedFilter = {
  field: FilterField
  mode: FilterMode
  value: string
}

const selectClassName =
  "h-9 rounded border border-[#8a8886] bg-white px-2 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"

const inputClassName =
  "h-9 min-w-0 flex-1 rounded border border-[#8a8886] bg-white px-3 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"

type PageNode = {
  id: string
  page: string
  blobFileName: string
}

type DocNode = {
  docId: string
  pages: PageNode[]
}

type BatchNode = {
  batchId: string
  docs: DocNode[]
}

function parseBlobFileName(blobFileName: string) {
  const parts = blobFileName.split("/")
  const meta = parts.find((part) => /DOC\d+/i.test(part)) ?? parts[1] ?? ""
  const metaParts = meta.split("-")
  const batchIdMatch = meta.match(/\b(\d{10,})\b/)
  const batchId = batchIdMatch?.[1] ?? metaParts[1] ?? "unknown"
  const docId =
    metaParts.find((part) => /^DOC\d+/i.test(part)) ??
    meta.match(/DOC\d+/i)?.[0] ??
    "DOC_UNKNOWN"
  const fileName = parts[parts.length - 1] ?? ""
  const page = fileName.replace(/\.[^.]+$/, "") || fileName

  return { batchId, docId, page }
}

function buildTree(items: CosmosItem[]): BatchNode[] {
  const batchMap = new Map<string, Map<string, PageNode[]>>()

  for (const item of items) {
    if (typeof item.id !== "string" || typeof item.blobFileName !== "string") continue
    const { batchId, docId, page } = parseBlobFileName(item.blobFileName)
    if (!batchMap.has(batchId)) {
      batchMap.set(batchId, new Map())
    }
    const docMap = batchMap.get(batchId)!
    if (!docMap.has(docId)) {
      docMap.set(docId, [])
    }
    docMap.get(docId)!.push({ id: item.id, page, blobFileName: item.blobFileName })
  }

  const sortByPage = (a: PageNode, b: PageNode) =>
    a.page.localeCompare(b.page, undefined, { numeric: true, sensitivity: "base" })

  return Array.from(batchMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([batchId, docMap]) => ({
      batchId,
      docs: Array.from(docMap.entries())
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([docId, pages]) => ({
          docId,
          pages: pages.sort(sortByPage),
        })),
    }))
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
  const [field, setField] = useState<FilterField>("unixtime")
  const [mode, setMode] = useState<FilterMode>("like")
  const [value, setValue] = useState("")
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>({
    field: "unixtime",
    mode: "like",
    value: "",
  })
  const [items, setItems] = useState<CosmosItem[]>([])
  const [continuationToken, setContinuationToken] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedBlobFileName, setSelectedBlobFileName] = useState<string | null>(null)
  const [document, setDocument] = useState<CosmosItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchingDocument, setFetchingDocument] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestCharge, setRequestCharge] = useState<number | null>(null)
  const [preparePaneWidth, setPreparePaneWidth] = useState(380)
  const [hasSearched, setHasSearched] = useState(false)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const rightSplitRef = useRef<HTMLDivElement | null>(null)
  const tree = useMemo(() => (hasSearched ? buildTree(items) : []), [hasSearched, items])

  const fetchItems = useCallback(
    async (filter: AppliedFilter, options?: { append?: boolean }) => {
      const append = Boolean(options?.append)
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/cosmos/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field: filter.field,
            mode: filter.mode,
            value: filter.value,
            selectLite: true,
            maxItemCount: 120,
            continuationToken: append ? continuationToken : null,
          }),
        })

        const data = (await response.json()) as QueryResponse
        if (!response.ok) {
          throw new Error(data.error || "Failed to query Cosmos DB")
        }

        setItems((prev) => (append ? [...prev, ...data.items] : data.items))
        setContinuationToken(data.continuationToken)
        setHasMore(Boolean(data.continuationToken))
        setRequestCharge((prev) => (append ? (prev ?? 0) + (data.requestCharge ?? 0) : (data.requestCharge ?? 0)))

        if (!append) {
          setSelectedId(null)
          setSelectedBlobFileName(null)
          setDocument(null)
          setExpandedBatches(new Set())
          setExpandedDocs(new Set())
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Query failed")
        if (!append) {
          setItems([])
          setContinuationToken(null)
          setHasMore(false)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [continuationToken]
  )

  useEffect(() => {
    setPrepareResult(null)
    setDocument(null)
  }, [selectedId])

  function applyFilter() {
    const nextFilter: AppliedFilter = {
      field,
      mode,
      value: value.trim(),
    }
    setHasSearched(true)
    setAppliedFilter(nextFilter)
    void fetchItems(nextFilter)
  }

  function loadMoreLiteRows() {
    if (!hasMore || loadingMore) return
    void fetchItems(appliedFilter, { append: true })
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  function toggleDoc(batchId: string, docId: string) {
    const key = `${batchId}/${docId}`
    setExpandedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startResizePreparePane(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const container = rightSplitRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const startX = event.clientX
    const startWidth = preparePaneWidth
    const minWidth = 260
    const maxWidth = Math.max(minWidth, rect.width - 260)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX))
      setPreparePaneWidth(nextWidth)
    }

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  function selectPage(page: PageNode) {
    setSelectedId(page.id)
    setSelectedBlobFileName(page.blobFileName)
    setActionMessage(null)
    setError(null)
  }

  async function fetchDocumentById(id: string) {
    const response = await fetch(`/api/cosmos/item/${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
    const data = (await response.json()) as ItemResponse
    if (!response.ok || !data.item) {
      throw new Error(data.error || "Fetch by id failed")
    }
    return data.item
  }

  async function ensureDocument(targetId: string) {
    if (document?.id === targetId) return document
    const fetched = await fetchDocumentById(targetId)
    // Only update the right panel if user is still on the same selected page.
    setDocument((prev) => (selectedId === targetId ? fetched : prev))
    return fetched
  }

  async function handleFetchDocument() {
    const targetId = selectedId
    if (!targetId) return
    setFetchingDocument(true)
    setError(null)
    setActionMessage(null)
    try {
      await ensureDocument(targetId)
      if (selectedId !== targetId) return
      setActionMessage(`Fetched document by id: ${targetId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed")
    } finally {
      setFetchingDocument(false)
    }
  }

  async function handleDownload() {
    const targetId = selectedId
    if (!targetId) return
    setDownloading(true)
    setActionMessage(null)
    setError(null)

    try {
      const selectedDocument = await ensureDocument(targetId)
      if (selectedId !== targetId) return
      const response = await fetch("/api/cosmos/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: targetId,
          document: selectedDocument,
        }),
      })
      const data = (await response.json()) as {
        error?: string
        path?: string
        documentId?: string
        storagePath?: string
      }
      if (!response.ok) throw new Error(data.error || "Download failed")

      setActionMessage(`Saved to project storage: ${data.storagePath ?? data.path ?? targetId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  async function handlePrepare() {
    const targetId = selectedId
    if (!targetId) return

    setPreparing(true)
    setActionMessage(null)
    setError(null)
    setPrepareResult(null)

    try {
      const selectedDocument = await ensureDocument(targetId)
      if (selectedId !== targetId) return
      const docType = typeof selectedDocument.docType === "string" ? selectedDocument.docType : ""
      if (!docType) {
        throw new Error("Selected document has no docType")
      }
      const response = await fetch("/api/cosmos/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: targetId,
          docType,
          document: selectedDocument,
        }),
      })
      const data = (await response.json()) as PrepareResult
      if (!response.ok) {
        setPrepareResult(data)
        throw new Error(data.error || "Prepare failed")
      }

      setPrepareResult(data)
      setActionMessage(`Prepared via ${data.url}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prepare failed")
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="flex h-svh flex-col bg-[#f3f2f1] text-[#323130]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#edebe9] bg-white px-3 py-2">
        <select
          value={field}
          onChange={(e) => setField(e.target.value as FilterField)}
          className={cn(selectClassName, "w-[160px]")}
          aria-label="Filter field"
        >
          <option value="unixtime">unixtime</option>
          <option value="id">id</option>
          <option value="docType">docType</option>
          <option value="documentGroup">documentGroup</option>
        </select>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as FilterMode)}
          className={cn(selectClassName, "w-[110px]")}
          aria-label="Match mode"
        >
          <option value="exact">exact</option>
          <option value="like">like</option>
        </select>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              applyFilter()
            }
          }}
          placeholder={
            field === "unixtime"
              ? "เช่น 1785139899152 (จะค้นจาก blobFileName)"
              : mode === "like"
                ? "ค้นหาแบบมีคำนี้อยู่ในค่า…"
                : "ค้นหาค่าตรงทั้งหมด…"
          }
          className={inputClassName}
        />

        <Button
          type="button"
          onClick={applyFilter}
          disabled={loading}
          className="h-9 rounded-sm bg-[#0078d4] px-4 text-white hover:bg-[#106ebe]"
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

      {actionMessage ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {actionMessage}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[250px] shrink-0 flex-col border-r border-[#edebe9] bg-white">
          <div className="flex items-center justify-between border-b border-[#edebe9] bg-[#faf9f8] px-3 py-2 text-xs text-[#605e5c]">
            <div className="flex items-center gap-1.5">
              <FolderTree className="size-3.5" />
              <span>Results</span>
            </div>
            <span>{hasSearched ? `${tree.length} batch` : "—"}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {!hasSearched ? (
              <div className="px-3 py-10 text-center text-[#605e5c]">
                กรองแล้วกด Apply Filter เพื่อแสดงรายการ
              </div>
            ) : loading ? (
              <div className="px-3 py-10 text-center text-[#605e5c]">
                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                Querying Cosmos DB…
              </div>
            ) : tree.length === 0 ? (
              <div className="px-3 py-10 text-center text-[#605e5c]">No items found</div>
            ) : (
              <div className="px-2 py-2 text-sm">
                {tree.map((batch) => (
                  <div key={batch.batchId} className="mb-1">
                    <button
                      type="button"
                      onClick={() => toggleBatch(batch.batchId)}
                      className="flex w-full items-center gap-1 rounded px-2 py-1 text-left font-semibold text-[#323130] hover:bg-[#f3f2f1]"
                    >
                      <ChevronRight
                        className={cn("size-3.5 transition-transform", expandedBatches.has(batch.batchId) && "rotate-90")}
                      />
                      <span>{batch.batchId}</span>
                    </button>

                    {expandedBatches.has(batch.batchId) &&
                      batch.docs.map((doc) => {
                        const docKey = `${batch.batchId}/${doc.docId}`
                        const openDoc = expandedDocs.has(docKey)
                        return (
                          <div key={doc.docId} className="ml-4 mt-0.5">
                            <button
                              type="button"
                              onClick={() => toggleDoc(batch.batchId, doc.docId)}
                              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left font-medium text-[#605e5c] hover:bg-[#f3f2f1]"
                            >
                              <ChevronRight
                                className={cn("size-3.5 transition-transform", openDoc && "rotate-90")}
                              />
                              <span>{doc.docId}</span>
                            </button>
                            {openDoc &&
                              doc.pages.map((page) => (
                                <button
                                  key={page.id}
                                  type="button"
                                  className={cn(
                                    "ml-5 flex w-[calc(100%-1.25rem)] items-center gap-1 rounded px-2 py-1 text-left text-[#323130] hover:bg-[#deecf9]",
                                    selectedId === page.id && "bg-[#c7e0f4]"
                                  )}
                                  onClick={() => selectPage(page)}
                                  title={page.blobFileName}
                                >
                                  <FileText className="size-3.5 shrink-0 text-[#605e5c]" />
                                  <span className="truncate">{page.page}</span>
                                </button>
                              ))}
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#edebe9] bg-[#faf9f8] px-2 py-2 text-xs text-[#605e5c]">
            <span className="truncate">
              {hasSearched
                ? `${items.length} item${items.length === 1 ? "" : "s"}${requestCharge != null ? ` · ${requestCharge.toFixed(2)} RU` : ""}`
                : "ยังไม่ค้นหา"}
            </span>
            {hasSearched && hasMore ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={loadMoreLiteRows}
                disabled={loadingMore}
                className="h-7 shrink-0 rounded-sm border-[#8a8886] bg-white text-[#323130]"
              >
                {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
                More
              </Button>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          <div className="flex items-center justify-between gap-2 border-b border-[#333] px-3 py-1.5 text-xs text-[#cccccc]">
            <span className="min-w-0 truncate">
              {selectedId ? `Page · ${selectedBlobFileName ?? selectedId}` : "Document JSON"}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedId || fetchingDocument}
                onClick={() => void handleFetchDocument()}
                className="h-7 rounded-sm border-[#555] bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3a3a3a] hover:text-white"
              >
                {fetchingDocument ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Fetch
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedId || downloading}
                onClick={() => void handleDownload()}
                className="h-7 rounded-sm border-[#555] bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3a3a3a] hover:text-white"
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Download
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedId || preparing}
                onClick={() => void handlePrepare()}
                className="h-7 rounded-sm bg-[#0078d4] text-white hover:bg-[#106ebe]"
              >
                {preparing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <WandSparkles className="size-3.5" />
                )}
                Prepare
              </Button>
            </div>
          </div>
          <div ref={rightSplitRef} className="min-h-0 flex flex-1">
            <div className="min-h-0 min-w-0 flex-1">
              {document ? (
                <JsonViewer value={document} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#858585]">
                  Select page and click Fetch to view JSON
                </div>
              )}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              className="w-1.5 cursor-col-resize bg-[#2a2a2a] transition-colors hover:bg-[#3b82f6]"
              onMouseDown={startResizePreparePane}
            />
            <div
              className="min-h-0 shrink-0 border-l border-[#333] bg-[#181818]"
              style={{ width: `${preparePaneWidth}px` }}
            >
              <div className="border-b border-[#333] px-3 py-2 text-xs font-medium text-[#cccccc]">
                Prepare Result
              </div>
              <div className="h-[calc(100%-33px)] overflow-auto p-3 font-mono text-xs text-[#d4d4d4]">
                {prepareResult ? (
                  <pre className="m-0 whitespace-pre-wrap break-all">
                    {JSON.stringify(prepareResult, null, 2)}
                  </pre>
                ) : (
                  <span className="text-[#858585]">Prepare result will appear here</span>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
