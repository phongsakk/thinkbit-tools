import { GEO_FENCE_COOKIE } from "@/lib/geo-fence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Clear geofence session cookie (e.g. when location permission is denied). */
export async function POST() {
  const response = Response.json({
    ok: true,
    cleared: true,
    allowed: false,
    message: "Geofence session cleared",
  })
  response.headers.append(
    "Set-Cookie",
    `${GEO_FENCE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
  return response
}
