import { NextResponse, type NextRequest } from "next/server"

import {
  GEO_FENCE_COOKIE,
  getGeoFenceConfig,
  isGeoFenceEnabled,
  isGeoFencePublicPath,
  verifyGeoFenceCookieValue,
} from "@/lib/geo-fence"

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (!isGeoFenceEnabled() || isGeoFencePublicPath(pathname)) {
    return NextResponse.next()
  }

  const config = getGeoFenceConfig()
  if (!config) {
    return NextResponse.next()
  }

  const cookieValue = request.cookies.get(GEO_FENCE_COOKIE)?.value
  const grant = await verifyGeoFenceCookieValue(cookieValue, config.secret)
  if (grant) {
    return NextResponse.next()
  }

  // APIs: JSON 403. Pages: redirect to /auth to verify location.
  if (pathname.startsWith("/api/") || pathname.startsWith("/download/")) {
    return NextResponse.json(
      {
        error: "Geofence required — verify location on /auth first",
        code: "GEO_FENCE_REQUIRED",
      },
      { status: 403 }
    )
  }

  const auth = request.nextUrl.clone()
  auth.pathname = "/auth"
  auth.search = ""
  auth.searchParams.set("geo", "required")
  const nextPath = `${pathname}${search}`
  if (nextPath && nextPath !== "/" && nextPath !== "/auth") {
    auth.searchParams.set("next", nextPath)
  }
  return NextResponse.redirect(auth)
}

export const config = {
  matcher: [
    /*
     * Skip Next internals, static assets, and geofence/bootstrap APIs.
     * Public path checks also run inside proxy() as a safety net.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/geo|api/ping|api/health).*)",
  ],
}
