import { getOcrReviewUpstreamBase } from "@/lib/ocr-review/upstream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET() {
  const base = getOcrReviewUpstreamBase()
  try {
    const response = await fetch(`${base}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    return Response.json({
      ok: true,
      base,
      upstreamStatus: response.status,
    })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        base,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
