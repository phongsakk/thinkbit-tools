"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PDFDocument } from "pdf-lib"
import {
  Save,
  Sparkles,
  FileSpreadsheet,
  FileJson,
  RotateCcw,
  RefreshCw,
  Pencil,
} from "lucide-react"

import toast from "react-hot-toast"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { swalConfirm } from "@/lib/swal"
import {
  addExtraCanon,
  canonFor,
  formKeyOf,
  isProductCanon,
  loadExtraCanon,
  normalizeCanon,
  productNameFromHeader,
  suggestCanon,
} from "@/lib/ocr-review/canon"
import { ensureForcedReceiveColumns, buildDisplayOrder, deletedCiSet } from "@/lib/ocr-review/0701-columns"
import { parseData } from "@/lib/ocr-review/parse-ocr"
import { rebuildFields } from "@/lib/ocr-review/rebuild-fields"
import {
  fetchBlob,
  fetchGroup,
  fetchHealth,
  postAiMap,
  postReocr,
  putCorrected,
} from "@/lib/ocr-review/api"
import type {
  CosmosDoc,
  FileState,
  RebuildContext,
  Section,
} from "@/lib/ocr-review/types"
import { createEmptyFileState } from "@/lib/ocr-review/types"
import { CanonPicker } from "@/components/ocr-review/canon-picker"
import { SectionTable } from "@/components/ocr-review/section-table"

type StatusKind = "idle" | "work" | "ok" | "err"

const STATUS_TOAST_ID = "ocr-review-status"

type Props = {
  setKey: string | null
  backHref: string
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** UI label: always "หน้าที่ %s" (+ optional suffix from OCR). */
function formatPageLabel(sec: Section, si: number): string {
  const pageStr = String(sec.page || "").trim()
  if (/^หน้าที่\b/.test(pageStr)) return pageStr

  const fromNo =
    sec.pageNo != null && String(sec.pageNo).trim() !== ""
      ? String(sec.pageNo).trim()
      : ""
  const numMatch = (fromNo || pageStr).match(/(\d+)/)
  const num = numMatch ? numMatch[1] : String(si + 1)
  const suffix = pageStr.match(/\s*(\([^)]+\))\s*$/)
  return suffix ? `หน้าที่ ${num} ${suffix[1]}` : `หน้าที่ ${num}`
}

function oilTypeOf(state: FileState, si: number): string {
  return (state.pageMeta[si]?.oilType ?? state.cur[si]?.oilType ?? "").trim()
}

type OilDisplayGroup = {
  key: string
  label: string
  indices: number[]
}

/** Consecutive sections with the same oil_type → one display group. */
function buildOilDisplayGroups(
  state: FileState,
  groupByName: boolean
): OilDisplayGroup[] {
  if (!groupByName) {
    return state.cur.map((sec, si) => ({
      key: `page-${si}`,
      label: formatPageLabel(sec, si),
      indices: [si],
    }))
  }
  const groups: OilDisplayGroup[] = []
  for (let si = 0; si < state.cur.length; si++) {
    const label = oilTypeOf(state, si) || "(ไม่ระบุวัตถุดิบ)"
    const key = label.toLowerCase()
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.indices.push(si)
    } else {
      groups.push({ key, label, indices: [si] })
    }
  }
  return groups
}

function formatGroupNavLabel(state: FileState, g: OilDisplayGroup): string {
  if (g.indices.length === 1) {
    const si = g.indices[0]
    return `${g.label} · ${formatPageLabel(state.cur[si], si)}`
  }
  const first = formatPageLabel(state.cur[g.indices[0]], g.indices[0])
  const last = formatPageLabel(
    state.cur[g.indices[g.indices.length - 1]],
    g.indices[g.indices.length - 1]
  )
  return `${g.label} · ${first}–${last.replace(/^หน้าที่\s*/, "")}`
}

/** DOM id / hash fragment for a display group. */
function hashIdForGroup(
  g: OilDisplayGroup,
  gi: number,
  groupByName: boolean
): string {
  if (groupByName && g.indices.length > 1) return `grp-${gi}`
  return `sec-${g.indices[0]}`
}

/**
 * Copy column mappings from the first page of a group onto later pages.
 * Only fills empty (unmapped) slots — never overwrites an existing mapping.
 */
function propagateColMapFromFirst(
  prev: FileState,
  groupIndices: number[],
  onlyCi?: number
): FileState | null {
  if (groupIndices.length < 2) return null
  const firstSi = groupIndices[0]
  const srcMap = [...(prev.colMap[firstSi] || [])]
  const colMap = prev.colMap.map((row) => [...(row || [])])
  const prodName: FileState["prodName"] = { ...prev.prodName }
  const displayOrder = prev.displayOrder.map((row) => [...(row || [])])
  let changed = false

  for (const si of groupIndices.slice(1)) {
    const headerLen = prev.cur[si]?.headers.length || 0
    if (!colMap[si]) colMap[si] = []
    while (colMap[si].length < headerLen) colMap[si].push("")

    const maxCi =
      onlyCi != null
        ? onlyCi
        : Math.min(srcMap.length, colMap[si].length) - 1
    if (maxCi < 0) continue

    const start = onlyCi != null ? onlyCi : 0
    for (let ci = start; ci <= maxCi; ci++) {
      if (onlyCi != null && ci !== onlyCi) continue
      if (ci >= colMap[si].length) break
      const src = normalizeCanon(srcMap[ci]) || srcMap[ci] || ""
      if (!src) continue
      const cur = normalizeCanon(colMap[si][ci]) || colMap[si][ci] || ""
      if (cur) continue // already mapped — do not change
      colMap[si][ci] = src
      changed = true
      if (isProductCanon(src)) {
        const pname =
          prev.prodName[firstSi]?.[ci] ||
          productNameFromHeader(prev.cur[si]?.headers[ci]) ||
          productNameFromHeader(prev.cur[firstSi]?.headers[ci]) ||
          ""
        if (pname && !prodName[si]?.[ci]) {
          prodName[si] = { ...(prodName[si] || {}), [ci]: pname }
        }
      }
    }

    while (displayOrder.length <= si) displayOrder.push([])
    displayOrder[si] = buildDisplayOrder(
      headerLen || colMap[si].length,
      colMap[si],
      deletedCiSet(si, prev.deletedCols)
    )
  }

  if (!changed) return null
  return { ...prev, colMap, prodName, displayOrder }
}

/** Propagate mappings for every multi-page oil group. */
function propagateAllGroupColMaps(prev: FileState): FileState {
  const groups = buildOilDisplayGroups(prev, true)
  let next = prev
  for (const g of groups) {
    const patched = propagateColMapFromFirst(next, g.indices)
    if (patched) next = patched
  }
  return next
}

function findGroupIndicesForPage(
  state: FileState,
  si: number,
  groupByName: boolean
): number[] | null {
  if (!groupByName) return null
  const groups = buildOilDisplayGroups(state, true)
  const g = groups.find((x) => x.indices.includes(si))
  return g && g.indices.length > 1 ? g.indices : null
}

function pushUrlHash(id: string, mode: "push" | "replace" = "push") {
  if (typeof window === "undefined") return
  const next = `#${id}`
  if (window.location.hash === next) return
  const url = `${window.location.pathname}${window.location.search}${next}`
  if (mode === "replace") {
    window.history.replaceState(null, "", url)
  } else {
    window.history.pushState(null, "", url)
  }
}

function parseHashTarget(): { kind: "grp" | "sec"; n: number } | null {
  if (typeof window === "undefined") return null
  const m = window.location.hash.match(/^#(grp|sec)-(\d+)$/)
  if (!m) return null
  return { kind: m[1] as "grp" | "sec", n: Number(m[2]) }
}

/** Visible column indices in display order for a section. */
function visColsForSection(state: FileState, si: number): number[] {
  const sec = state.cur[si]
  if (!sec) return []
  const n = sec.headers.length
  const order =
    state.displayOrder[si]?.length
      ? state.displayOrder[si].filter((ci) => ci >= 0 && ci < n)
      : buildDisplayOrder(n, state.colMap[si] || [], deletedCiSet(si, state.deletedCols))
  const seen = new Set(order)
  const ordered = [...order]
  for (let ci = 0; ci < n; ci++) {
    if (!seen.has(ci)) ordered.push(ci)
  }
  return ordered.filter((ci) => !state.deletedCols.has(`${si}:${ci}`))
}

function countEdits(state: FileState): number {
  let n = 0
  for (const si of Object.keys(state.edits)) {
    for (const ri of Object.keys(state.edits[+si] || {})) {
      n += Object.keys(state.edits[+si][+ri] || {}).length
    }
  }
  n += state.deletedRows.size + state.deletedCols.size
  for (const si of Object.keys(state.infoEdits)) {
    n += Object.keys(state.infoEdits[+si] || {}).length
  }
  for (const si of Object.keys(state.summaryEdits)) {
    for (const ri of Object.keys(state.summaryEdits[+si] || {})) {
      n += Object.keys(state.summaryEdits[+si][+ri] || {}).length
    }
  }
  return n
}

function hasSectionChanges(state: FileState, si: number): boolean {
  if (state.edits[si] && Object.keys(state.edits[si]).length) return true
  if (state.infoEdits[si] && Object.keys(state.infoEdits[si]).length) return true
  if (state.summaryEdits[si] && Object.keys(state.summaryEdits[si]).length)
    return true
  for (const k of state.deletedRows) if (k.startsWith(`${si}:`)) return true
  for (const k of state.deletedCols) if (k.startsWith(`${si}:`)) return true
  if (state.headerClean[si] && Object.keys(state.headerClean[si]).length)
    return true
  if (state.prodName[si] && Object.keys(state.prodName[si]).length) return true
  if (state.pageMeta[si]?.structureDirty) return true
  const fields = state.rawDocs[si]?.fields as Record<string, unknown> | undefined
  if (fields) {
    const rawOil = fields.oil_type
    const origOil =
      rawOil == null
        ? ""
        : typeof rawOil === "object"
          ? String((rawOil as { content?: unknown }).content ?? "")
          : String(rawOil)
    const metaOil = state.pageMeta[si]?.oilType ?? state.cur[si]?.oilType ?? ""
    if (metaOil !== origOil) return true
  }
  const map = state.colMap[si] || []
  const sec = state.cur[si]
  if (!sec) return false
  for (let ci = 0; ci < sec.headers.length; ci++) {
    const suggested = suggestCanon(sec.headers[ci], sec.formType)
    if ((map[ci] || "") !== suggested) return true
  }
  return false
}

export function Form0701ReviewApp({ setKey, backHref }: Props) {
  const [health, setHealth] = useState<{
    kind: "work" | "ok" | "bad"
    text: string
  }>({ kind: "work", text: "เช็ค staging…" })
  const [state, setState] = useState<FileState>(createEmptyFileState)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLabel, setPdfLabel] = useState("")
  const [activeSi, setActiveSi] = useState(0)
  const [showGrid, setShowGrid] = useState(true)
  const [fullNames, setFullNames] = useState(false)
  /** Group consecutive pages that share the same oil_type name. */
  const [groupByName, setGroupByName] = useState(false)
  const [tableSearch, setTableSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<{
    si: number
    ci: number
    x: number
    y: number
  } | null>(null)
  const [extraCanonTick, setExtraCanonTick] = useState(0)
  const pdfBytesRef = useRef<ArrayBuffer | null>(null)
  const pdfUrlRef = useRef<string | null>(null)
  const reviewScrollRef = useRef<HTMLElement | null>(null)
  /** Skip scroll-spy hash writes while programmatically scrolling from a click/hash. */
  const hashNavLockRef = useRef(false)

  const editCount = useMemo(() => countEdits(state), [state])

  const displayGroups = useMemo(
    () => buildOilDisplayGroups(state, groupByName),
    // Only re-group when pages / oil names / toggle change — not on every cell edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.cur, state.pageMeta, groupByName]
  )

  const navigateToHashTarget = useCallback(
    (opts?: { smooth?: boolean; push?: boolean }) => {
      const target = parseHashTarget()
      if (!target || !state.cur.length) return false
      let el: HTMLElement | null = null
      let si = 0
      if (target.kind === "grp") {
        el = document.getElementById(`grp-${target.n}`)
        const g = displayGroups[target.n]
        if (g) si = g.indices[0]
      } else {
        el = document.getElementById(`sec-${target.n}`)
        si = target.n
      }
      if (!el) return false
      hashNavLockRef.current = true
      setActiveSi(si)
      el.scrollIntoView({
        behavior: opts?.smooth === false ? "auto" : "smooth",
        block: "start",
      })
      if (opts?.push) pushUrlHash(el.id, "push")
      window.setTimeout(() => {
        hashNavLockRef.current = false
      }, 600)
      return true
    },
    [state.cur.length, displayGroups]
  )

  const goToGroup = useCallback(
    (g: OilDisplayGroup, gi: number) => {
      const id = hashIdForGroup(g, gi, groupByName)
      hashNavLockRef.current = true
      setActiveSi(g.indices[0])
      pushUrlHash(id, "push")
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      window.setTimeout(() => {
        hashNavLockRef.current = false
      }, 600)
    },
    [groupByName]
  )

  // Scroll-spy: update active tab + hash while scrolling the review pane
  useEffect(() => {
    if (!state.cur.length) return
    const root = reviewScrollRef.current
    const ids = displayGroups.map((g, gi) =>
      hashIdForGroup(g, gi, groupByName)
    )
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)
    if (!elements.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (hashNavLockRef.current) return
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              (a.boundingClientRect.top || 0) - (b.boundingClientRect.top || 0)
          )
        const top = visible[0]
        if (!top?.target?.id) return
        const id = top.target.id
        const grpMatch = id.match(/^grp-(\d+)$/)
        const secMatch = id.match(/^sec-(\d+)$/)
        let nextSi: number | null = null
        if (grpMatch) {
          const g = displayGroups[Number(grpMatch[1])]
          if (g) nextSi = g.indices[0]
        } else if (secMatch) {
          nextSi = Number(secMatch[1])
        }
        if (nextSi != null) {
          setActiveSi((prev) => (prev === nextSi ? prev : nextSi))
        }
        pushUrlHash(id, "replace")
      },
      {
        root: root ?? null,
        rootMargin: "-12% 0px -70% 0px",
        threshold: [0, 0.25],
      }
    )
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [state.cur.length, displayGroups, groupByName])

  // Apply hash on load / when sections appear / when hash changes (back/forward)
  useEffect(() => {
    if (!state.cur.length) return
    const apply = () => {
      navigateToHashTarget({ smooth: false })
    }
    // Defer until DOM ids exist
    const t = window.setTimeout(apply, 50)
    const onHash = () => {
      navigateToHashTarget({ smooth: true })
    }
    window.addEventListener("hashchange", onHash)
    window.addEventListener("popstate", onHash)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("hashchange", onHash)
      window.removeEventListener("popstate", onHash)
    }
  }, [state.cur.length, groupByName, navigateToHashTarget])

  const showStatus = useCallback((kind: StatusKind, text: string) => {
    if (kind === "idle") {
      toast.dismiss(STATUS_TOAST_ID)
      return
    }
    if (kind === "work") {
      toast.loading(text, { id: STATUS_TOAST_ID })
      return
    }
    if (kind === "ok") {
      toast.success(text, { id: STATUS_TOAST_ID })
      return
    }
    toast.error(text, { id: STATUS_TOAST_ID })
  }, [])

  useEffect(() => {
    loadExtraCanon()
    setExtraCanonTick((t) => t + 1)
    void (async () => {
      try {
        const d = await fetchHealth()
        if (d.ok) {
          setHealth({
            kind: "ok",
            text: `staging ✓ (${d.upstreamStatus ?? "ok"})`,
          })
        } else {
          setHealth({ kind: "bad", text: `staging ✕ ${d.error || "error"}` })
        }
      } catch {
        setHealth({ kind: "bad", text: "server ยังไม่รัน?" })
      }
    })()
  }, [])

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  const initFromSections = useCallback(
    (sections: Section[], name: string, docs: CosmosDoc[]) => {
      const pageMeta: FileState["pageMeta"] = {}
      const cur: Section[] = []
      const colMap: string[][] = []
      const displayOrder: number[][] = []
      const prodName: FileState["prodName"] = {}

      sections.forEach((sec, si) => {
        const key = formKeyOf(sec.formType)
        let map =
          key === "07_04"
            ? sec.headers.map(() => "")
            : sec.headers.map((h) =>
                normalizeCanon(suggestCanon(h, sec.formType))
              )
        let nextSec = sec
        let structureDirty = false
        let order = buildDisplayOrder(sec.headers.length, map)
        let names: Record<number, string> = {}
        if (key === "07_01") {
          const forced = ensureForcedReceiveColumns(sec, map)
          nextSec = forced.section
          map = forced.colMap
          order = forced.displayOrder
          structureDirty = forced.mutated
          names = forced.productNames
        }
        pageMeta[si] = { oilType: sec.oilType || "", structureDirty }
        cur.push(nextSec)
        colMap.push(map)
        displayOrder.push(order)
        nextSec.headers.forEach((h, ci) => {
          if (!isProductCanon(map[ci])) return
          const pname = names[ci] || productNameFromHeader(h)
          if (pname) {
            if (!prodName[si]) prodName[si] = {}
            prodName[si][ci] = pname
          }
        })
      })

      setState({
        ...createEmptyFileState(),
        cur,
        sourceName: name,
        colMap,
        displayOrder,
        rawDocs: docs,
        prodName,
        pageMeta,
      })
      setActiveSi(0)
    },
    []
  )

  const mergePdfs = useCallback(async (docs: CosmosDoc[]) => {
    const blobDocs = docs
      .filter((d) => d.blobFileName)
      .slice()
      .sort((a, b) => (Number(a.pageNumber) || 0) - (Number(b.pageNumber) || 0))
    if (!blobDocs.length) {
      setPdfUrl(null)
      setPdfLabel("")
      pdfBytesRef.current = null
      return
    }
    showStatus("work", `กำลังรวม PDF ${blobDocs.length} หน้า…`)
    const bufs: ArrayBuffer[] = []
    for (const b of blobDocs) {
      try {
        bufs.push(await fetchBlob(String(b.blobFileName)))
      } catch {
        /* skip missing */
      }
    }
    if (!bufs.length) return
    let mergedBytes: Uint8Array
    if (bufs.length === 1) {
      mergedBytes = new Uint8Array(bufs[0])
    } else {
      const merged = await PDFDocument.create()
      for (const buf of bufs) {
        try {
          const d = await PDFDocument.load(buf)
          const pages = await merged.copyPages(d, d.getPageIndices())
          pages.forEach((p) => merged.addPage(p))
        } catch {
          /* skip bad page */
        }
      }
      mergedBytes = await merged.save()
    }
    const copy = new Uint8Array(mergedBytes.byteLength)
    copy.set(mergedBytes)
    pdfBytesRef.current = copy.buffer
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    const url = URL.createObjectURL(
      new Blob([copy], { type: "application/pdf" })
    )
    pdfUrlRef.current = url
    setPdfUrl(url)
    setPdfLabel(`${blobDocs.length} หน้ารวม`)
  }, [showStatus])

  const loadSet = useCallback(
    async (dg: string) => {
      setBusy(true)
      showStatus("work", "กำลังดึงจาก Cosmos (เลขชุด)…")
      try {
        const { items } = await fetchGroup(dg)
        if (!items.length) {
          showStatus("err", "ไม่พบเอกสารใน Cosmos")
          return
        }
        const sections: Section[] = []
        const docs: CosmosDoc[] = []
        for (const it of items) {
          const fields = (it.fields || {}) as Record<string, unknown>
          let secs = parseData(fields)
          if (!secs.length) {
            const txt = String(
              (fields as { extractedText?: string }).extractedText || ""
            )
            secs = [
              {
                formType: String(it.docType || "?"),
                page: String(it.pageNumber ?? "?"),
                oilType: "",
                branch: "",
                infoKeys: null,
                summaryTable: null,
                summaryExtra: {},
                headers: ["หน้านี้ไม่มีตาราง OCR — มีแค่ข้อความดิบ"],
                rows: [
                  {
                    kind: "data",
                    cells: [
                      txt.slice(0, 500) + (txt.length > 500 ? "…" : ""),
                    ],
                  },
                ],
              },
            ]
          }
          for (const s of secs) {
            sections.push(s)
            docs.push(it)
          }
        }
        initFromSections(sections, dg.split("/").pop() || dg, docs)
        await mergePdfs(items)
        showStatus("ok", `ดึงจาก Cosmos แล้ว — ${items.length} หน้า`)
      } catch (e) {
        showStatus(
          "err",
          `Cosmos: ${e instanceof Error ? e.message : String(e)}`
        )
      } finally {
        setBusy(false)
      }
    },
    [initFromSections, mergePdfs, showStatus]
  )

  useEffect(() => {
    if (!setKey) {
      showStatus("idle", "")
      return
    }
    void loadSet(setKey)
  }, [setKey, loadSet, showStatus])

  const updateColMap = (si: number, ci: number, value: string) => {
    setState((prev) => {
      const normalized = normalizeCanon(value) || value
      const colMap = prev.colMap.map((row, i) =>
        i === si ? row.map((c, j) => (j === ci ? normalized : c)) : [...row]
      )
      if (!colMap[si]) colMap[si] = []
      while (colMap[si].length <= ci) colMap[si].push("")
      colMap[si][ci] = normalized
      const prodName = { ...prev.prodName }
      if (isProductCanon(normalized)) {
        const h = prev.cur[si]?.headers[ci] || ""
        const extracted = productNameFromHeader(h)
        if (extracted && !prodName[si]?.[ci]) {
          prodName[si] = { ...(prodName[si] || {}), [ci]: extracted }
        }
      }
      const displayOrder = prev.displayOrder.map((row) => [...row])
      while (displayOrder.length <= si) displayOrder.push([])
      displayOrder[si] = buildDisplayOrder(
        prev.cur[si]?.headers.length || colMap[si].length,
        colMap[si],
        deletedCiSet(si, prev.deletedCols)
      )
      let next: FileState = { ...prev, colMap, prodName, displayOrder }

      // When grouped: if this is the first page, fill empty slots on later pages only
      if (groupByName) {
        const indices = findGroupIndicesForPage(next, si, true)
        if (indices && indices[0] === si) {
          const patched = propagateColMapFromFirst(next, indices, ci)
          if (patched) next = patched
        }
      }
      return next
    })
  }

  const updateCell = (si: number, ri: number, ci: number, value: string) => {
    setState((prev) => {
      const edits = { ...prev.edits }
      edits[si] = { ...(edits[si] || {}) }
      edits[si][ri] = { ...(edits[si][ri] || {}), [ci]: value }
      return { ...prev, edits }
    })
  }

  const updateProdName = (si: number, ci: number, value: string) => {
    setState((prev) => ({
      ...prev,
      prodName: {
        ...prev.prodName,
        [si]: { ...(prev.prodName[si] || {}), [ci]: value },
      },
    }))
  }

  const updateOilType = (si: number, value: string) => {
    setState((prev) => {
      const cur = prev.cur.map((s, i) =>
        i === si ? { ...s, oilType: value } : s
      )
      let next: FileState = {
        ...prev,
        cur,
        pageMeta: {
          ...prev.pageMeta,
          [si]: { ...(prev.pageMeta[si] || {}), oilType: value },
        },
      }
      if (groupByName) next = propagateAllGroupColMaps(next)
      return next
    })
  }

  /** When grouped, editing oil_type applies to every page in the run. */
  const updateOilTypeGroup = (indices: number[], value: string) => {
    setState((prev) => {
      const cur = prev.cur.map((s, i) =>
        indices.includes(i) ? { ...s, oilType: value } : s
      )
      const pageMeta = { ...prev.pageMeta }
      for (const si of indices) {
        pageMeta[si] = { ...(pageMeta[si] || {}), oilType: value }
      }
      let next: FileState = { ...prev, cur, pageMeta }
      if (groupByName) next = propagateAllGroupColMaps(next)
      return next
    })
  }

  const deleteCol = (si: number, ci: number) => {
    setState((prev) => {
      const deletedCols = new Set(prev.deletedCols)
      deletedCols.add(`${si}:${ci}`)
      const displayOrder = [...prev.displayOrder]
      displayOrder[si] = buildDisplayOrder(
        prev.cur[si]?.headers.length || 0,
        prev.colMap[si] || [],
        deletedCiSet(si, deletedCols)
      )
      return { ...prev, deletedCols, displayOrder }
    })
  }

  const deleteRow = (si: number, ri: number) => {
    setState((prev) => {
      const deletedRows = new Set(prev.deletedRows)
      deletedRows.add(`${si}:${ri}`)
      return { ...prev, deletedRows }
    })
  }

  /** Insert empty column after `afterCi` (−1 = at start). Remaps col indices. */
  const insertCol = (si: number, afterCi: number) => {
    setState((prev) => {
      const sec = prev.cur[si]
      if (!sec) return prev
      const at = afterCi + 1
      const cur = prev.cur.map((s, i) => {
        if (i !== si) return s
        const headers = [...s.headers]
        headers.splice(at, 0, "")
        const rows = s.rows.map((r) => {
          const cells = [...r.cells]
          cells.splice(at, 0, "")
          return { ...r, cells }
        })
        return { ...s, headers, rows }
      })
      const colMap = prev.colMap.map((row, i) => {
        if (i !== si) return [...row]
        const next = [...(row || [])]
        while (next.length < sec.headers.length) next.push("")
        next.splice(at, 0, "")
        return next
      })
      const remap = <T,>(obj: Record<number, T> | undefined): Record<number, T> => {
        if (!obj) return {}
        const out: Record<number, T> = {}
        for (const [k, v] of Object.entries(obj)) {
          const ci = +k
          out[ci >= at ? ci + 1 : ci] = v
        }
        return out
      }
      const prodName = { ...prev.prodName, [si]: remap(prev.prodName[si]) }
      const headerClean = {
        ...prev.headerClean,
        [si]: remap(prev.headerClean[si]),
      }
      const edits: typeof prev.edits = { ...prev.edits }
      if (edits[si]) {
        const rowEdits: Record<number, Record<number, string>> = {}
        for (const [ri, cols] of Object.entries(edits[si])) {
          rowEdits[+ri] = remap(cols)
        }
        edits[si] = rowEdits
      }
      const deletedCols = new Set<string>()
      for (const key of prev.deletedCols) {
        const [s, c] = key.split(":").map(Number)
        if (s !== si) deletedCols.add(key)
        else deletedCols.add(`${si}:${c >= at ? c + 1 : c}`)
      }
      const nextColMap = colMap[si] || []
      const displayOrder = prev.displayOrder.map((row, i) => [...row])
      while (displayOrder.length <= si) displayOrder.push([])
      displayOrder[si] = buildDisplayOrder(
        cur[si]?.headers.length || nextColMap.length,
        nextColMap,
        deletedCiSet(si, deletedCols)
      )
      return {
        ...prev,
        cur,
        colMap,
        prodName,
        headerClean,
        edits,
        deletedCols,
        displayOrder,
      }
    })
  }

  /** Insert empty data row after `afterRi` (−1 = at start). */
  const insertRow = (si: number, afterRi: number) => {
    setState((prev) => {
      const sec = prev.cur[si]
      if (!sec) return prev
      const at = afterRi + 1
      const ncol = sec.headers.length
      const cur = prev.cur.map((s, i) => {
        if (i !== si) return s
        const rows = [...s.rows]
        rows.splice(at, 0, {
          kind: "data",
          cells: Array(ncol).fill(""),
        })
        return { ...s, rows }
      })
      const edits: typeof prev.edits = { ...prev.edits }
      if (edits[si]) {
        const next: Record<number, Record<number, string>> = {}
        for (const [ri, cols] of Object.entries(edits[si])) {
          const r = +ri
          next[r >= at ? r + 1 : r] = cols
        }
        edits[si] = next
      }
      const deletedRows = new Set<string>()
      for (const key of prev.deletedRows) {
        const [s, r] = key.split(":").map(Number)
        if (s !== si) deletedRows.add(key)
        else deletedRows.add(`${si}:${r >= at ? r + 1 : r}`)
      }
      return { ...prev, cur, edits, deletedRows }
    })
  }

  const handleAiMap = async (si: number) => {
    const sec = state.cur[si]
    if (!sec) return
    const headers = sec.headers
    if (!headers.length) {
      showStatus("err", "ไม่มีหัวคอลัมน์ให้แมพ")
      return
    }
    setBusy(true)
    showStatus("work", "AI กำลังจับคู่คอลัมน์…")
    try {
      let pdf: string | undefined
      if (pdfBytesRef.current) {
        pdf = arrayBufferToBase64(pdfBytesRef.current)
      }
      const d = await postAiMap({
        headers,
        canonical: canonFor(sec.formType),
        pdf,
      })
      setState((prev) => {
        let colMap = prev.colMap.map((r) => [...r])
        const prodName = { ...prev.prodName, [si]: { ...(prev.prodName[si] || {}) } }
        const headerClean = {
          ...prev.headerClean,
          [si]: { ...(prev.headerClean[si] || {}) },
        }
        let applied = 0
        let cur = prev.cur
        headers.forEach((h, ci) => {
          let mapped = d.mapping?.[h]
          if (mapped != null) {
            mapped = normalizeCanon(mapped)
            if (!colMap[si]) colMap[si] = []
            while (colMap[si].length <= ci) colMap[si].push("")
            colMap[si][ci] = mapped
            applied++
            if (
              mapped &&
              !isProductCanon(mapped) &&
              !canonFor(sec.formType).includes(mapped)
            ) {
              addExtraCanon(mapped)
            }
          }
          const extracted = productNameFromHeader(h)
          const aiName = d.products?.[h]
          if (isProductCanon(mapped || colMap[si]?.[ci])) {
            if (extracted) prodName[si][ci] = extracted
            else if (aiName) prodName[si][ci] = aiName
          }
          const cleaned = d.headerClean?.[h]
          if (cleaned && cleaned !== h) headerClean[si][ci] = cleaned
        })
        let pageMeta = prev.pageMeta
        let displayOrder = prev.displayOrder.map((r) => [...r])
        if (formKeyOf(sec.formType) === "07_01" && prev.cur[si]) {
          const forced = ensureForcedReceiveColumns(prev.cur[si], colMap[si] || [])
          cur = prev.cur.map((s, i) => (i === si ? forced.section : s))
          colMap = colMap.map((row, i) => (i === si ? forced.colMap : row))
          while (displayOrder.length <= si) displayOrder.push([])
          displayOrder[si] = forced.displayOrder
          for (const [ciStr, pname] of Object.entries(forced.productNames)) {
            const ci = +ciStr
            if (pname && !prodName[si][ci]) prodName[si][ci] = pname
          }
          // Fill any product cols still missing a name
          ;(cur[si]?.headers || []).forEach((h, ci) => {
            if (!isProductCanon(colMap[si]?.[ci])) return
            if (prodName[si][ci]) return
            const pname = productNameFromHeader(h)
            if (pname) prodName[si][ci] = pname
          })
          pageMeta = {
            ...prev.pageMeta,
            [si]: {
              ...(prev.pageMeta[si] || {}),
              structureDirty:
                forced.mutated || !!prev.pageMeta[si]?.structureDirty,
            },
          }
        } else {
          while (displayOrder.length <= si) displayOrder.push([])
          displayOrder[si] = buildDisplayOrder(
            (cur[si] || prev.cur[si])?.headers.length || 0,
            colMap[si] || [],
            deletedCiSet(si, prev.deletedCols)
          )
        }
        void applied
        let next: FileState = {
          ...prev,
          cur,
          colMap,
          prodName,
          headerClean,
          pageMeta,
          displayOrder,
        }
        if (groupByName) {
          const indices = findGroupIndicesForPage(next, si, true)
          if (indices && indices[0] === si) {
            const patched = propagateColMapFromFirst(next, indices)
            if (patched) next = patched
          }
        }
        return next
      })
      setExtraCanonTick((t) => t + 1)
      showStatus("ok", `AI แมพแล้ว — กรุณาตรวจสอบ`)
    } catch (e) {
      showStatus(
        "err",
        `AI: ${e instanceof Error ? e.message : String(e)}`
      )
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    const idxs = state.cur
      .map((_, si) => si)
      .filter((si) => state.rawDocs[si] && hasSectionChanges(state, si))
    if (!idxs.length) {
      showStatus("ok", "ไม่มีการแก้ไข — ไม่ต้องเซฟ")
      return
    }
    setBusy(true)
    showStatus("work", `กำลังเซฟกลับ Cosmos… (${idxs.length} หน้า)`)
    try {
      const ctx: RebuildContext = {
        cur: state.cur,
        rawDocs: state.rawDocs,
        colMap: state.colMap,
        displayOrder: state.displayOrder,
        edits: state.edits,
        deletedRows: state.deletedRows,
        deletedCols: state.deletedCols,
        pageMeta: state.pageMeta,
        prodName: state.prodName,
        headerClean: state.headerClean,
        infoEdits: state.infoEdits,
        summaryEdits: state.summaryEdits,
      }
      const byId = new Map<string, { doc: CosmosDoc; sis: number[] }>()
      for (const si of idxs) {
        const id = state.rawDocs[si]?.id
        if (!id) continue
        const prev = byId.get(id)
        if (prev) {
          prev.doc = rebuildFields(si, ctx, prev.doc)
          prev.sis.push(si)
        } else {
          byId.set(id, { doc: rebuildFields(si, ctx), sis: [si] })
        }
      }
      for (const [id, { doc }] of byId) {
        await putCorrected(id, doc)
      }
      setState((prev) => {
        const rawDocs = [...prev.rawDocs]
        const pageMeta = { ...prev.pageMeta }
        for (const { doc, sis } of byId.values()) {
          for (const si of sis) {
            rawDocs[si] = {
              ...rawDocs[si],
              fields: doc.fields,
              fields_original: doc.fields_original,
            }
            pageMeta[si] = {
              ...(pageMeta[si] || {}),
              structureDirty: false,
              oilType:
                pageMeta[si]?.oilType ?? prev.cur[si]?.oilType ?? "",
            }
          }
        }
        return { ...prev, rawDocs, pageMeta }
      })
      showStatus("ok", `เซฟ corrected แล้ว — ${byId.size} เอกสาร`)
    } catch (e) {
      showStatus(
        "err",
        `เซฟล้มเหลว: ${e instanceof Error ? e.message : String(e)}`
      )
    } finally {
      setBusy(false)
    }
  }

  const handleExportJson = () => {
    const pages = state.cur.map((sec, si) => {
      const visCols = visColsForSection(state, si)
      const columns = visCols.map((ci) => {
        const mapped = normalizeCanon(state.colMap[si]?.[ci])
        if (isProductCanon(mapped))
          return state.prodName[si]?.[ci] || sec.headers[ci] || "ผลิตภัณฑ์"
        if (mapped) return mapped
        return state.headerClean[si]?.[ci] || sec.headers[ci] || ""
      })
      const rows = sec.rows
        .map((r, ri) => {
          if (state.deletedRows.has(`${si}:${ri}`)) return null
          return visCols.map((ci) => {
            const ed = state.edits[si]?.[ri]?.[ci]
            return ed != null ? ed : r.cells[ci] ?? ""
          })
        })
        .filter(Boolean)
      return {
        page: sec.page,
        form_type: sec.formType,
        oil_type: state.pageMeta[si]?.oilType ?? sec.oilType ?? "",
        columns,
        rows,
      }
    })
    const out = {
      exportedAt: new Date().toISOString(),
      source: state.sourceName,
      form: state.cur[0]?.formType || "ภส.07-01",
      pages,
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], {
      type: "application/json",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${state.sourceName || "0701"}-corrected.json`
    a.click()
    URL.revokeObjectURL(a.href)
    showStatus("ok", `Export JSON แล้ว — ${a.download}`)
  }

  const handleExportExcel = async () => {
    setBusy(true)
    showStatus("work", "กำลังเตรียม Excel…")
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()
      const used = new Set<string>()
      state.cur.forEach((sec, si) => {
        const visCols = visColsForSection(state, si)
        const columns = visCols.map((ci) => {
          const mapped = normalizeCanon(state.colMap[si]?.[ci])
          if (isProductCanon(mapped))
            return state.prodName[si]?.[ci] || sec.headers[ci] || "ผลิตภัณฑ์"
          if (mapped) return mapped
          return state.headerClean[si]?.[ci] || sec.headers[ci] || ""
        })
        const rows = sec.rows
          .filter((_, ri) => !state.deletedRows.has(`${si}:${ri}`))
          .map((r, ri) =>
            visCols.map((ci) => {
              const ed = state.edits[si]?.[ri]?.[ci]
              return ed != null ? ed : r.cells[ci] ?? ""
            })
          )
        const aoa = [columns, ...rows]
        let name = String(sec.page || `p${si}`).replace(/[\\/?*[\]:]/g, "")
        const base = name
        let n = 1
        while (used.has(name)) name = `${base}_${++n}`
        used.add(name)
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet(aoa),
          name.slice(0, 31)
        )
      })
      const fn = `${state.sourceName || "0701"}.xlsx`
      XLSX.writeFile(wb, fn)
      showStatus("ok", `Export Excel แล้ว — ${fn}`)
    } catch (e) {
      showStatus(
        "err",
        e instanceof Error ? e.message : String(e)
      )
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async () => {
    if (!(await swalConfirm("ล้างการแก้ทั้งหมดของชุดนี้?"))) return
    setState((prev) => {
      const pageMeta: FileState["pageMeta"] = {}
      const cur: Section[] = []
      const colMap: string[][] = []
      const displayOrder: number[][] = []
      const prodName: FileState["prodName"] = {}
      prev.cur.forEach((sec, si) => {
        const key = formKeyOf(sec.formType)
        let map =
          key === "07_04"
            ? sec.headers.map(() => "")
            : sec.headers.map((h) =>
                normalizeCanon(suggestCanon(h, sec.formType))
              )
        let nextSec = {
          ...sec,
          oilType: prev.pageMeta[si]?.oilType ?? sec.oilType,
        }
        let structureDirty = false
        let order = buildDisplayOrder(nextSec.headers.length, map)
        let names: Record<number, string> = {}
        if (key === "07_01") {
          const forced = ensureForcedReceiveColumns(nextSec, map)
          nextSec = forced.section
          map = forced.colMap
          order = forced.displayOrder
          structureDirty = forced.mutated
          names = forced.productNames
        }
        pageMeta[si] = {
          oilType: nextSec.oilType || "",
          structureDirty,
        }
        cur.push(nextSec)
        colMap.push(map)
        displayOrder.push(order)
        nextSec.headers.forEach((h, ci) => {
          if (!isProductCanon(map[ci])) return
          const pname = names[ci] || productNameFromHeader(h)
          if (pname) {
            if (!prodName[si]) prodName[si] = {}
            prodName[si][ci] = pname
          }
        })
      })
      return {
        ...prev,
        edits: {},
        deletedRows: new Set(),
        deletedCols: new Set(),
        infoEdits: {},
        summaryEdits: {},
        headerClean: {},
        cur,
        colMap,
        displayOrder,
        prodName,
        pageMeta,
      }
    })
    showStatus("ok", "ล้างการแก้แล้ว")
  }

  const handleReocr = async (si: number) => {
    const doc = state.rawDocs[si]
    if (!doc?.blobFileName) {
      showStatus("err", "ไม่พบ blobFileName สำหรับหน้านี้")
      return
    }
    setBusy(true)
    showStatus("work", `กำลัง Re-OCR หน้า ${state.cur[si]?.page || si}…`)
    try {
      const ocrData = (await postReocr(
        String(doc.blobFileName),
        doc.plainOriginalFileName
          ? String(doc.plainOriginalFileName)
          : undefined
      )) as Record<string, unknown>
      const fields =
        (ocrData.fields as Record<string, unknown>) ||
        (ocrData.result ? ocrData : ocrData)
      const secs = parseData(fields)
      if (!secs.length) throw new Error("OCR สำเร็จ แต่ไม่พบตาราง")
      setState((prev) => {
        const cur = [...prev.cur]
        const colMap = prev.colMap.map((r) => [...r])
        let s = secs[0]
        const key = formKeyOf(s.formType)
        let map =
          key === "07_04"
            ? s.headers.map(() => "")
            : s.headers.map((h) =>
                normalizeCanon(suggestCanon(h, s.formType))
              )
        if (key === "07_01") {
          const forced = ensureForcedReceiveColumns(s, map)
          s = forced.section
          map = forced.colMap
          // Preserve editable oil_type if user already set it
          const oil =
            prev.pageMeta[si]?.oilType ||
            s.oilType ||
            prev.cur[si]?.oilType ||
            ""
          s = { ...s, oilType: oil }
          cur[si] = s
          colMap[si] = map
          const displayOrder = prev.displayOrder.map((r) => [...r])
          while (displayOrder.length <= si) displayOrder.push([])
          displayOrder[si] = forced.displayOrder
          const prodName = {
            ...prev.prodName,
            [si]: { ...forced.productNames },
          }
          const rawDocs = [...prev.rawDocs]
          rawDocs[si] = { ...doc, fields }
          return {
            ...prev,
            cur,
            colMap,
            displayOrder,
            prodName,
            rawDocs,
            edits: { ...prev.edits, [si]: {} },
            pageMeta: {
              ...prev.pageMeta,
              [si]: {
                ...(prev.pageMeta[si] || {}),
                oilType: oil,
                structureDirty: forced.mutated,
              },
            },
          }
        }
        // Preserve editable oil_type if user already set it
        const oil =
          prev.pageMeta[si]?.oilType || s.oilType || prev.cur[si]?.oilType || ""
        s = { ...s, oilType: oil }
        cur[si] = s
        colMap[si] = map
        const displayOrder = prev.displayOrder.map((r) => [...r])
        while (displayOrder.length <= si) displayOrder.push([])
        displayOrder[si] = buildDisplayOrder(
          s.headers.length,
          map,
          deletedCiSet(si, prev.deletedCols)
        )
        const rawDocs = [...prev.rawDocs]
        rawDocs[si] = { ...doc, fields }
        return {
          ...prev,
          cur,
          colMap,
          displayOrder,
          rawDocs,
          edits: { ...prev.edits, [si]: {} },
          pageMeta: {
            ...prev.pageMeta,
            [si]: { ...(prev.pageMeta[si] || {}), oilType: oil },
          },
        }
      })
      showStatus("ok", `Re-OCR สำเร็จ — หน้า ${secs[0].page}`)
    } catch (e) {
      showStatus(
        "err",
        `Re-OCR ล้มเหลว: ${e instanceof Error ? e.message : String(e)}`
      )
    } finally {
      setBusy(false)
    }
  }

  void extraCanonTick

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-slate-950 text-slate-200",
        !showGrid && "[&_td]:border-r-transparent [&_th]:border-r-transparent",
        fullNames && "[&_.ohdr]:max-w-none [&_.ohdr]:whitespace-normal"
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <h1 className="text-sm font-semibold text-slate-100">
          ภส.07-01 · รีวิว OCR
        </h1>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
            health.kind === "ok" &&
              "border-emerald-900/50 bg-emerald-950/50 text-emerald-300",
            health.kind === "bad" &&
              "border-red-900/60 bg-red-950/40 text-red-200",
            health.kind === "work" &&
              "border-cyan-900/50 bg-cyan-950/40 text-cyan-200"
          )}
        >
          {health.text}
        </span>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {editCount > 0 ? (
            <span className="rounded-md border border-emerald-900/50 bg-emerald-950/40 px-2 py-0.5 text-emerald-200">
              แก้ {editCount} เซลล์
            </span>
          ) : null}
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            เส้นตาราง
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={fullNames}
              onChange={(e) => setFullNames(e.target.checked)}
            />
            ชื่อเต็ม
          </label>
          <label className="flex items-center gap-1" title="รวมหน้าต่อเนื่องที่วัตถุดิบชื่อเดียวกัน">
            <input
              type="checkbox"
              checked={groupByName}
              onChange={(e) => {
                const on = e.target.checked
                setGroupByName(on)
                if (on) {
                  setState((prev) => propagateAllGroupColMaps(prev))
                }
              }}
            />
            จัดกลุ่มตามชื่อ
          </label>
          <input
            type="search"
            placeholder="ค้นหาในตาราง..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="h-7 rounded-md border border-slate-700 bg-slate-950 px-2 text-slate-200 outline-none focus:border-cyan-400"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!state.cur.length || busy}
            onClick={handleReset}
            className="h-7 border-slate-600 bg-slate-900"
          >
            <RotateCcw className="size-3.5" />
            ล้างการแก้
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!state.cur.length || busy}
            onClick={() => void handleExportExcel()}
            className="h-7 border-slate-600 bg-slate-900"
          >
            <FileSpreadsheet className="size-3.5" />
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!state.cur.length || busy || !state.rawDocs.some(Boolean)}
            onClick={() => void handleSave()}
            className="h-7 border-slate-600 bg-slate-900"
          >
            <Save className="size-3.5" />
            เซฟ Cosmos
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!state.cur.length || busy}
            onClick={handleExportJson}
            className="h-7 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            <FileJson className="size-3.5" />
            JSON
          </Button>
        </div>
      </header>

      {setKey ? (
        <div className="border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-500">
          ชุด <span className="font-mono text-slate-300">{setKey}</span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(280px,38%)_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
            <b className="text-slate-200">ต้นฉบับ PDF</b>
            <span>{pdfLabel}</span>
          </div>
          {pdfUrl ? (
            <iframe
              title="pdf"
              src={pdfUrl}
              className="min-h-[50vh] w-full flex-1 bg-slate-700 lg:min-h-0"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
              {busy ? "กำลังโหลด…" : "ยังไม่มี PDF"}
            </div>
          )}
        </section>

        <section ref={reviewScrollRef} className="min-h-0 overflow-auto">
          {!state.cur.length ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-sm text-slate-500">
              {setKey
                ? busy
                  ? "กำลังโหลดชุดเอกสาร…"
                  : "ไม่พบตาราง"
                : "เปิดจากโต๊ะเอกสาร (ปุ่ม รีวิว 07-01) เพื่อโหลดชุด ภส.07-01"}
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 mb-2 flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-950 py-2">
                {displayGroups.map((g, gi) => {
                  const active = g.indices.includes(activeSi)
                  return (
                    <button
                      key={g.key + gi}
                      type="button"
                      onClick={() => goToGroup(g, gi)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        active
                          ? "border-cyan-400 bg-cyan-500 text-slate-950"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                      )}
                    >
                      {groupByName
                        ? formatGroupNavLabel(state, g)
                        : formatPageLabel(state.cur[g.indices[0]], g.indices[0])}
                    </button>
                  )
                })}
              </div>
              <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>
                  <span className="mr-1 inline-block size-2.5 rounded-sm bg-sky-900" />
                  ยอดยกมา
                </span>
                <span>
                  <span className="mr-1 inline-block size-2.5 rounded-sm bg-amber-900" />
                  แถวรวม
                </span>
                <span>
                  <span className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-900" />
                  แก้แล้ว
                </span>
              </div>
              <div className="space-y-6">
                {displayGroups.map((g, gi) => {
                  const renderPageBlock = (si: number, hideOilMeta: boolean) => {
                    const sec = state.cur[si]
                    if (!sec) return null
                    return (
                      <div
                        key={si}
                        id={`sec-${si}`}
                        className={cn(
                          hideOilMeta
                            ? "border-t border-slate-800"
                            : "overflow-hidden rounded-xl border-2 border-slate-700 bg-slate-900 shadow-lg"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800/80 px-3 py-2">
                          <h2 className="text-sm font-semibold text-slate-100">
                            {formatPageLabel(sec, si)}
                          </h2>
                          <span className="text-[11px] text-slate-500">
                            {sec.rows.length} แถว
                          </span>
                          {state.rawDocs[si]?.id ? (
                            <span
                              className="font-mono text-[11px] text-slate-500"
                              title="document id"
                            >
                              · {String(state.rawDocs[si].id)}
                            </span>
                          ) : null}
                        </div>
                        {!hideOilMeta ? (
                          <div className="flex flex-wrap items-end gap-3 border-b border-teal-900/60 bg-gradient-to-r from-teal-950/40 to-slate-950/80 px-3 py-3">
                            <div className="min-w-[220px] flex-1">
                              <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-teal-400/90">
                                <Pencil className="size-3 shrink-0" aria-hidden />
                                วัตถุดิบที่ออกรายงาน (oil_type)
                              </label>
                              <div className="relative max-w-md">
                                <Pencil
                                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-500/80"
                                  aria-hidden
                                />
                                <input
                                  className="w-full rounded-md border border-teal-800/60 bg-slate-950 py-1.5 pr-3 pl-8 text-sm font-semibold text-teal-100 outline-none placeholder:text-slate-600 focus:border-teal-400"
                                  placeholder="เช่น น้ำมันดิบ / Condensate"
                                  value={
                                    state.pageMeta[si]?.oilType ??
                                    sec.oilType ??
                                    ""
                                  }
                                  onChange={(e) =>
                                    updateOilType(si, e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <p className="pb-1 text-[11px] text-slate-500">
                              อยู่นอกตาราง — ไม่ใช่ชื่อคอลัมน์ผลิตภัณฑ์
                            </p>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/50 px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleAiMap(si)}
                            className="h-7 gap-1.5 border-violet-500/50 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20 hover:text-violet-50"
                          >
                            <Sparkles className="size-3.5 shrink-0" />
                            AI แมพ
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || !state.rawDocs[si]?.blobFileName}
                            title={
                              state.rawDocs[si]?.blobFileName
                                ? "รัน OCR หน้านี้ใหม่จากไฟล์ต้นฉบับ (จะแทนที่ตารางหน้านี้)"
                                : "ไม่มีไฟล์ต้นฉบับสำหรับหน้านี้"
                            }
                            onClick={() => {
                              void (async () => {
                                if (
                                  !(await swalConfirm(
                                    "รัน OCR หน้านี้ใหม่? ตารางและการแก้ในหน้านี้จะถูกแทนที่",
                                    {
                                      title: "รัน OCR ใหม่",
                                      confirmText: "รันใหม่",
                                      cancelText: "ยกเลิก",
                                      destructive: true,
                                    }
                                  ))
                                ) {
                                  return
                                }
                                await handleReocr(si)
                              })()
                            }}
                            className="h-7 gap-1.5 border-amber-500/45 bg-amber-500/10 text-amber-100 hover:border-amber-400/70 hover:bg-amber-500/20 hover:text-amber-50 disabled:border-slate-700 disabled:bg-transparent disabled:text-slate-600"
                          >
                            <RefreshCw
                              className={cn(
                                "size-3.5 shrink-0",
                                busy && "animate-spin"
                              )}
                            />
                            รัน OCR ใหม่
                          </Button>
                        </div>
                        <SectionTable
                          si={si}
                          section={sec}
                          colMap={state.colMap[si] || []}
                          displayOrder={state.displayOrder[si]}
                          edits={state.edits[si] || {}}
                          deletedRows={state.deletedRows}
                          deletedCols={state.deletedCols}
                          prodName={state.prodName[si] || {}}
                          headerClean={state.headerClean[si] || {}}
                          tableSearch={tableSearch}
                          groupedHeader={formKeyOf(sec.formType) === "07_01"}
                          onOpenCanon={(ci, x, y) =>
                            setPicker({ si, ci, x, y })
                          }
                          onCellChange={(ri, ci, v) =>
                            updateCell(si, ri, ci, v)
                          }
                          onProdNameChange={(ci, v) =>
                            updateProdName(si, ci, v)
                          }
                          onDeleteCol={(ci) => deleteCol(si, ci)}
                          onDeleteRow={(ri) => deleteRow(si, ri)}
                          onInsertCol={(ci) => insertCol(si, ci)}
                          onInsertRow={(ri) => insertRow(si, ri)}
                        />
                      </div>
                    )
                  }

                  if (!groupByName || g.indices.length === 1) {
                    return renderPageBlock(g.indices[0], false)
                  }

                  const oilValue =
                    state.pageMeta[g.indices[0]]?.oilType ??
                    state.cur[g.indices[0]]?.oilType ??
                    ""

                  return (
                    <div
                      key={g.key + gi}
                      id={`grp-${gi}`}
                      className="overflow-hidden rounded-xl border-2 border-teal-800/70 bg-slate-900 shadow-lg"
                    >
                      <div className="border-b border-teal-900/60 bg-gradient-to-r from-teal-950/50 to-slate-950 px-3 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-teal-100">
                            <Pencil
                              className="size-3.5 shrink-0 text-teal-400"
                              aria-hidden
                            />
                            {g.label}
                          </h2>
                          <span className="rounded-full border border-teal-800/60 px-2 py-0.5 text-[10px] text-teal-300/90">
                            {g.indices.length} ใบต่อเนื่อง
                          </span>
                        </div>
                        <div className="min-w-[220px] max-w-md">
                          <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-teal-400/90">
                            <Pencil className="size-3 shrink-0" aria-hidden />
                            วัตถุดิบที่ออกรายงาน (oil_type) — ใช้ร่วมทั้งกลุ่ม
                          </label>
                          <div className="relative">
                            <Pencil
                              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-500/80"
                              aria-hidden
                            />
                            <input
                              className="w-full rounded-md border border-teal-800/60 bg-slate-950 py-1.5 pr-3 pl-8 text-sm font-semibold text-teal-100 outline-none placeholder:text-slate-600 focus:border-teal-400"
                              placeholder="เช่น น้ำมันดิบ / Condensate"
                              value={oilValue}
                              onChange={(e) =>
                                updateOilTypeGroup(g.indices, e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-800">
                        {g.indices.map((si) => renderPageBlock(si, true))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {picker ? (
        <CanonPicker
          formType={state.cur[picker.si]?.formType || ""}
          current={state.colMap[picker.si]?.[picker.ci] || ""}
          used={(state.colMap[picker.si] || []).filter(
            (_, ci) => ci !== picker.ci
          )}
          x={picker.x}
          y={picker.y}
          onClose={() => setPicker(null)}
          onSelect={(value) => {
            updateColMap(picker.si, picker.ci, value)
            setPicker(null)
            setExtraCanonTick((t) => t + 1)
          }}
          onExtraAdded={() => setExtraCanonTick((t) => t + 1)}
        />
      ) : null}
    </div>
  )
}
