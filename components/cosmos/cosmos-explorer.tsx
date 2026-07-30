"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, CloudDownload, Columns2, Download, FileDown, FileText, FolderTree, HardDrive, History, Loader2, Rows2, Search, Trash2, WandSparkles } from "lucide-react"
import { JsonView, allExpanded, collapseAllNested, darkStyles } from "react-json-view-lite"
import "react-json-view-lite/dist/index.css"

const cosmosJsonStyles: typeof darkStyles = {
  container: "json-view",
  basicChildStyle: "json-view-child",
  childFieldsContainer: "json-view-children",
  label: "json-view-label",
  clickableLabel: "json-view-label json-view-label-click",
  nullValue: "json-view-null",
  undefinedValue: "json-view-null",
  stringValue: "json-view-string",
  numberValue: "json-view-number",
  booleanValue: "json-view-boolean",
  otherValue: "json-view-other",
  punctuation: "json-view-punct",
  expandIcon: "json-view-expand",
  collapseIcon: "json-view-collapse",
  collapsedContent: "json-view-collapsed",
  noQuotesForStringValues: false,
  quotesForFieldNames: false,
  stringifyStringValues: false,
  ariaLables: {
    collapseJson: "collapse JSON",
    expandJson: "expand JSON",
  },
}

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  buildCosmosSearchHref,
  type CosmosFilterField,
  type CosmosFilterMode,
  type CosmosLiteItem,
  type CosmosQueryResult,
} from "@/lib/cosmos-query-shared"

type CosmosItem = CosmosLiteItem & {
  id?: string
  blobFileName?: string
  docType?: string
}

type QueryResponse = {
  items: CosmosItem[]
  continuationToken: string | null
  hasMore: boolean
  requestCharge?: number | null
  source?: "cache" | "fresh"
  error?: string
}

type ItemResponse = {
  item?: CosmosItem
  source?: "cache" | "fresh"
  error?: string
}
type PrepareResult = {
  ok?: boolean
  url?: string
  docType?: string
  documentId?: string
  data?: unknown
  details?: unknown
  source?: "cache" | "fresh"
  error?: string
}

type CacheStatusResponse = {
  ok?: boolean
  document?: "cache" | null
  prepare?: "cache" | null
  blob?: "cache" | null
  error?: string
}

type PdfCacheResult = {
  ok?: boolean
  source?: "cache" | "fresh"
  path?: string
  fileName?: string
  error?: string
}

type FilterField = CosmosFilterField
type FilterMode = CosmosFilterMode
type ResultLayout = "horizontal" | "vertical"

type AppliedFilter = {
  field: FilterField
  mode: FilterMode
  value: string
}

export type CosmosExplorerProps = {
  initialFilter?: AppliedFilter | null
  initialData?: CosmosQueryResult | null
  initialError?: string | null
}

type SearchHistoryMap = Record<FilterField, string[]>

const SEARCH_HISTORY_KEY = "cosmos-search-history-v1"
const MAX_SEARCH_HISTORY = 10

const FILTER_FIELDS: FilterField[] = ["unixtime", "id", "docType", "documentGroup"]

function emptySearchHistory(): SearchHistoryMap {
  return {
    unixtime: [],
    id: [],
    docType: [],
    documentGroup: [],
  }
}

function loadSearchHistory(): SearchHistoryMap {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY)
    if (!raw) return emptySearchHistory()
    const parsed = JSON.parse(raw) as Partial<Record<FilterField, unknown>>
    const next = emptySearchHistory()
    for (const field of FILTER_FIELDS) {
      const values = parsed[field]
      if (!Array.isArray(values)) continue
      next[field] = values
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, MAX_SEARCH_HISTORY)
    }
    return next
  } catch {
    return emptySearchHistory()
  }
}

function pushSearchHistory(
  current: SearchHistoryMap,
  field: FilterField,
  value: string
): SearchHistoryMap {
  const trimmed = value.trim()
  if (!trimmed) return current
  const nextList = [
    trimmed,
    ...current[field].filter((item) => item !== trimmed),
  ].slice(0, MAX_SEARCH_HISTORY)
  return { ...current, [field]: nextList }
}

const selectClassName =
  "h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"

const inputClassName =
  "h-9 min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"

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

function toJsonViewData(value: unknown): object | unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object") return value as object
  return { value }
}

function JsonViewer({ value }: { value: unknown }) {
  const data = useMemo(() => toJsonViewData(value), [value])
  const [expandAll, setExpandAll] = useState(false)
  const [expandVersion, setExpandVersion] = useState(0)

  useEffect(() => {
    setExpandAll(false)
    setExpandVersion((v) => v + 1)
  }, [data])

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setExpandAll(true)
            setExpandVersion((v) => v + 1)
          }}
          className="h-7 gap-1.5 rounded-md border-slate-600 bg-slate-900 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <ChevronsUpDown className="size-3.5" />
          Expand all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setExpandAll(false)
            setExpandVersion((v) => v + 1)
          }}
          className="h-7 gap-1.5 rounded-md border-slate-600 bg-slate-900 px-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <ChevronsDownUp className="size-3.5" />
          Collapse all
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[13px] leading-5">
        <JsonView
          key={expandVersion}
          data={data}
          style={cosmosJsonStyles}
          shouldExpandNode={expandAll ? allExpanded : collapseAllNested}
          clickToExpandNode
        />
      </div>
    </div>
  )
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
    return { error: trimmed.slice(0, 300) || `Unexpected response (${response.status})` } as T & {
      error?: string
    }
  }
}

export function CosmosExplorer({
  initialFilter = null,
  initialData = null,
  initialError = null,
}: CosmosExplorerProps) {
  const router = useRouter()
  const [field, setField] = useState<FilterField>(initialFilter?.field ?? "unixtime")
  const [mode, setMode] = useState<FilterMode>(initialFilter?.mode ?? "like")
  const [value, setValue] = useState(initialFilter?.value ?? "")
  const lastInitialKeyRef = useRef(
    initialFilter ? `${initialFilter.field}:${initialFilter.mode}:${initialFilter.value}` : ""
  )
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>(
    initialFilter ?? {
      field: "unixtime",
      mode: "like",
      value: "",
    }
  )
  const [currentData, setCurrentData] = useState<CosmosItem[]>(initialData?.items ?? [])
  const [continuationToken, setContinuationToken] = useState<string | null>(
    initialData?.continuationToken ?? null
  )
  const [hasMore, setHasMore] = useState(Boolean(initialData?.hasMore))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedBlobFileName, setSelectedBlobFileName] = useState<string | null>(null)
  const [document, setDocument] = useState<CosmosItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchingDocument, setFetchingDocument] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(
    initialData
      ? initialData.source === "cache"
        ? `Loaded from query cache · ${initialData.items.length} items`
        : `Loaded · ${initialData.items.length} items`
      : null
  )
  const [prepareResult, setPrepareResult] = useState<PrepareResult | null>(null)
  const [documentSource, setDocumentSource] = useState<"cache" | "fresh" | null>(null)
  const [prepareSource, setPrepareSource] = useState<"cache" | "fresh" | null>(null)
  const [blobSource, setBlobSource] = useState<"cache" | "fresh" | null>(null)
  const [cachingPdf, setCachingPdf] = useState(false)
  const [flushingCache, setFlushingCache] = useState(false)
  const [pageCacheMap, setPageCacheMap] = useState<
    Record<
      string,
      { document: boolean; prepare: boolean; blob: boolean; complete: boolean }
    >
  >({})
  const [zippingDocKey, setZippingDocKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [requestCharge, setRequestCharge] = useState<number | null>(
    initialData?.requestCharge ?? null
  )
  const [resultSplitRatio, setResultSplitRatio] = useState(0.5)
  const [resultLayout, setResultLayout] = useState<ResultLayout>("horizontal")
  const [hasSearched, setHasSearched] = useState(Boolean(initialFilter?.value))
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [searchHistory, setSearchHistory] = useState<SearchHistoryMap>(emptySearchHistory)
  const rightSplitRef = useRef<HTMLDivElement | null>(null)
  const tree = useMemo(
    () => (hasSearched ? buildTree(currentData) : []),
    [hasSearched, currentData]
  )
  const recentForField = searchHistory[field] ?? []

  useEffect(() => {
    const nextKey = initialFilter
      ? `${initialFilter.field}:${initialFilter.mode}:${initialFilter.value}`
      : ""
    if (nextKey === lastInitialKeyRef.current) return
    lastInitialKeyRef.current = nextKey

    if (!initialFilter) {
      setHasSearched(false)
      setCurrentData([])
      setContinuationToken(null)
      setHasMore(false)
      setRequestCharge(null)
      setError(initialError)
      return
    }

    setField(initialFilter.field)
    setMode(initialFilter.mode)
    setValue(initialFilter.value)
    setAppliedFilter(initialFilter)
    setHasSearched(true)
    setCurrentData(initialData?.items ?? [])
    setContinuationToken(initialData?.continuationToken ?? null)
    setHasMore(Boolean(initialData?.hasMore))
    setRequestCharge(initialData?.requestCharge ?? null)
    setError(initialError)
    setSelectedId(null)
    setSelectedBlobFileName(null)
    setDocument(null)
    setExpandedBatches(new Set())
    setExpandedDocs(new Set())
    setActionMessage(
      initialData
        ? initialData.source === "cache"
          ? `Loaded from query cache · ${initialData.items.length} items`
          : `Loaded · ${initialData.items.length} items`
        : null
    )
  }, [initialFilter, initialData, initialError])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loaded = loadSearchHistory()
      if (!initialFilter?.value) {
        setSearchHistory(loaded)
        return
      }
      const next = pushSearchHistory(loaded, initialFilter.field, initialFilter.value)
      try {
        window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      setSearchHistory(next)
    }, 0)
    return () => window.clearTimeout(timer)
    // Intentionally only hydrate history once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allPageIds = useMemo(
    () => tree.flatMap((batch) => batch.docs.flatMap((doc) => doc.pages.map((page) => page.id))),
    [tree]
  )

  const refreshPageCacheMap = useCallback(async (documentIds: string[]) => {
    if (documentIds.length === 0) {
      setPageCacheMap({})
      return
    }
    try {
      const response = await fetch("/api/cosmos/cache/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds }),
      })
      const data = await readApiPayload<{
        pages?: Record<
          string,
          { document: boolean; prepare: boolean; blob: boolean; complete: boolean }
        >
        error?: string
      }>(response)
      if (!response.ok) throw new Error(data.error || "Failed to load cache map")
      setPageCacheMap(data.pages ?? {})
    } catch {
      // keep previous map on soft failure
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPageCacheMap(allPageIds)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [allPageIds, refreshPageCacheMap])

  const documentPaneStyle = useMemo(
    () => ({ flex: `${1 - resultSplitRatio} 1 0%` }),
    [resultSplitRatio]
  )

  const preparePaneStyle = useMemo(
    () => ({ flex: `${resultSplitRatio} 1 0%` }),
    [resultSplitRatio]
  )
  const fetchItems = useCallback(
    async (filter: AppliedFilter, options?: { append?: boolean; forceFresh?: boolean }) => {
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
            maxItemCount: 100,
            fetchAll: !append && Boolean(filter.value.trim()),
            forceFresh: Boolean(options?.forceFresh),
            continuationToken: append ? continuationToken : null,
          }),
        })

        const data = await readApiPayload<QueryResponse>(response)
        if (!response.ok) {
          throw new Error(data.error || "Failed to query Cosmos DB")
        }

        const newData = data.items
        setCurrentData((prev) => (append ? [...prev, ...newData] : newData))
        setContinuationToken(data.continuationToken)
        setHasMore(Boolean(data.continuationToken))
        setRequestCharge((prev) =>
          append ? (prev ?? 0) + (data.requestCharge ?? 0) : (data.requestCharge ?? 0)
        )
        if (!append) {
          setActionMessage(
            data.source === "cache"
              ? `Loaded from query cache · ${newData.length} items`
              : `Loaded · ${newData.length} items`
          )
          setSelectedId(null)
          setSelectedBlobFileName(null)
          setDocument(null)
          setExpandedBatches(new Set())
          setExpandedDocs(new Set())
        }
        return newData
      } catch (err) {
        setError(err instanceof Error ? err.message : "Query failed")
        if (!append) {
          setCurrentData([])
          setContinuationToken(null)
          setHasMore(false)
        }
        return []
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [continuationToken]
  )

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setPrepareResult(null)
      setDocument(null)
      setDocumentSource(null)
      setPrepareSource(null)
      setBlobSource(null)

      if (!selectedId) return

      void (async () => {
        try {
          const response = await fetch(
            `/api/cosmos/cache?documentId=${encodeURIComponent(selectedId)}`,
            { cache: "no-store" }
          )
          const data = await readApiPayload<CacheStatusResponse>(response)
          if (cancelled || !response.ok) return
          setDocumentSource(data.document ?? null)
          setPrepareSource(data.prepare ?? null)
          setBlobSource(data.blob ?? null)
        } catch {
          // ignore status probe errors
        }
      })()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selectedId])

  function rememberSearch(nextFilter: AppliedFilter) {
    if (!nextFilter.value) return
    setSearchHistory((prev) => {
      const next = pushSearchHistory(prev, nextFilter.field, nextFilter.value)
      try {
        window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      } catch {
        // ignore quota / private mode
      }
      return next
    })
  }

  async function runSearch(nextFilter: AppliedFilter) {
    rememberSearch(nextFilter)
    setHasSearched(true)
    setAppliedFilter(nextFilter)
    const href = buildCosmosSearchHref(nextFilter)
    lastInitialKeyRef.current = nextFilter.value
      ? `${nextFilter.field}:${nextFilter.mode}:${nextFilter.value}`
      : ""
    router.replace(href, { scroll: false })
    await fetchItems(nextFilter)
  }

  function applyFilter() {
    void runSearch({
      field,
      mode,
      value: value.trim(),
    })
  }

  function applyRecentSearch(recentValue: string) {
    if (!recentValue) return
    setValue(recentValue)
    void runSearch({
      field,
      mode,
      value: recentValue.trim(),
    })
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
    const isHorizontal = resultLayout === "horizontal"
    const minRatio = 0.2
    const maxRatio = 0.8

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (isHorizontal) {
        const next = (rect.right - moveEvent.clientX) / rect.width
        setResultSplitRatio(Math.min(maxRatio, Math.max(minRatio, next)))
        return
      }
      const next = (rect.bottom - moveEvent.clientY) / rect.height
      setResultSplitRatio(Math.min(maxRatio, Math.max(minRatio, next)))
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
    const data = await readApiPayload<ItemResponse>(response)
    if (!response.ok || !data.item) {
      throw new Error(data.error || "Fetch by id failed")
    }
    return {
      item: data.item,
      source: data.source ?? "fresh",
    }
  }

  async function ensureDocument(targetId: string) {
    if (document?.id === targetId) {
      return { item: document, source: documentSource ?? ("fresh" as const) }
    }
    const fetched = await fetchDocumentById(targetId)
    if (selectedId === targetId) {
      setDocument(fetched.item)
      setDocumentSource(fetched.source)
    }
    return fetched
  }

  async function handleFetchDocument() {
    const targetId = selectedId
    if (!targetId) return
    setFetchingDocument(true)
    setError(null)
    setActionMessage(null)
    try {
      const result = await ensureDocument(targetId)
      if (selectedId !== targetId) return
      setActionMessage(
        result.source === "cache"
          ? `Loaded from download cache: ${targetId}`
          : `Fetched from Cosmos: ${targetId}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed")
    } finally {
      setFetchingDocument(false)
    }
  }

  async function handlePdf() {
    const targetId = selectedId
    const blobFileName =
      selectedBlobFileName ||
      (typeof document?.blobFileName === "string" ? document.blobFileName : null)
    if (!targetId) return
    if (!blobFileName) {
      setError("No blobFileName for selected page")
      return
    }

    setError(null)
    setActionMessage(null)
    setCachingPdf(true)

    try {
      // Server checks download/blob/manifest.json; downloads + writes if missing.
      const response = await fetch("/api/cosmos/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: targetId, blobFileName }),
      })
      const data = await readApiPayload<PdfCacheResult>(response)
      if (!response.ok) {
        throw new Error(data.error || "PDF cache failed")
      }
      if (selectedId !== targetId) return

      const openPath = data.path || `/download/blob/${encodeURIComponent(targetId)}`
      const fileName = data.fileName || blobFileName.split("/").pop() || "page.pdf"

      setBlobSource("cache")
      await refreshPageCacheMap(allPageIds)

      if (data.source === "cache") {
        window.open(openPath, "_blank", "noopener,noreferrer")
        setActionMessage(`Opened cached PDF: ${fileName}`)
        return
      }

      setActionMessage(`Downloaded PDF to ${openPath} (manifest updated): ${fileName}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF cache failed")
    } finally {
      setCachingPdf(false)
    }
  }

  async function runPrepare(targetId: string) {
    // Prefer local prepare cache first — skip Cosmos + external API when possible.
    if (prepareSource === "cache") {
      const cachedResponse = await fetch("/api/cosmos/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: targetId }),
      })
      const cachedData = await readApiPayload<PrepareResult>(cachedResponse)
      if (cachedResponse.ok && cachedData.source === "cache") {
        if (selectedId !== targetId) return null
        setPrepareResult(cachedData)
        setPrepareSource("cache")
        await refreshPageCacheMap(allPageIds)
        setActionMessage(`Loaded prepare cache: ${targetId}`)
        return cachedData
      }
    }

    const selected = await ensureDocument(targetId)
    if (selectedId !== targetId) return null
    const docType = typeof selected.item.docType === "string" ? selected.item.docType : ""
    if (!docType) {
      throw new Error("Selected document has no docType")
    }

    const response = await fetch("/api/cosmos/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: targetId,
        docType,
      }),
    })
    const data = await readApiPayload<PrepareResult>(response)
    if (!response.ok) {
      setPrepareResult(data)
      throw new Error(data.error || "Prepare failed")
    }

    if (selectedId !== targetId) return null
    setPrepareResult(data)
    setPrepareSource(data.source ?? "fresh")
    await refreshPageCacheMap(allPageIds)
    setActionMessage(
      data.source === "cache"
        ? `Loaded prepare cache: ${targetId}`
        : `Prepared via ${data.url}`
    )
    return data
  }

  async function handleDownload() {
    const targetId = selectedId
    if (!targetId) return

    setDownloading(true)
    setActionMessage(null)
    setError(null)

    try {
      let pageDocument = document?.id === targetId ? document : null
      if (!pageDocument) {
        const fetched = await ensureDocument(targetId)
        if (selectedId !== targetId) return
        pageDocument = fetched.item
        setActionMessage(
          fetched.source === "cache"
            ? `Loaded from download cache: ${targetId}`
            : `Fetched from Cosmos: ${targetId}`
        )
      }

      let prepared = prepareResult
      if (!prepared) {
        prepared = await runPrepare(targetId)
        if (!prepared || selectedId !== targetId) return
      }

      const response = await fetch("/api/cosmos/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: targetId,
          document: pageDocument,
          prepare: prepared,
          docType:
            typeof pageDocument.docType === "string"
              ? pageDocument.docType
              : prepared.docType,
          prepareUrl: prepared.url,
        }),
      })
      const data = await readApiPayload<{
        error?: string
        path?: string
        documentId?: string
        storagePath?: string
        prepareStoragePath?: string
      }>(response)
      if (!response.ok) throw new Error(data.error || "Download failed")

      setDocumentSource("cache")
      setPrepareSource("cache")
      await refreshPageCacheMap(allPageIds)
      setActionMessage(
        `Saved page + prepare: ${data.storagePath ?? data.path ?? targetId}` +
          (data.prepareStoragePath ? ` · ${data.prepareStoragePath}` : "")
      )
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
      await runPrepare(targetId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prepare failed")
    } finally {
      setPreparing(false)
    }
  }

  async function handleFlushCache() {
    setFlushingCache(true)
    setError(null)
    setActionMessage(null)
    try {
      const response = await fetch("/api/cosmos/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedId
            ? { kind: "all", documentId: selectedId }
            : { kind: "all" }
        ),
      })
      const data = await readApiPayload<{ error?: string }>(response)
      if (!response.ok) throw new Error(data.error || "Flush cache failed")

      setDocumentSource(null)
      setPrepareSource(null)
      setBlobSource(null)
      setPrepareResult(null)
      if (selectedId) {
        setDocument(null)
      }
      setActionMessage(
        selectedId
          ? `Flushed cache for ${selectedId}`
          : "Flushed all download/prepare/blob cache"
      )
      await refreshPageCacheMap(allPageIds)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Flush cache failed")
    } finally {
      setFlushingCache(false)
    }
  }

  function docHasAnyCache(doc: DocNode) {
    return doc.pages.some(
      (page) => pageCacheMap[page.id]?.document || pageCacheMap[page.id]?.prepare
    )
  }

  async function downloadZipBlob(kind: "raw" | "prepared", batchId: string, doc: DocNode) {
    const response = await fetch("/api/cosmos/doc-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        batchId,
        docId: doc.docId,
        pages: doc.pages.map((page) => ({ id: page.id, page: page.page })),
      }),
    })

    if (response.status === 404) {
      return { downloaded: false, included: 0 }
    }

    if (!response.ok) {
      const data = await readApiPayload<{ error?: string }>(response)
      throw new Error(data.error || `Failed to build ${kind} zip`)
    }

    const included = Number(response.headers.get("X-Included-Files") ?? "0")
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement("a")
    const disposition = response.headers.get("Content-Disposition") ?? ""
    const matched = disposition.match(/filename="([^"]+)"/)
    anchor.href = url
    anchor.download = matched?.[1] ?? `${batchId}_${doc.docId}_${kind}.zip`
    window.document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    return { downloaded: true, included }
  }

  async function handleDocZipDownload(batchId: string, doc: DocNode) {
    const docKey = `${batchId}/${doc.docId}`
    if (!docHasAnyCache(doc)) {
      setError(`${doc.docId} ยังไม่มีไฟล์ cache ให้ zip`)
      return
    }

    setZippingDocKey(docKey)
    setError(null)
    setActionMessage(null)
    try {
      const raw = await downloadZipBlob("raw", batchId, doc)
      const prepared = await downloadZipBlob("prepared", batchId, doc)
      const parts: string[] = []
      if (raw.downloaded) parts.push(`raw (${raw.included})`)
      if (prepared.downloaded) parts.push(`prepared (${prepared.included})`)
      if (parts.length === 0) {
        throw new Error("No cached files available to zip")
      }
      setActionMessage(`Downloaded zip for ${doc.docId}: ${parts.join(" · ")}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zip download failed")
    } finally {
      setZippingDocKey(null)
    }
  }

  return (
    <div className="flex h-svh flex-col bg-slate-950 text-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-2.5">
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

        <div className="flex min-w-[180px] items-center gap-1.5">
          <History className="size-3.5 shrink-0 text-slate-400" />
          <select
            value=""
            onChange={(e) => applyRecentSearch(e.target.value)}
            className={cn(selectClassName, "min-w-0 flex-1")}
            aria-label={`Recent ${field} searches`}
            disabled={recentForField.length === 0}
          >
            <option value="">
              {recentForField.length === 0
                ? `No recent ${field}`
                : `Recent ${field} (${recentForField.length})`}
            </option>
            {recentForField.map((item) => (
              <option key={`${field}:${item}`} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

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
          className="h-9 rounded-lg bg-cyan-500 px-4 text-slate-950 hover:bg-cyan-400"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Search
        </Button>
      </div>

      <div
        className={cn(
          "border-b px-3 py-2 text-sm",
          error
            ? "border-red-900/60 bg-red-950/40 text-red-200"
            : actionMessage
              ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
              : "border-slate-800 bg-slate-900 text-slate-400"
        )}
      >
        {error ?? actionMessage ?? "What you would like to do ?"}
      </div>

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[270px] shrink-0 flex-col border-r border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <FolderTree className="size-3.5" />
              <span>Results</span>
            </div>
            <span>{hasSearched ? `${tree.length} batch` : "—"}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {!hasSearched ? (
              <div className="px-3 py-10 text-center text-slate-500">
                กรองแล้วกด Search เพื่อแสดงรายการ
              </div>
            ) : loading ? (
              <div className="px-3 py-10 text-center text-slate-500">
                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                Querying Cosmos DB…
              </div>
            ) : tree.length === 0 ? (
              <div className="px-3 py-10 text-center text-slate-500">No items found</div>
            ) : (
              <div className="px-2 py-2 text-sm">
                {tree.map((batch) => (
                  <div key={batch.batchId} className="mb-1">
                    <button
                      type="button"
                      onClick={() => toggleBatch(batch.batchId)}
                      className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left font-semibold text-slate-100 hover:bg-slate-900"
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
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleDoc(batch.batchId, doc.docId)}
                                className="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1 text-left font-medium text-slate-300 hover:bg-slate-900"
                              >
                                <ChevronRight
                                  className={cn("size-3.5 transition-transform", openDoc && "rotate-90")}
                                />
                                <span className="truncate">{doc.docId}</span>
                              </button>
                              {docHasAnyCache(doc) ? (
                                <button
                                  type="button"
                                  title="Download available raw/prepared zip"
                                  disabled={zippingDocKey === docKey}
                                  onClick={() => void handleDocZipDownload(batch.batchId, doc)}
                                  className="mr-1 inline-flex h-6 items-center gap-1 rounded-md border border-slate-600 bg-slate-900 px-1.5 text-[11px] text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                                >
                                  {zippingDocKey === docKey ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Download className="size-3" />
                                  )}
                                  Zip
                                </button>
                              ) : null}
                            </div>
                            {openDoc &&
                              doc.pages.map((page) => (
                                <button
                                  key={page.id}
                                  type="button"
                                  className={cn(
                                    "ml-5 flex w-[calc(100%-1.25rem)] items-center gap-1 rounded-lg px-2 py-1 text-left text-slate-200 hover:bg-cyan-500/10",
                                    selectedId === page.id && "bg-cyan-500/20 text-cyan-100"
                                  )}
                                  onClick={() => selectPage(page)}
                                  title={page.blobFileName}
                                >
                                  <FileText className="size-3.5 shrink-0 text-slate-400" />
                                  <span className="truncate">{page.page}</span>
                                  {pageCacheMap[page.id]?.complete ? (
                                    <span className="ml-auto rounded bg-emerald-950/50 px-1 text-[10px] text-emerald-300">
                                      cached
                                    </span>
                                  ) : null}
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

          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-2 py-2 text-xs text-slate-400">
            <span className="truncate">
              {hasSearched
                ? `${currentData.length} item${currentData.length === 1 ? "" : "s"}${requestCharge != null ? ` · ${requestCharge.toFixed(2)} RU` : ""}`
                : "ยังไม่ค้นหา"}
            </span>
            {hasSearched && hasMore ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={loadMoreLiteRows}
                disabled={loadingMore}
                className="h-7 shrink-0 rounded-md border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800"
              >
                {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
                More
              </Button>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-950">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-1.5 text-xs text-slate-300">
            <span className="min-w-0 truncate">
              {selectedId ? `Page · ${selectedBlobFileName ?? selectedId}` : "Document JSON"}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="mr-1 flex items-center gap-1 text-[11px]">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5",
                    documentSource === "cache"
                      ? "bg-emerald-900/60 text-emerald-300"
                      : documentSource === "fresh"
                        ? "bg-sky-900/60 text-sky-300"
                        : "bg-slate-800 text-slate-500"
                  )}
                >
                  Doc: {documentSource ?? "—"}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5",
                    prepareSource === "cache"
                      ? "bg-emerald-900/60 text-emerald-300"
                      : prepareSource === "fresh"
                        ? "bg-sky-900/60 text-sky-300"
                        : "bg-slate-800 text-slate-500"
                  )}
                >
                  Prep: {prepareSource ?? "—"}
                </span>
              </div>
              <div className="mr-1 flex overflow-hidden rounded-md border border-slate-600">
                <button
                  type="button"
                  title="ซ้อนแนวนอน"
                  onClick={() => setResultLayout("horizontal")}
                  className={cn(
                    "inline-flex h-7 items-center justify-center px-2 text-slate-300 hover:bg-slate-800",
                    resultLayout === "horizontal" && "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  )}
                >
                  <Columns2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="ซ้อนแนวตั้ง"
                  onClick={() => setResultLayout("vertical")}
                  className={cn(
                    "inline-flex h-7 items-center justify-center border-l border-slate-600 px-2 text-slate-300 hover:bg-slate-800",
                    resultLayout === "vertical" && "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  )}
                >
                  <Rows2 className="size-3.5" />
                </button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedId || fetchingDocument}
                onClick={() => void handleFetchDocument()}
                className="h-7 rounded-md border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              >
                {fetchingDocument ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CloudDownload className="size-3.5" />
                )}
                Fetch
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedId || !selectedBlobFileName || cachingPdf}
                onClick={() => void handlePdf()}
                title={
                  !selectedBlobFileName
                    ? "Select a page with blobFileName"
                    : blobSource === "cache" || pageCacheMap[selectedId ?? ""]?.blob
                      ? `Open from download/blob (manifest): ${selectedId}`
                      : `Download to download/blob + manifest: ${selectedBlobFileName}`
                }
                className={cn(
                  "h-7 rounded-md",
                  blobSource === "cache" || pageCacheMap[selectedId ?? ""]?.blob
                    ? "border-cyan-400 bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950"
                    : "border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                )}
              >
                {cachingPdf ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileDown className="size-3.5" />
                )}
                PDF
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!selectedId || preparing}
                onClick={() => void handlePrepare()}
                className="h-7 rounded-md bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                {preparing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <WandSparkles className="size-3.5" />
                )}
                Prepare
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedId || downloading || fetchingDocument || preparing}
                onClick={() => void handleDownload()}
                title="Fetch + Prepare if needed, then cache to storage"
                className="h-7 rounded-md border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <HardDrive className="size-3.5" />
                )}
                Cache
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={flushingCache}
                onClick={() => void handleFlushCache()}
                className="h-7 rounded-md border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
                title={selectedId ? `Flush cache for selected page` : "Flush all cache"}
              >
                {flushingCache ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Flush
              </Button>
            </div>
          </div>
          <div
            ref={rightSplitRef}
            className={cn(
              "min-h-0 flex flex-1",
              resultLayout === "vertical" ? "flex-col" : "flex-row"
            )}
          >
            <div className="min-h-0 min-w-0" style={documentPaneStyle}>
              {document ? (
                <JsonViewer value={document} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Select page and click Fetch to view JSON
                </div>
              )}
            </div>
            <div
              role="separator"
              aria-orientation={resultLayout === "horizontal" ? "vertical" : "horizontal"}
              className={cn(
                "shrink-0 bg-slate-800 transition-colors hover:bg-cyan-500",
                resultLayout === "horizontal"
                  ? "w-1.5 cursor-col-resize"
                  : "h-1.5 cursor-row-resize"
              )}
              onMouseDown={startResizePreparePane}
            />
            <div
              className={cn(
                "min-h-0 min-w-0 bg-slate-900/80",
                resultLayout === "horizontal" ? "border-l border-slate-800" : "border-t border-slate-800"
              )}
              style={preparePaneStyle}
            >
              {prepareResult ? (
                <JsonViewer value={prepareResult} />
              ) : (
                <div className="flex h-full items-center justify-center p-3 text-sm text-slate-500">
                  Result will appear here
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
