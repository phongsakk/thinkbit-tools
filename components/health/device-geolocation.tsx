"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  CheckCircle2,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type GeoState =
  | { status: "idle" | "loading" }
  | {
      status: "ready"
      latitude: number
      longitude: number
      accuracy: number | null
      updatedAt: string
    }
  | { status: "error"; message: string }

type VerifyState =
  | { status: "idle" | "checking" }
  | {
      status: "done"
      enabled: boolean
      allowed: boolean
      distanceMeters?: number
      radiusMeters?: number
      message?: string
      expiresAt?: string
    }
  | { status: "error"; message: string }

type StatusResponse = {
  enabled?: boolean
  allowed?: boolean
  radiusMeters?: number
  fence?: { latitude: number; longitude: number }
  grant?: { distanceMeters: number; expiresAt: string } | null
}

type VerifyResponse = {
  ok?: boolean
  enabled?: boolean
  allowed?: boolean
  distanceMeters?: number
  radiusMeters?: number
  message?: string
  expiresAt?: string
  error?: string
}

function formatCoord(value: number, digits = 6) {
  return value.toFixed(digits)
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

export function DeviceGeolocationSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-200">
          <MapPin className="size-3.5 text-cyan-300" />
          Device location
        </div>
        <Skeleton className="size-7 rounded-md" />
      </div>

      <div className="space-y-1.5">
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Latitude</div>
            <Skeleton className="mt-1 h-5 w-28" />
          </div>
          <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Longitude</div>
            <Skeleton className="mt-1 h-5 w-28" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/40 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <Skeleton className="mt-0.5 size-3.5 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="size-3.5 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function DeviceGeolocation() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const geoRequired = searchParams.get("geo") === "required"
  const nextPath = searchParams.get("next")

  const [geo, setGeo] = useState<GeoState>({ status: "loading" })
  const [verify, setVerify] = useState<VerifyState>({ status: "checking" })
  const [fenceHint, setFenceHint] = useState<{
    latitude: number
    longitude: number
    radiusMeters: number
  } | null>(null)

  const verifyPosition = useCallback(
    async (latitude: number, longitude: number) => {
      setVerify({ status: "checking" })
      try {
        const response = await fetch("/api/geo/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        })
        const data = (await response.json()) as VerifyResponse
        if (!response.ok && response.status !== 403) {
          throw new Error(data.error || "Verify failed")
        }

        const nextVerify: VerifyState = {
          status: "done",
          enabled: Boolean(data.enabled),
          allowed: Boolean(data.allowed),
          distanceMeters: data.distanceMeters,
          radiusMeters: data.radiusMeters,
          message: data.message || data.error,
          expiresAt: data.expiresAt,
        }
        setVerify(nextVerify)

        if (data.allowed && nextPath && nextPath.startsWith("/")) {
          router.replace(nextPath)
        } else if (data.allowed && geoRequired) {
          router.replace("/")
        }
      } catch (err) {
        setVerify({
          status: "error",
          message: err instanceof Error ? err.message : "Verify failed",
        })
      }
    },
    [geoRequired, nextPath, router]
  )

  const clearGeoSession = useCallback(async () => {
    try {
      await fetch("/api/geo/clear", { method: "POST", cache: "no-store" })
    } catch {
      // ignore — cookie clear is best-effort
    }
    setVerify({
      status: "error",
      message: "Location permission denied — geofence session cleared",
    })
  }, [])

  const readLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error", message: "Geolocation is not supported in this browser" })
      setVerify({ status: "idle" })
      return
    }

    setGeo({ status: "loading" })
    setVerify({ status: "checking" })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        setGeo({
          status: "ready",
          latitude,
          longitude,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : null,
          updatedAt: new Date().toISOString(),
        })
        void verifyPosition(latitude, longitude)
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED
        const message = denied
          ? "Permission denied — allow location access in the browser"
          : error.code === error.POSITION_UNAVAILABLE
            ? "Position unavailable"
            : error.code === error.TIMEOUT
              ? "Location request timed out"
              : error.message || "Failed to read location"
        setGeo({ status: "error", message })
        if (denied) {
          void clearGeoSession()
        } else {
          setVerify({ status: "idle" })
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      }
    )
  }, [clearGeoSession, verifyPosition])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/geo/status", { cache: "no-store" })
          const data = (await response.json()) as StatusResponse
          if (data.enabled && data.fence) {
            setFenceHint({
              latitude: data.fence.latitude,
              longitude: data.fence.longitude,
              radiusMeters: data.radiusMeters ?? 1000,
            })
          }
          if (data.enabled && data.allowed && data.grant) {
            setVerify({
              status: "done",
              enabled: true,
              allowed: true,
              distanceMeters: data.grant.distanceMeters,
              radiusMeters: data.radiusMeters,
              expiresAt: data.grant.expiresAt,
              message: "Within geofence — access granted",
            })
          }
        } catch {
          // ignore status prefetch errors
        }
        readLocation()
      })()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [readLocation])

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return

    let cancelled = false
    let permissionStatus: PermissionStatus | null = null

    const onPermissionChange = () => {
      if (cancelled || !permissionStatus) return
      if (permissionStatus.state === "denied") {
        setGeo({
          status: "error",
          message: "Permission denied — allow location access in the browser",
        })
        void clearGeoSession()
      }
    }

    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return
        permissionStatus = status
        if (status.state === "denied") {
          setGeo({
            status: "error",
            message: "Permission denied — allow location access in the browser",
          })
          void clearGeoSession()
        }
        status.addEventListener("change", onPermissionChange)
      })
      .catch(() => {
        // Permissions API unavailable — rely on getCurrentPosition errors
      })

    return () => {
      cancelled = true
      permissionStatus?.removeEventListener("change", onPermissionChange)
    }
  }, [clearGeoSession])
  const mapsHref =
    geo.status === "ready"
      ? `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`
      : null

  const within =
    verify.status === "done" && verify.enabled && verify.allowed
  const outside =
    verify.status === "done" && verify.enabled && !verify.allowed

  const showCoordSkeleton = geo.status === "idle" || geo.status === "loading"
  const showVerifySkeleton =
    verify.status === "checking" ||
    (showCoordSkeleton && verify.status !== "error" && verify.status !== "done")

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-200">
          <MapPin className="size-3.5 text-cyan-300" />
          Device location
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={geo.status === "loading" || verify.status === "checking"}
          onClick={readLocation}
          className="h-7 border-slate-600 bg-slate-800/80 px-2 text-slate-100 hover:bg-slate-700"
          title="Refresh coordinates"
        >
          {geo.status === "loading" || verify.status === "checking" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>

      {geoRequired ? (
        <div className="mb-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-100">
          ต้องอยู่ในรัศมี {fenceHint ? formatDistance(fenceHint.radiusMeters) : "1 km"}{" "}
          จากจุดที่กำหนดก่อนเข้าหน้าอื่น
          {nextPath ? ` · หลังจากยืนยันจะกลับไปที่ ${nextPath}` : ""}
        </div>
      ) : null}

      {showCoordSkeleton ? (
        <div className="space-y-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Latitude</div>
              <Skeleton className="mt-1 h-5 w-28" />
            </div>
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Longitude</div>
              <Skeleton className="mt-1 h-5 w-28" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ) : null}

      {geo.status === "error" ? (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-100">
          {geo.message}
        </div>
      ) : null}

      {geo.status === "ready" ? (
        <div className="space-y-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Latitude</div>
              <div className="font-mono text-sm text-cyan-100">{formatCoord(geo.latitude)}</div>
            </div>
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Longitude</div>
              <div className="font-mono text-sm text-cyan-100">{formatCoord(geo.longitude)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {geo.accuracy != null ? <span>±{Math.round(geo.accuracy)} m</span> : null}
            <span>
              {new Date(geo.updatedAt).toLocaleString("th-TH", { hour12: false })}
            </span>
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("text-cyan-300 hover:underline")}
              >
                Open map
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-2">
        {showVerifySkeleton ? (
          <div className="rounded-lg border border-slate-700 bg-slate-950/40 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <Skeleton className="mt-0.5 size-3.5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="size-3.5 shrink-0 rounded-full" />
            </div>
          </div>
        ) : null}

        {verify.status === "error" ? (
          <div className="rounded-lg border border-red-700/40 bg-red-950/30 px-2.5 py-2 text-[11px] text-red-100">
            {verify.message}
          </div>
        ) : null}

        {verify.status === "done" && !verify.enabled ? (
          <div className="rounded-lg border border-slate-700 bg-slate-950/40 px-2.5 py-2 text-[11px] text-slate-400">
            Geofence ยังไม่ได้ตั้งค่า env — หน้าอื่นเข้าได้ตามปกติ
          </div>
        ) : null}

        {within ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-2.5 py-2 text-[11px] text-emerald-100">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            <div>
              <div className="font-medium text-emerald-200">อยู่ในระยะ — อนุญาตใช้งาน</div>
              <div className="mt-0.5 text-emerald-100/80">
                {verify.distanceMeters != null
                  ? `ห่าง ${formatDistance(verify.distanceMeters)}`
                  : null}
                {verify.radiusMeters != null
                  ? ` / รัศมี ${formatDistance(verify.radiusMeters)}`
                  : null}
                {verify.expiresAt
                  ? ` · หมดอายุ ${new Date(verify.expiresAt).toLocaleString("th-TH", { hour12: false })}`
                  : null}
              </div>
            </div>
            <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-emerald-400" />
          </div>
        ) : null}

        {outside ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-700/50 bg-red-950/30 px-2.5 py-2 text-[11px] text-red-100">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-red-400" />
            <div>
              <div className="font-medium text-red-200">อยู่นอกรัศมี — เข้าหน้าอื่นไม่ได้</div>
              <div className="mt-0.5 text-red-100/80">
                {verify.distanceMeters != null
                  ? `ห่าง ${formatDistance(verify.distanceMeters)}`
                  : null}
                {verify.radiusMeters != null
                  ? ` / รัศมี ${formatDistance(verify.radiusMeters)}`
                  : null}
              </div>
            </div>
            <XCircle className="ml-auto size-3.5 shrink-0 text-red-400" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
