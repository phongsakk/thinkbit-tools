/**
 * Prepare routing for Cosmos docType values.
 *
 * - `api` → GET `/api/ocr/ocr-prepared/{formCode}/doc-{id}`
 * - `local` → build payload from localStorage (warehouse / company) — no upstream call
 * - `empty` → `{}` — no upstream call
 *
 * DOC ids (DOC0009, …) are not mapped directly; OCR normally sets docType per pack.
 */
export const OCR_PREPARE_BASE_URL =
  process.env.OCR_PREPARE_BASE_URL ?? "https://api-oil.devthinkbit.com"

/** Local prepare: read warehouse / company instead of calling the prepare API. */
export const OCR_PREPARE_LOCAL_BY_DOCTYPE: Record<
  string,
  "warehouse" | "company+warehouse"
> = {
  "first-page-letter-or-1": "warehouse",
  "oil-tax-request-st-page-1": "warehouse",
  "oil-tax-request-st-page-2": "warehouse",
  "oil-shore-tank-1": "company+warehouse",
  "oil-outturn-report-1": "company+warehouse",
  "oil-outturn-report-2": "company+warehouse",
}

/**
 * Exact docType → prepare form-code path segment.
 * Example: oil-07-01-page-1 → …/ocr-prepared/07-01/doc-{id}
 */
export const OCR_PREPARE_BY_DOCTYPE: Record<string, string> = {
  "oil-07-01-page-1": "07-01",
  "oil-07-02-page-1": "07-02",
  "oil-03-07-page-1": "03-07",
  "oil-formular-1": "03-07-attachment",
  "oil-formular-2": "03-07-attachment",
  "oil-formular-3": "03-07-attachment",
  "oil-07-04-page-1": "07-04",
  "oil-income-n-expense-1": "receitp-payment-new",
  "oil-05-03-page-1": "05-03",
  "oil-05-03-page-3": "05-03",
  "oil-05-03-attach-1": "05-03",
  "oil-01-29-page-1-1": "01-29",
  "oil-05-02-page-1": "05-02",
}

/** Prefix / pattern rules for page variants (oil-03-07-page-*, …). */
const OCR_PREPARE_DOCTYPE_PATTERNS: Array<{ pattern: RegExp; formCode: string }> = [
  { pattern: /^oil-03-07-page-/i, formCode: "03-07" },
  { pattern: /^oil-05-03-page-/i, formCode: "05-03" },
  { pattern: /^oil-05-02-page-/i, formCode: "05-02" },
  { pattern: /^oil-formular-[123]$/i, formCode: "03-07-attachment" },
]

/**
 * Form-code aliases → canonical prepare path segment.
 * e.g. `0701-H504` uses the same prepare API as `07-01`.
 */
export const OCR_PREPARE_FORM_ALIASES: Record<string, string> = {
  "0701-H504": "07-01",
  "0701": "07-01",
}

/** Optional DOC id → typical form code (docs / tooling only; prepare uses docType). */
export const DOC_ID_PREPARE_HINTS: Record<string, string> = {
  DOC0004: "01-29",
  DOC0005: "05-02",
  DOC0009: "07-01",
  DOC0010: "07-02",
  DOC0011: "03-07",
  DOC0012: "03-07-attachment",
  DOC0013: "07-04",
  DOC0016: "receitp-payment-new",
  DOC0022: "05-03",
}

export type PrepareLocalFields = "warehouse" | "company+warehouse"

export type PreparePlan =
  | { kind: "api"; formCode: string }
  | { kind: "local"; fields: PrepareLocalFields }
  | { kind: "empty" }

function canonicalizeFormCode(formCode: string): string {
  const trimmed = formCode.trim()
  const aliased =
    OCR_PREPARE_FORM_ALIASES[trimmed] ??
    OCR_PREPARE_FORM_ALIASES[trimmed.toUpperCase()]
  if (aliased) return aliased

  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}-${trimmed.slice(2)}`
  }

  return trimmed
}

function matchApiFormCode(docType: string): string | null {
  const exact = OCR_PREPARE_BY_DOCTYPE[docType]
  if (exact) return canonicalizeFormCode(exact)

  for (const rule of OCR_PREPARE_DOCTYPE_PATTERNS) {
    if (rule.pattern.test(docType)) return canonicalizeFormCode(rule.formCode)
  }

  return null
}

/** Decide how Prepare should run for a Cosmos docType. */
export function resolvePreparePlan(docType: string): PreparePlan {
  const trimmed = docType.trim()
  if (!trimmed) return { kind: "empty" }

  const local = OCR_PREPARE_LOCAL_BY_DOCTYPE[trimmed]
  if (local) return { kind: "local", fields: local }

  const formCode = matchApiFormCode(trimmed)
  if (formCode) return { kind: "api", formCode }

  return { kind: "empty" }
}

function buildPrepareUrl(formCode: string, id: string): string {
  return `${OCR_PREPARE_BASE_URL.replace(/\/$/, "")}/api/ocr/ocr-prepared/${formCode}/doc-${id}`
}

/** Resolve upstream prepare URL, or null when local/empty (no API). */
export function resolvePrepareUrl(docType: string, documentId: string): string | null {
  const plan = resolvePreparePlan(docType)
  if (plan.kind !== "api") return null
  const id = documentId.replace(/^doc-/i, "")
  return buildPrepareUrl(plan.formCode, id)
}

/** localStorage keys tried for warehouse / company (oil app + tools). */
export const PREPARE_WAREHOUSE_STORAGE_KEYS = [
  "thinkbit.prepare.warehouse",
  "oil.prepare.warehouse",
  "selectedWarehouse",
  "warehouse",
  "factoryId",
  "factory_id",
] as const

export const PREPARE_COMPANY_STORAGE_KEYS = [
  "thinkbit.prepare.company",
  "oil.prepare.company",
  "selectedCompany",
  "company",
  "companyId",
  "companyName",
  "company_id",
] as const

export function readPrepareStorageValue(keys: readonly string[]): string | null {
  if (typeof window === "undefined") return null
  try {
    for (const key of keys) {
      const raw = window.localStorage.getItem(key)
      if (typeof raw === "string" && raw.trim()) return raw.trim()
    }
  } catch {
    // private mode / blocked storage
  }
  return null
}

/** Best-effort warehouse from blob path like `…-H504-00-00000463-DOC0009`. */
export function warehouseFromBlobFileName(blobFileName: string | null | undefined): string | null {
  if (!blobFileName) return null
  const meta = blobFileName.split("/").find((part) => /DOC\d+/i.test(part)) ?? ""
  const factory = meta.match(/\b([A-Z]\d{3,})\b/i)?.[1]
  return factory ? factory.toUpperCase() : null
}

export function buildLocalPrepareData(
  fields: PrepareLocalFields,
  options?: {
    blobFileName?: string | null
    document?: Record<string, unknown> | null
  }
): Record<string, string> {
  const fromDocWarehouse =
    typeof options?.document?.warehouse === "string"
      ? options.document.warehouse.trim()
      : typeof options?.document?.factoryId === "string"
        ? options.document.factoryId.trim()
        : typeof options?.document?.factory_id === "string"
          ? String(options.document.factory_id).trim()
          : ""

  const warehouse =
    readPrepareStorageValue(PREPARE_WAREHOUSE_STORAGE_KEYS) ||
    fromDocWarehouse ||
    warehouseFromBlobFileName(options?.blobFileName) ||
    ""

  if (fields === "warehouse") {
    return { warehouse }
  }

  const fromDocCompany =
    typeof options?.document?.company === "string"
      ? options.document.company.trim()
      : typeof options?.document?.companyName === "string"
        ? options.document.companyName.trim()
        : typeof options?.document?.companyId === "string"
          ? options.document.companyId.trim()
          : ""

  const company =
    readPrepareStorageValue(PREPARE_COMPANY_STORAGE_KEYS) || fromDocCompany || ""

  return { company, warehouse }
}
