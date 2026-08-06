/** 07-01 column category registry + forced receive-column normalizer */

import {
  isProductCanon,
  normalizeCanon,
  PRODUCT_CANON,
  productNameFromHeader,
  suggestCanon,
} from "./canon"
import type { Row, Section } from "./types"

export const COL_DATE = "วันที่"
export const COL_DESC = "รายการ"
export const COL_EVIDENCE = "เลขที่"
export const COL_BL = "B/L"
export const COL_OUTTURN = "Outturn"
/** Forced receive qty column — replaces legacy "จำนวนรับ" / "จำนวนรับตามบัญชีสิทธิ์". */
export const COL_RECV_ACCT = "รับตามบัญชีสิทธิ์"
export const COL_OTHER_PRODUCT = "ผลิตสินค้าอื่น"
export const COL_DAMAGED = "เสียหาย"
export const COL_OTHER = "อื่นๆ"
export const COL_TOTAL_OUT = "รวมจ่าย"
export const COL_BALANCE = "คงเหลือ"
export const COL_BALANCE_STOCK = "คงเหลือ Stock"
export const COL_BALANCE_ACCT = "คงเหลือตามบัญชีสิทธิ์"
export const COL_REMARK = "หมายเหตุ"
export const COL_GAIN = "Gain"

/** Forced receive columns — always present after normalize. */
export const FORCED_RECEIVE_COLS = [COL_BL, COL_OUTTURN, COL_RECV_ACCT] as const

/** Forced balance columns — always present after normalize. */
export const FORCED_BALANCE_COLS = [
  COL_BALANCE_STOCK,
  COL_BALANCE_ACCT,
  COL_BALANCE,
] as const

export type ColumnGroupId =
  | "identity"
  | "receive"
  | "pay"
  | "balance"
  | "other"
  | "unknown"

export type ColumnCategory = {
  id: string
  label: string
  group: ColumnGroupId
  /** Multiple columns may share this category (e.g. ผลิตภัณฑ์). */
  repeatable?: boolean
}

export const COLUMN_GROUPS: { id: ColumnGroupId; label: string }[] = [
  { id: "identity", label: "รายการ" },
  { id: "receive", label: "จำนวนรับ" },
  { id: "pay", label: "จำนวนจ่าย" },
  { id: "balance", label: "คงเหลือ" },
  { id: "other", label: "อื่นๆ" },
]

const GROUP_RANK: Record<ColumnGroupId, number> = {
  identity: 0,
  receive: 1,
  pay: 2,
  balance: 3,
  other: 4,
  unknown: 5,
}

/** Preferred leaf order inside the receive group. */
const RECEIVE_LEAF_RANK: Record<string, number> = {
  [COL_BL]: 0,
  [COL_OUTTURN]: 1,
  [COL_RECV_ACCT]: 2,
}

/** Preferred leaf order inside the balance group. */
const BALANCE_LEAF_RANK: Record<string, number> = {
  [COL_BALANCE_STOCK]: 0,
  [COL_BALANCE_ACCT]: 1,
  [COL_BALANCE]: 2,
}

/** Built-in 07-01 leaf categories (order ≈ typical form left→right). */
export const COLUMN_CATEGORIES: ColumnCategory[] = [
  { id: COL_DATE, label: "วันที่", group: "identity" },
  { id: COL_DESC, label: "รายการ", group: "identity" },
  { id: COL_EVIDENCE, label: "เลขที่", group: "identity" },
  { id: COL_BL, label: "B/L", group: "receive" },
  { id: COL_OUTTURN, label: "Outturn", group: "receive" },
  { id: COL_RECV_ACCT, label: "รับตามบัญชีสิทธิ์", group: "receive" },
  {
    id: PRODUCT_CANON,
    label: "ผลิตภัณฑ์",
    group: "pay",
    repeatable: true,
  },
  { id: COL_OTHER_PRODUCT, label: "ผลิตสินค้าอื่น", group: "pay" },
  { id: COL_DAMAGED, label: "เสียหาย", group: "pay" },
  { id: COL_OTHER, label: "อื่นๆ", group: "pay" },
  { id: COL_TOTAL_OUT, label: "รวมจ่าย", group: "pay" },
  { id: COL_BALANCE_STOCK, label: "คงเหลือ Stock", group: "balance" },
  { id: COL_BALANCE_ACCT, label: "คงเหลือตามบัญชีสิทธิ์", group: "balance" },
  { id: COL_BALANCE, label: "คงเหลือ", group: "balance" },
  { id: COL_REMARK, label: "หมายเหตุ", group: "other" },
  { id: COL_GAIN, label: "Gain", group: "other" },
]

const CATEGORY_BY_ID = new Map(COLUMN_CATEGORIES.map((c) => [c.id, c]))

export function getColumnCategory(id: string | undefined | null): ColumnCategory | undefined {
  const n = normalizeCanon(id)
  return CATEGORY_BY_ID.get(n) || CATEGORY_BY_ID.get((id || "").trim())
}

export function groupOfCanon(canon: string | undefined | null): ColumnGroupId {
  const cat = getColumnCategory(canon)
  if (cat) return cat.group
  if (isProductCanon(canon)) return "pay"
  return "unknown"
}

export function isRepeatableCanon(c: string | undefined | null): boolean {
  if (isProductCanon(c)) return true
  return !!getColumnCategory(c)?.repeatable
}

/** Canonical list for 07-01 picker (built-ins only; extras added separately). */
export function categories0701(): string[] {
  return COLUMN_CATEGORIES.map((c) => c.id)
}

/**
 * Display order of column indices: identity → receive → pay → …
 * Receive columns (B/L, Outturn, รับตามบัญชีสิทธิ์) always sit right after รายการ.
 */
export function buildDisplayOrder(
  colCount: number,
  colMap: string[],
  deletedCi?: ReadonlySet<number>,
): number[] {
  const indices: number[] = []
  for (let ci = 0; ci < colCount; ci++) {
    if (deletedCi?.has(ci)) continue
    indices.push(ci)
  }
  return indices.sort((a, b) => {
    const ca = normalizeCanon(colMap[a] || "") || colMap[a] || ""
    const cb = normalizeCanon(colMap[b] || "") || colMap[b] || ""
    const ga = GROUP_RANK[groupOfCanon(ca)]
    const gb = GROUP_RANK[groupOfCanon(cb)]
    if (ga !== gb) return ga - gb
    if (ga === GROUP_RANK.receive) {
      const ra = RECEIVE_LEAF_RANK[ca] ?? 9
      const rb = RECEIVE_LEAF_RANK[cb] ?? 9
      if (ra !== rb) return ra - rb
    }
    if (ga === GROUP_RANK.balance) {
      const ra = BALANCE_LEAF_RANK[ca] ?? 9
      const rb = BALANCE_LEAF_RANK[cb] ?? 9
      if (ra !== rb) return ra - rb
    }
    return a - b
  })
}

export function deletedCiSet(si: number, deletedCols: Set<string>): Set<number> {
  const out = new Set<number>()
  for (const key of deletedCols) {
    const [s, c] = key.split(":").map(Number)
    if (s === si) out.add(c)
  }
  return out
}

/** Fixed pay/balance/other markers that end the product zone (not ผลิตภัณฑ์ itself). */
const PAY_ZONE_END_COLS = new Set([
  COL_OTHER_PRODUCT,
  COL_DAMAGED,
  COL_OTHER,
  COL_TOTAL_OUT,
  COL_BALANCE,
  COL_BALANCE_STOCK,
  COL_BALANCE_ACCT,
  COL_REMARK,
  COL_GAIN,
])

const IDENTITY_COLS = new Set([COL_DATE, COL_DESC, COL_EVIDENCE])
const RECEIVE_COLS = new Set([COL_BL, COL_OUTTURN, COL_RECV_ACCT])

/**
 * Unmapped columns after the identity set (รายการ) and before known
 * จำนวนจ่าย / คงเหลือ markers → assume ผลิตภัณฑ์.
 * Runs after keyword suggest + forced receive so B/L etc. are already claimed.
 */
export function assumeProductColumns(colMapIn: string[]): {
  colMap: string[]
  assumed: number[]
} {
  const colMap = colMapIn.map((c) => normalizeCanon(c) || c)
  const n = colMap.length
  if (!n) return { colMap, assumed: [] }

  let lastIdentity = -1
  let lastReceive = -1
  for (let ci = 0; ci < n; ci++) {
    const c = colMap[ci]
    if (IDENTITY_COLS.has(c)) lastIdentity = ci
    if (RECEIVE_COLS.has(c)) lastReceive = ci
  }

  let zoneStart = lastIdentity
  if (lastIdentity >= 0) {
    for (let ci = lastIdentity + 1; ci < n; ci++) {
      const c = colMap[ci]
      if (RECEIVE_COLS.has(c)) zoneStart = ci
      else break
    }
  } else if (lastReceive >= 0) {
    zoneStart = lastReceive
  }

  let zoneEnd = n
  for (let ci = Math.max(zoneStart + 1, 0); ci < n; ci++) {
    const c = colMap[ci]
    if (c && PAY_ZONE_END_COLS.has(c)) {
      zoneEnd = ci
      break
    }
  }

  const assumed: number[] = []
  if (zoneStart < 0 || zoneEnd <= zoneStart + 1) {
    return { colMap, assumed }
  }

  for (let ci = zoneStart + 1; ci < zoneEnd; ci++) {
    if (!colMap[ci]) {
      colMap[ci] = PRODUCT_CANON
      assumed.push(ci)
    }
  }
  return { colMap, assumed }
}

/**
 * Ensure B/L, Outturn, รับตามบัญชีสิทธิ์ exist.
 * Ensure คงเหลือ Stock, คงเหลือตามบัญชีสิทธิ์, คงเหลือ exist.
 * Legacy "จำนวนรับ" is normalized to รับตามบัญชีสิทธิ์ (no separate column).
 * Seed คงเหลือ from คงเหลือตามบัญชีสิทธิ์ when blank.
 * Then assume unmapped mid-table columns as ผลิตภัณฑ์.
 */
export function ensureForcedReceiveColumns(
  section: Section,
  colMapIn: string[],
): {
  section: Section
  colMap: string[]
  displayOrder: number[]
  /** Suggested ชื่อผลิตภัณฑ์ per column index */
  productNames: Record<number, string>
  /** Seeded cell values: edits[ri][ci] — only where we copied values */
  seededEdits: Record<number, Record<number, string>>
  /** True if columns were appended or cells seeded */
  mutated: boolean
} {
  const headers = [...section.headers]
  const rows: Row[] = section.rows.map((r) => ({
    ...r,
    cells: [...r.cells],
  }))
  const colMap = colMapIn.map((c) => normalizeCanon(c) || c)
  while (colMap.length < headers.length) colMap.push("")

  // Re-suggest empty maps from OCR headers
  for (let ci = 0; ci < headers.length; ci++) {
    if (!colMap[ci]) {
      const suggested = suggestCanon(headers[ci], section.formType)
      if (suggested) colMap[ci] = normalizeCanon(suggested) || suggested
    }
  }

  const findCi = (canon: string) =>
    colMap.findIndex((c) => normalizeCanon(c) === canon || c === canon)

  let mutated = false

  const appendCol = (canon: string, headerLabel: string) => {
    headers.push(headerLabel)
    for (const row of rows) {
      while (row.cells.length < headers.length) row.cells.push("")
    }
    colMap.push(canon)
    mutated = true
    return headers.length - 1
  }

  for (const canon of FORCED_RECEIVE_COLS) {
    if (findCi(canon) < 0) appendCol(canon, canon)
  }
  for (const canon of FORCED_BALANCE_COLS) {
    if (findCi(canon) < 0) appendCol(canon, canon)
  }

  for (const row of rows) {
    while (row.cells.length < headers.length) row.cells.push("")
  }

  const seededEdits: Record<number, Record<number, string>> = {}

  // Seed คงเหลือ ← คงเหลือตามบัญชีสิทธิ์ when คงเหลือ blank
  const balAcctCi = findCi(COL_BALANCE_ACCT)
  const balCi = findCi(COL_BALANCE)
  if (balAcctCi >= 0 && balCi >= 0) {
    rows.forEach((row, ri) => {
      const balVal = (row.cells[balCi] ?? "").trim()
      const acctVal = (row.cells[balAcctCi] ?? "").trim()
      if (!balVal && acctVal) {
        row.cells[balCi] = acctVal
        if (!seededEdits[ri]) seededEdits[ri] = {}
        seededEdits[ri][balCi] = acctVal
        mutated = true
      }
    })
  }

  // After identity (+ receive) and before จำนวนจ่าย markers → ผลิตภัณฑ์
  const { colMap: withProducts, assumed } = assumeProductColumns(colMap)
  for (let i = 0; i < withProducts.length; i++) colMap[i] = withProducts[i]
  if (assumed.length) mutated = true

  const productNames: Record<number, string> = {}
  for (let ci = 0; ci < colMap.length; ci++) {
    if (isProductCanon(colMap[ci])) {
      const name = productNameFromHeader(headers[ci])
      if (name) productNames[ci] = name
    }
  }

  const displayOrder = buildDisplayOrder(headers.length, colMap)

  return {
    section: { ...section, headers, rows },
    colMap,
    displayOrder,
    productNames,
    seededEdits,
    mutated,
  }
}

/**
 * Build contiguous group spans for visible columns (for two-row thead).
 * Returns segments of { group, label, cols: ci[] }.
 */
export function buildGroupSpans(
  visCols: number[],
  colMap: string[],
): { group: ColumnGroupId; label: string; cols: number[] }[] {
  const groupLabel = (g: ColumnGroupId) =>
    COLUMN_GROUPS.find((x) => x.id === g)?.label || "ไม่ทราบหมวด"

  const spans: { group: ColumnGroupId; label: string; cols: number[] }[] = []
  for (const ci of visCols) {
    const g = groupOfCanon(colMap[ci] || "")
    const last = spans[spans.length - 1]
    if (last && last.group === g) {
      last.cols.push(ci)
    } else {
      spans.push({ group: g, label: groupLabel(g), cols: [ci] })
    }
  }
  return spans
}
