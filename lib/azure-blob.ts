/**
 * Lightweight Azure Blob download using fetch + SharedKey auth.
 * Avoids @azure/storage-blob which can hard-crash or return empty errors under Next.
 */

type StorageAccount = {
  accountName: string
  accountKey: Buffer
  blobEndpoint: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseConnectionString(connectionString: string): StorageAccount {
  const parts = Object.fromEntries(
    connectionString
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf("=")
        if (eq <= 0) return [part, ""] as const
        return [part.slice(0, eq), part.slice(eq + 1)] as const
      })
  )

  const accountName = parts.AccountName?.trim()
  const accountKeyRaw = parts.AccountKey?.trim()
  if (!accountName || !accountKeyRaw) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING must include AccountName and AccountKey"
    )
  }

  const blobEndpoint =
    parts.BlobEndpoint?.replace(/\/$/, "").trim() ||
    `https://${accountName}.blob.${parts.EndpointSuffix?.trim() || "core.windows.net"}`

  return {
    accountName,
    accountKey: Buffer.from(accountKeyRaw, "base64"),
    blobEndpoint,
  }
}

function getStorageAccount(): StorageAccount {
  return parseConnectionString(requiredEnv("AZURE_STORAGE_CONNECTION_STRING"))
}

/**
 * Parse cosmos `blobFileName` into container + blob path.
 * Container defaults to `permanent` (override with AZURE_STORAGE_CONTAINER).
 * The full blobFileName is the blob path inside that container.
 */
export function parseBlobStoragePath(blobFileName: string): {
  containerName: string
  blobName: string
  fileName: string
} {
  const normalized = blobFileName.replace(/^\/+/, "").trim()
  if (!normalized) {
    throw new Error("blobFileName is empty")
  }

  const containerName = (
    process.env.AZURE_STORAGE_CONTAINER?.trim() || "permanent"
  ).toLowerCase()
  const blobName = normalized
  const fileName = blobName.split("/").pop() || "download.pdf"
  return { containerName, blobName, fileName }
}

function encodeBlobPath(blobName: string) {
  return blobName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

async function createSharedKeyAuthorization(
  account: StorageAccount,
  method: string,
  canonicalizedResource: string,
  headers: Record<string, string>
) {
  const headerNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .filter((name) => name.startsWith("x-ms-"))
    .sort()

  const canonicalizedHeaders = headerNames
    .map((name) => {
      const original = Object.keys(headers).find((key) => key.toLowerCase() === name)!
      return `${name}:${headers[original].trim()}`
    })
    .join("\n")

  // Empty Content-Length for GET/HEAD (Azure SharedKey convention).
  const stringToSign =
    `${method}\n` + // VERB
    `\n` + // Content-Encoding
    `\n` + // Content-Language
    `\n` + // Content-Length
    `\n` + // Content-MD5
    `\n` + // Content-Type
    `\n` + // Date (use x-ms-date instead)
    `\n` + // If-Modified-Since
    `\n` + // If-Match
    `\n` + // If-None-Match
    `\n` + // If-Unmodified-Since
    `\n` + // Range
    `${canonicalizedHeaders}\n` +
    canonicalizedResource

  const { createHmac } = await import("node:crypto")
  const signature = createHmac("sha256", account.accountKey)
    .update(stringToSign, "utf8")
    .digest("base64")

  return `SharedKey ${account.accountName}:${signature}`
}

export function formatUnknownError(error: unknown, fallback = "Blob download failed") {
  if (error instanceof Error) {
    const anyErr = error as Error & {
      code?: string
      statusCode?: number
      details?: unknown
    }
    const parts = [
      anyErr.message?.trim() || null,
      anyErr.code ? `code=${anyErr.code}` : null,
      anyErr.statusCode != null ? `status=${anyErr.statusCode}` : null,
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(" | ")
  }
  if (typeof error === "string" && error.trim()) return error.trim()
  try {
    const json = JSON.stringify(error)
    if (json && json !== "{}") return json
  } catch {
    // ignore
  }
  return fallback
}

export async function listBlobContainers(maxResults = 50): Promise<string[]> {
  const account = getStorageAccount()
  const date = new Date().toUTCString()
  const version = "2021-08-06"
  const headers: Record<string, string> = {
    "x-ms-date": date,
    "x-ms-version": version,
  }

  const limit = Math.min(Math.max(maxResults, 1), 100)
  // Query params must be included in CanonicalizedResource (sorted).
  const canonicalizedResource = `/${account.accountName}/\ncomp:list\nmaxresults:${limit}`
  const authorization = await createSharedKeyAuthorization(
    account,
    "GET",
    canonicalizedResource,
    headers
  )

  const url = `${account.blobEndpoint}/?comp=list&maxresults=${limit}`
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...headers,
      Authorization: authorization,
    },
    cache: "no-store",
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `List containers failed (${response.status}): ${text.trim().slice(0, 400)}`
    )
  }

  const names: string[] = []
  const re = /<Name>([^<]+)<\/Name>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    names.push(match[1])
  }
  return names
}

export async function downloadBlobByFileName(blobFileName: string): Promise<{
  buffer: Buffer
  contentType: string | undefined
  containerName: string
  blobName: string
  fileName: string
}> {
  const { containerName, blobName, fileName } = parseBlobStoragePath(blobFileName)
  const account = getStorageAccount()
  const date = new Date().toUTCString()
  const version = "2021-08-06"
  const headers: Record<string, string> = {
    "x-ms-date": date,
    "x-ms-version": version,
  }

  const canonicalizedResource = `/${account.accountName}/${containerName}/${blobName}`
  const authorization = await createSharedKeyAuthorization(
    account,
    "GET",
    canonicalizedResource,
    headers
  )

  const url = `${account.blobEndpoint}/${encodeURIComponent(containerName)}/${encodeBlobPath(blobName)}`
  console.log("[azure-blob] GET", {
    containerName,
    blobName,
    url,
  })

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...headers,
      Authorization: authorization,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    const detail = text.trim().slice(0, 400)
    throw new Error(
      `Blob request failed (${response.status}) ${containerName}/${blobName}` +
        (detail ? `: ${detail}` : "")
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const contentType = response.headers.get("content-type") || undefined

  console.log("[azure-blob] GET ok", {
    containerName,
    blobName,
    bytes: buffer.byteLength,
    contentType,
  })

  return {
    buffer,
    contentType,
    containerName,
    blobName,
    fileName,
  }
}
