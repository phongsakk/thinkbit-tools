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

type CosmosQueryResult<T> = {
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
