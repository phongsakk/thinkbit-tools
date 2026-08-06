const DEFAULT_OCR_BASE = "https://api-ocr-staging.devthinkbit.com"

export function getOcrReviewUpstreamBase() {
  return (
    process.env.NEW_OCR_API_URL?.trim() ||
    process.env.OCR_PROCESS_URL?.trim()?.replace(/\/process\/.*$/, "") ||
    DEFAULT_OCR_BASE
  ).replace(/\/$/, "")
}

export function getOcrReviewProcessUrl(fast: boolean) {
  const base = getOcrReviewUpstreamBase()
  return fast ? `${base}/process/fast` : `${base}/process/multi?fast=false`
}

export function asciiSafeFilename(displayName: string) {
  const base = displayName.split(/[\\/]/).pop() || "document.pdf"
  return /^[\x20-\x7E]+$/.test(base) ? base : "document.pdf"
}

export async function postPdfToOcr(opts: {
  pdf: Buffer
  filename: string
  fast?: boolean
}) {
  const endpoint = getOcrReviewProcessUrl(Boolean(opts.fast))
  const form = new FormData()
  form.append(
    "file",
    new Blob([new Uint8Array(opts.pdf)], { type: "application/pdf" }),
    asciiSafeFilename(opts.filename)
  )

  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(15 * 60 * 1000),
  })

  const text = await response.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text.slice(0, 800) }
  }

  return { status: response.status, data, endpoint }
}
