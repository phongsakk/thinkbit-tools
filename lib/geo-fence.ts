/**
 * Geofence helpers shared by API routes and Edge middleware.
 * Client reports lat/lng → server checks distance → sets signed cookie → middleware gates pages.
 */

export const GEO_FENCE_COOKIE = "tb_geo_ok"
export const DEFAULT_GEO_FENCE_RADIUS_M = 1000
export const DEFAULT_GEO_FENCE_TTL_SEC = 60 * 30

export type GeoFenceConfig = {
  latitude: number
  longitude: number
  radiusMeters: number
  ttlSec: number
  secret: string
}

export type GeoFenceCookiePayload = {
  v: 1
  exp: number
  distM: number
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function getGeoFenceConfig(): GeoFenceConfig | null {
  const latitude = parseNumber(process.env.GEO_FENCE_LAT)
  const longitude = parseNumber(process.env.GEO_FENCE_LNG)
  if (latitude == null || longitude == null) return null

  const radiusMeters =
    parseNumber(process.env.GEO_FENCE_RADIUS_M) ?? DEFAULT_GEO_FENCE_RADIUS_M
  const ttlSec =
    parseNumber(process.env.GEO_FENCE_TTL_SEC) ?? DEFAULT_GEO_FENCE_TTL_SEC
  const secret =
    process.env.GEO_FENCE_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    ""

  if (!secret) return null

  return {
    latitude,
    longitude,
    radiusMeters: Math.max(1, radiusMeters),
    ttlSec: Math.max(60, ttlSec),
    secret,
  }
}

export function isGeoFenceEnabled(): boolean {
  const flag = process.env.GEO_FENCE_ENABLED?.trim().toLowerCase()
  if (flag === "0" || flag === "false" || flag === "off") return false
  return getGeoFenceConfig() != null
}

/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const base64 = padded + pad
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  )
  return toBase64Url(sig)
}

async function hmacVerify(
  message: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSign(message, secret)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

export async function createGeoFenceCookieValue(
  payload: GeoFenceCookiePayload,
  secret: string
): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await hmacSign(body, secret)
  return `${body}.${sig}`
}

export async function verifyGeoFenceCookieValue(
  cookieValue: string | undefined | null,
  secret: string
): Promise<GeoFenceCookiePayload | null> {
  if (!cookieValue) return null
  const [body, sig] = cookieValue.split(".")
  if (!body || !sig) return null
  if (!(await hmacVerify(body, sig, secret))) return null

  try {
    const json = new TextDecoder().decode(fromBase64Url(body))
    const parsed = JSON.parse(json) as GeoFenceCookiePayload
    if (parsed?.v !== 1 || typeof parsed.exp !== "number") return null
    if (parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function evaluateGeoFence(
  latitude: number,
  longitude: number,
  config: GeoFenceConfig
): { allowed: boolean; distanceMeters: number; radiusMeters: number } {
  const dist = distanceMeters(
    latitude,
    longitude,
    config.latitude,
    config.longitude
  )
  return {
    allowed: dist <= config.radiusMeters,
    distanceMeters: dist,
    radiusMeters: config.radiusMeters,
  }
}

/** Paths that stay reachable without a valid geofence cookie. */
export function isGeoFencePublicPath(pathname: string): boolean {
  if (pathname === "/") return true
  if (pathname === "/auth") return true
  if (pathname.startsWith("/api/geo")) return true
  if (pathname === "/api/ping") return true
  if (pathname === "/api/health") return true
  if (pathname.startsWith("/_next")) return true
  if (pathname === "/favicon.ico") return true
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$/i.test(pathname)) {
    return true
  }
  return false
}
