export const dynamic = "force-dynamic"

export async function GET() {
  console.log("[health] hit", {
    node: process.version,
    vercel: Boolean(process.env.VERCEL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
  })

  return Response.json({
    ok: true,
    service: "thinkbit-tools",
    node: process.version,
    vercel: Boolean(process.env.VERCEL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    now: new Date().toISOString(),
  })
}
