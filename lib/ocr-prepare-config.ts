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

/** Fallback: extract `oil-XX-YY-...` → `/api/ocr/ocr-prepared/XX-YY/doc-{id}` */
const DOCTYPE_FORM_CODE = /^oil-(\d{2}-\d{2})(?:-|$)/i

export function resolvePrepareUrl(docType: string, documentId: string): string | null {
  const id = documentId.replace(/^doc-/i, "")
  const configured = OCR_PREPARE_BY_DOCTYPE[docType]

  if (configured) {
    const pathOrUrl = configured.replace(/\{id\}/g, id)
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
    return `${OCR_PREPARE_BASE_URL.replace(/\/$/, "")}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
  }

  const match = docType.match(DOCTYPE_FORM_CODE)
  if (!match) return null

  return `${OCR_PREPARE_BASE_URL.replace(/\/$/, "")}/api/ocr/ocr-prepared/${match[1]}/doc-${id}`
}
