/**
 * Lightweight Cosmos DB SQL API client using fetch + master-key auth.
 * Avoids @azure/cosmos on Vercel serverless (SDK import can hard-crash the function).
 */

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function assertCosmosEnv() {
  requiredEnv("COSMOS_ENDPOINT")
  requiredEnv("COSMOS_KEY")
  requiredEnv("COSMOS_DATABASE_ID")
  requiredEnv("COSMOS_CONTAINER_ID")
}

export function getCosmosMeta() {
  return {
    databaseId: requiredEnv("COSMOS_DATABASE_ID"),
    containerId: requiredEnv("COSMOS_CONTAINER_ID"),
  }
}

function getEndpoint() {
  return requiredEnv("COSMOS_ENDPOINT").replace(/\/$/, "")
}

async function createAuthorizationToken(
  verb: string,
  resourceType: string,
  resourceId: string,
  date: string
) {
  console.log("[cosmos] createAuthorizationToken", { verb, resourceType, resourceId })
  const key = Buffer.from(requiredEnv("COSMOS_KEY"), "base64")
  const text =
    `${verb.toLowerCase()}\n` +
    `${resourceType.toLowerCase()}\n` +
    `${resourceId}\n` +
    `${date.toLowerCase()}\n` +
    `\n`

  const { createHmac } = await import("node:crypto")
  const sig = createHmac("sha256", key).update(text, "utf8").digest("base64")
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`)
}

type CosmosParameter = {
  name: string
  value: string | number | boolean | null
}

type CosmosQueryOptions = {
  maxItemCount?: number
  continuationToken?: string | null
}

export type CosmosQueryResult<T> = {
  items: T[]
  continuationToken: string | null
  requestCharge: number | null
}

async function cosmosFetch(
  verb: string,
  resourceType: string,
  resourceLink: string,
  path: string,
  init?: {
    body?: string
    headers?: Record<string, string>
  }
) {
  const date = new Date().toUTCString()
  const authorization = await createAuthorizationToken(
    verb,
    resourceType,
    resourceLink,
    date
  )

  console.log("[cosmos] fetch", {
    verb: verb.toUpperCase(),
    path,
    bodyBytes: init?.body?.length ?? 0,
  })

  const response = await fetch(`${getEndpoint()}${path}`, {
    method: verb.toUpperCase(),
    headers: {
      Authorization: authorization,
      "x-ms-date": date,
      "x-ms-version": "2018-12-31",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.body,
    cache: "no-store",
  })

  console.log("[cosmos] fetch response", {
    status: response.status,
    ok: response.ok,
  })

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text.slice(0, 500) }
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : `Cosmos request failed (${response.status})`
    throw new Error(message)
  }

  return { response, data }
}

export async function cosmosSqlQuery<T = Record<string, unknown>>(
  query: string,
  parameters: CosmosParameter[] = [],
  options?: CosmosQueryOptions
): Promise<CosmosQueryResult<T>> {
  assertCosmosEnv()

  const databaseId = requiredEnv("COSMOS_DATABASE_ID")
  const containerId = requiredEnv("COSMOS_CONTAINER_ID")
  const resourceLink = `dbs/${databaseId}/colls/${containerId}`
  const path = `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs`

  const headers: Record<string, string> = {
    "Content-Type": "application/query+json",
    "x-ms-documentdb-isquery": "True",
    "x-ms-documentdb-query-enablecrosspartition": "true",
    "x-ms-max-item-count": String(
      Math.min(Math.max(options?.maxItemCount ?? 50, 1), 100)
    ),
  }

  const continuation = options?.continuationToken?.trim()
  if (continuation) {
    headers["x-ms-continuation"] = continuation
  }

  const { response, data } = await cosmosFetch("POST", "docs", resourceLink, path, {
    body: JSON.stringify({
      query,
      parameters,
    }),
    headers,
  })

  const payload = (data ?? {}) as {
    Documents?: T[]
    _count?: number
  }

  const requestChargeHeader = response.headers.get("x-ms-request-charge")
  const requestCharge = requestChargeHeader ? Number(requestChargeHeader) : null

  return {
    items: Array.isArray(payload.Documents) ? payload.Documents : [],
    continuationToken: response.headers.get("x-ms-continuation"),
    requestCharge: Number.isFinite(requestCharge) ? requestCharge : null,
  }
}

/**
 * Lightweight ping: GET the database resource to verify connectivity + auth.
 */
export async function cosmosPing(): Promise<{
  ok: boolean
  databaseId: string
  containerId: string
  latencyMs: number
}> {
  assertCosmosEnv()
  const databaseId = requiredEnv("COSMOS_DATABASE_ID")
  const containerId = requiredEnv("COSMOS_CONTAINER_ID")
  const start = Date.now()
  await cosmosFetch("GET", "dbs", `dbs/${databaseId}`, `/dbs/${encodeURIComponent(databaseId)}`)
  return { ok: true, databaseId, containerId, latencyMs: Date.now() - start }
}

export async function cosmosGetDocumentById<T = Record<string, unknown>>(
  documentId: string
): Promise<T | null> {
  const result = await cosmosSqlQuery<T>(
    "SELECT * FROM c WHERE c.id = @id",
    [{ name: "@id", value: documentId }],
    { maxItemCount: 1 }
  )
  return result.items[0] ?? null
}

/**
 * Replace an existing document (PUT).
 * Tries `/id` partition key first, then `documentId` if present.
 */
export async function cosmosReplaceDocument<T extends Record<string, unknown>>(
  document: T
): Promise<T> {
  assertCosmosEnv()

  const id = typeof document.id === "string" ? document.id.trim() : ""
  if (!id) {
    throw new Error("Document id is required for replace")
  }

  const databaseId = requiredEnv("COSMOS_DATABASE_ID")
  const containerId = requiredEnv("COSMOS_CONTAINER_ID")
  const resourceLink = `dbs/${databaseId}/colls/${containerId}/docs/${id}`
  const path = `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs/${encodeURIComponent(id)}`

  const {
    _rid: _r,
    _self: _s,
    _etag: _e,
    _attachments: _a,
    _ts: _t,
    ...body
  } = document as T & {
    _rid?: unknown
    _self?: unknown
    _etag?: unknown
    _attachments?: unknown
    _ts?: unknown
  }

  const partitionCandidates = [
    id,
    typeof document.documentId === "string" ? document.documentId.trim() : "",
  ].filter(Boolean)
  const uniquePartitions = Array.from(new Set(partitionCandidates))

  let lastError: Error | null = null
  for (const partitionValue of uniquePartitions) {
    try {
      const { data } = await cosmosFetch("PUT", "docs", resourceLink, path, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "If-Match": "*",
          "x-ms-documentdb-partitionkey": JSON.stringify([partitionValue]),
        },
      })
      return (data ?? body) as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (!/partition/i.test(lastError.message)) {
        throw lastError
      }
    }
  }

  throw lastError ?? new Error("Cosmos replace failed")
}

export function getCorrectedContainerId() {
  return (
    process.env.COSMOS_CORRECTED_CONTAINER_ID?.trim() || "doc-data-corrected"
  )
}

async function cosmosSqlQueryInContainer<T = Record<string, unknown>>(
  containerId: string,
  query: string,
  parameters: CosmosParameter[] = [],
  options?: CosmosQueryOptions
): Promise<CosmosQueryResult<T>> {
  assertCosmosEnv()

  const databaseId = requiredEnv("COSMOS_DATABASE_ID")
  const resourceLink = `dbs/${databaseId}/colls/${containerId}`
  const path = `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs`

  const headers: Record<string, string> = {
    "Content-Type": "application/query+json",
    "x-ms-documentdb-isquery": "True",
    "x-ms-documentdb-query-enablecrosspartition": "true",
    "x-ms-max-item-count": String(
      Math.min(Math.max(options?.maxItemCount ?? 50, 1), 100)
    ),
  }

  const continuation = options?.continuationToken?.trim()
  if (continuation) {
    headers["x-ms-continuation"] = continuation
  }

  const { response, data } = await cosmosFetch("POST", "docs", resourceLink, path, {
    body: JSON.stringify({
      query,
      parameters,
    }),
    headers,
  })

  const payload = (data ?? {}) as {
    Documents?: T[]
  }

  const requestChargeHeader = response.headers.get("x-ms-request-charge")
  const requestCharge = requestChargeHeader ? Number(requestChargeHeader) : null

  return {
    items: Array.isArray(payload.Documents) ? payload.Documents : [],
    continuationToken: response.headers.get("x-ms-continuation"),
    requestCharge: Number.isFinite(requestCharge) ? requestCharge : null,
  }
}

export async function cosmosGetDocumentByIdInContainer<
  T = Record<string, unknown>,
>(containerId: string, documentId: string): Promise<T | null> {
  const result = await cosmosSqlQueryInContainer<T>(
    containerId,
    "SELECT * FROM c WHERE c.id = @id",
    [{ name: "@id", value: documentId }],
    { maxItemCount: 1 }
  )
  return result.items[0] ?? null
}

/**
 * Upsert into a specific container (partition key `/id`).
 * Used for OCR-review corrected docs (never touches original doc-data).
 */
export async function cosmosUpsertDocumentInContainer<
  T extends Record<string, unknown>,
>(containerId: string, document: T): Promise<T> {
  assertCosmosEnv()

  const id = typeof document.id === "string" ? document.id.trim() : ""
  if (!id) {
    throw new Error("Document id is required for upsert")
  }

  const databaseId = requiredEnv("COSMOS_DATABASE_ID")
  const resourceLink = `dbs/${databaseId}/colls/${containerId}`
  const path = `/dbs/${encodeURIComponent(databaseId)}/colls/${encodeURIComponent(containerId)}/docs`

  const {
    _rid: _r,
    _self: _s,
    _etag: _e,
    _attachments: _a,
    _ts: _t,
    ...body
  } = document as T & {
    _rid?: unknown
    _self?: unknown
    _etag?: unknown
    _attachments?: unknown
    _ts?: unknown
  }

  const { data } = await cosmosFetch("POST", "docs", resourceLink, path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-ms-documentdb-is-upsert": "True",
      "x-ms-documentdb-partitionkey": JSON.stringify([id]),
    },
  })

  return (data ?? body) as T
}

/**
 * Load all pages for a DOC set key.
 * Set key may be a full documentGroup prefix, or just the middle segment
 * e.g. `300769-1785406509202-B104-00-00001261-DOC0009`
 * (Cosmos documentGroup is often `BANGCHAK-test/<setKey>/…`).
 */
export async function cosmosQueryByDocumentGroupPrefix<
  T = Record<string, unknown>,
>(documentGroup: string, containerId?: string): Promise<T[]> {
  const coll = containerId || requiredEnv("COSMOS_CONTAINER_ID")
  const dg = documentGroup.trim()
  if (!dg) return []

  const items: T[] = []
  let continuationToken: string | null = null

  // Prefer STARTSWITH when caller already has a path prefix; also CONTAINS so a
  // bare set key (…-DOC0009) still matches `folder/setKey/…` documentGroups.
  const query = dg.includes("/")
    ? "SELECT * FROM c WHERE STARTSWITH(c.documentGroup, @dg) OR CONTAINS(c.blobFileName, @dg)"
    : "SELECT * FROM c WHERE CONTAINS(c.documentGroup, @dg) OR CONTAINS(c.blobFileName, @dg)"

  do {
    const result = await cosmosSqlQueryInContainer<T>(
      coll,
      query,
      [{ name: "@dg", value: dg }],
      { maxItemCount: 100, continuationToken }
    )
    items.push(...result.items)
    continuationToken = result.continuationToken
  } while (continuationToken)

  return items
}

export async function cosmosSearchDocumentGroups(q: string) {
  const result = await cosmosSqlQuery<{
    id: string
    documentGroup?: string
    docType?: string
    plainOriginalFileName?: string
    pageNumber?: string | number
  }>(
    "SELECT c.id, c.documentGroup, c.docType, c.plainOriginalFileName, c.pageNumber FROM c WHERE CONTAINS(c.documentGroup, @q) ORDER BY c.createdAt DESC OFFSET 0 LIMIT 30",
    [{ name: "@q", value: q }],
    { maxItemCount: 30 }
  )
  return result.items
}
