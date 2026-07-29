export const dynamic = "force-dynamic"

type CheckResult = {
  name: string
  ok: boolean
  latencyMs: number
  error?: string
  details?: Record<string, unknown>
}

async function checkCosmos(): Promise<CheckResult> {
  const start = Date.now()
  try {
    const { cosmosPing } = await import("@/lib/cosmos")
    const ping = await cosmosPing()
    return {
      name: "cosmos",
      ok: true,
      latencyMs: Date.now() - start,
      details: {
        databaseId: ping.databaseId,
        containerId: ping.containerId,
        pingMs: ping.latencyMs,
      },
    }
  } catch (error) {
    return {
      name: "cosmos",
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkBlob(): Promise<CheckResult> {
  const start = Date.now()
  try {
    const { getBlobServiceClient } = await import("@/lib/azure-blob")
    const client = getBlobServiceClient()
    const accountName =
      process.env.AZURE_STORAGE_ACCOUNT_NAME ??
      client.accountName ??
      "(unknown)"

    // List up to 1 container to verify connectivity
    const iter = client.listContainers({ maxPageSize: 1 })
    const page = await iter.byPage({ maxPageSize: 1 }).next()
    const containers = (
      page.value?.containerItems ?? []
    ).map((c: { name: string }) => c.name)

    return {
      name: "blob",
      ok: true,
      latencyMs: Date.now() - start,
      details: {
        accountName,
        sampleContainers: containers,
      },
    }
  } catch (error) {
    return {
      name: "blob",
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function checkLocalCache(): Promise<CheckResult> {
  const start = Date.now()
  try {
    const { getCacheStatus } = await import("@/lib/local-cache")
    const status = await getCacheStatus()
    return {
      name: "localCache",
      ok: true,
      latencyMs: Date.now() - start,
      details: {
        downloadCount: status.downloadCount,
        prepareCount: status.prepareCount,
      },
    }
  } catch (error) {
    return {
      name: "localCache",
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function GET() {
  const start = Date.now()
  const [cosmos, blob, localCache] = await Promise.all([
    checkCosmos(),
    checkBlob(),
    checkLocalCache(),
  ])
  const checks = [cosmos, blob, localCache]
  const allOk = checks.every((c) => c.ok)

  return Response.json(
    {
      ok: allOk,
      service: "thinkbit-tools",
      node: process.version,
      vercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      region: process.env.VERCEL_REGION ?? null,
      totalMs: Date.now() - start,
      now: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  )
}
