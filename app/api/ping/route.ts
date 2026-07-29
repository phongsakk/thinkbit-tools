export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({
    ok: true,
    service: "thinkbit-tools",
    now: new Date().toISOString(),
  })
}
