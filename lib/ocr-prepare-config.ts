/**
 * Maps Cosmos docType values to OCR prepare API URL templates.
 * Use `{id}` as a placeholder for the document UUID (without a `doc-` prefix).
 *
 * Example:
 *   oil-07-01-page-1 → https://api-oil.devthinkbit.com/api/ocr/ocr-prepared/07-01/doc-{id}
 */
export const OCR_PREPARE_BASE_URL =
  process.env.OCR_PREPARE_BASE_URL ?? "https://api-oil.devthinkbit.com"

/** Exact docType → path (appended to base URL) or absolute URL */
export const OCR_PREPARE_BY_DOCTYPE: Record<string, string> = {
  "oil-07-01-page-1": "/api/ocr/ocr-prepared/07-01/doc-{id}",
  "oil-05-03-page-1": "/api/ocr/ocr-prepared/05-03/doc-{id}",
  "oil-05-03-page-3": "/api/ocr/ocr-prepared/05-03/doc-{id}",
  "oil-05-03-attach-1": "/api/ocr/ocr-prepared/05-03/doc-{id}",
  "oil-03-07-page-1": "/api/ocr/ocr-prepared/03-07/doc-{id}",
}

/**
 * Form-code aliases → canonical prepare path segment.
 * e.g. `0701-H504` uses the same prepare API as `07-01`.
 */
export const OCR_PREPARE_FORM_ALIASES: Record<string, string> = {
  "0701-H504": "07-01",
  "0701": "07-01",
}

/** Fallback: extract `oil-XX-YY-...` → `/api/ocr/ocr-prepared/XX-YY/doc-{id}` */
const DOCTYPE_FORM_CODE = /^oil-(\d{2}-\d{2})(?:-|$)/i

/** Compact / warehouse-specific: `oil-0701-H504-...` or `oil-0701-...` */
const DOCTYPE_COMPACT_FORM = /^oil-(\d{4})(?:-([A-Za-z]\d+))?(?:-|$)/i

function canonicalizeFormCode(formCode: string): string {
  const trimmed = formCode.trim()
  const aliased =
    OCR_PREPARE_FORM_ALIASES[trimmed] ??
    OCR_PREPARE_FORM_ALIASES[trimmed.toUpperCase()]
  if (aliased) return aliased

  // 0701 → 07-01 when no explicit alias
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}-${trimmed.slice(2)}`
  }

  return trimmed
}

function extractFormCodeFromDocType(docType: string): string | null {
  const hyphenated = docType.match(DOCTYPE_FORM_CODE)
  if (hyphenated?.[1]) return canonicalizeFormCode(hyphenated[1])

  const compact = docType.match(DOCTYPE_COMPACT_FORM)
  if (compact?.[1]) {
    const raw = compact[2] ? `${compact[1]}-${compact[2]}` : compact[1]
    return canonicalizeFormCode(raw)
  }

  // Bare form codes passed as docType
  if (/^\d{2}-\d{2}$/.test(docType) || /^\d{4}(?:-[A-Za-z0-9]+)?$/i.test(docType)) {
    return canonicalizeFormCode(docType)
  }

  return null
}

function buildPrepareUrl(formCode: string, id: string): string {
  return `${OCR_PREPARE_BASE_URL.replace(/\/$/, "")}/api/ocr/ocr-prepared/${formCode}/doc-${id}`
}

export function resolvePrepareUrl(docType: string, documentId: string): string | null {
  const id = documentId.replace(/^doc-/i, "")
  const configured = OCR_PREPARE_BY_DOCTYPE[docType]

  if (configured) {
    const pathOrUrl = configured.replace(/\{id\}/g, id)
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
    return `${OCR_PREPARE_BASE_URL.replace(/\/$/, "")}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
  }

  const formCode = extractFormCodeFromDocType(docType)
  if (!formCode) return null

  return buildPrepareUrl(formCode, id)
}
