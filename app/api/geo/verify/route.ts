import {
  createGeoFenceCookieValue,
  evaluateGeoFence,
  GEO_FENCE_COOKIE,
  getGeoFenceConfig,
  isGeoFenceEnabled,
} from "@/lib/geo-fence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type VerifyBody = {
  latitude?: number
  longitude?: number
}

export async function POST(request: Request) {
  try {
    if (!isGeoFenceEnabled()) {
      return Response.json({
        ok: true,
        enabled: false,
        allowed: true,
        message: "Geofence is not configured (GEO_FENCE_LAT/LNG + secret)",
      })
    }

    const config = getGeoFenceConfig()
    if (!config) {
      return Response.json(
        { error: "Geofence misconfigured", enabled: true, allowed: false },
        { status: 503 }
      )
    }

    const body = (await request.json()) as VerifyBody
    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json(
        { error: "latitude and longitude are required numbers" },
        { status: 400 }
      )
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return Response.json({ error: "coordinates out of range" }, { status: 400 })
    }

    const result = evaluateGeoFence(latitude, longitude, config)
    if (!result.allowed) {
      const response = Response.json(
        {
          ok: false,
          enabled: true,
          allowed: false,
          distanceMeters: Math.round(result.distanceMeters),
          radiusMeters: result.radiusMeters,
          message: `Outside fence (${Math.round(result.distanceMeters)} m > ${result.radiusMeters} m)`,
        },
        { status: 403 }
      )
      // Clear any previous grant.
      response.headers.append(
        "Set-Cookie",
        `${GEO_FENCE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      )
      return response
    }

    const payload = {
      v: 1 as const,
      exp: Date.now() + config.ttlSec * 1000,
      distM: Math.round(result.distanceMeters),
    }
    const cookieValue = await createGeoFenceCookieValue(payload, config.secret)
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""

    const response = Response.json({
      ok: true,
      enabled: true,
      allowed: true,
      distanceMeters: Math.round(result.distanceMeters),
      radiusMeters: result.radiusMeters,
      expiresAt: new Date(payload.exp).toISOString(),
      message: "Within geofence — access granted",
    })
    response.headers.append(
      "Set-Cookie",
      `${GEO_FENCE_COOKIE}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${config.ttlSec}${secure}`
    )
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geo verify failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
