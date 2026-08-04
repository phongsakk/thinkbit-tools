import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"

import {
  DeviceGeolocation,
  DeviceGeolocationSkeleton,
} from "@/components/health/device-geolocation"
import {
  GEO_FENCE_COOKIE,
  getGeoFenceConfig,
  isGeoFenceEnabled,
  resolveGeoAuthRedirect,
  verifyGeoFenceCookieValue,
} from "@/lib/geo-fence"

export const metadata: Metadata = {
  title: "ยืนยันตำแหน่ง",
  description: "ตรวจสอบตำแหน่งเพื่อเปิด session เข้าใช้งานเครื่องมือ",
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const nextRaw = sp.next
  const nextPath = typeof nextRaw === "string" ? nextRaw : undefined

  // Already have a valid geofence session → leave /auth immediately.
  if (isGeoFenceEnabled()) {
    const config = getGeoFenceConfig()
    if (config) {
      const jar = await cookies()
      const grant = await verifyGeoFenceCookieValue(
        jar.get(GEO_FENCE_COOKIE)?.value,
        config.secret
      )
      if (grant) {
        redirect(resolveGeoAuthRedirect(nextPath))
      }
    }
  }

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200">
      <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-4 py-10">
        <div className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
            <ShieldCheck className="size-3.5" />
            Thinkbit · Oil Tax
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            ยืนยันตำแหน่ง
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            ตรวจพิกัดอุปกรณ์เพื่อเปิด session ก่อนเข้าใช้งานเครื่องมืออื่น
          </p>
        </div>

        <Suspense fallback={<DeviceGeolocationSkeleton />}>
          <DeviceGeolocation />
        </Suspense>

        <div className="mt-4">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 hover:bg-slate-800"
          >
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  )
}
