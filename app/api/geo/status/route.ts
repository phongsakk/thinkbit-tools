import {
  GEO_FENCE_COOKIE,
  getGeoFenceConfig,
  isGeoFenceEnabled,
  verifyGeoFenceCookieValue,
} from "@/lib/geo-fence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const enabled = isGeoFenceEnabled()
  const config = getGeoFenceConfig()

  if (!enabled || !config) {
    return Response.json({
      enabled: false,
      allowed: true,
      configured: Boolean(config),
    })
  }

  const cookieHeader = request.headers.get("cookie") ?? ""
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GEO_FENCE_COOKIE}=`))
  const raw = match ? decodeURIComponent(match.slice(GEO_FENCE_COOKIE.length + 1)) : null
  const payload = await verifyGeoFenceCookieValue(raw, config.secret)

  return Response.json({
    enabled: true,
    allowed: Boolean(payload),
    radiusMeters: config.radiusMeters,
    // Fence center is intentional for ops UI (coords also live in env).
    fence: {
      latitude: config.latitude,
      longitude: config.longitude,
    },
    grant: payload
      ? {
          distanceMeters: payload.distM,
          expiresAt: new Date(payload.exp).toISOString(),
        }
      : null,
  })
}
