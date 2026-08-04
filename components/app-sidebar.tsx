"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Database,
  FileText,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
} from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/", label: "หน้าหลัก", icon: Home },
  { href: "/upload-batches", label: "ชุดอัปโหลด", icon: Upload },
  { href: "/docs", label: "โต๊ะเอกสาร", icon: Database },
  { href: "/pdf-cache", label: "คลัง PDF", icon: FileText },
] as const

const SIDEBAR_STORAGE_KEY = "tb-sidebar-collapsed"
const SIDEBAR_WIDTH_MS = 300

export function AppSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let initiallyCollapsed = false
    try {
      initiallyCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1"
    } catch {
      // ignore
    }
    setCollapsed(initiallyCollapsed)
    setShowLabels(!initiallyCollapsed)
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return

    if (collapsed) {
      setShowLabels(false)
      return
    }

    const timer = window.setTimeout(() => {
      setShowLabels(true)
    }, SIDEBAR_WIDTH_MS)
    return () => window.clearTimeout(timer)
  }, [collapsed, ready])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      if (next) setShowLabels(false)
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "sticky top-0 flex h-svh shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950 text-slate-200 transition-[width] duration-300 ease-out",
          collapsed ? "w-14" : "w-60",
          !ready && "invisible"
        )}
      >
        <div className="relative h-[4.75rem] shrink-0 border-b border-slate-800">
          {showLabels ? (
            <div className="px-4 py-4">
              <div className="pr-8 text-sm font-semibold tracking-tight text-white">
                Oil Tax Utility Tools
              </div>
              <div className="mt-1 pr-8 text-[11px] leading-snug text-slate-400">
                ตรวจเอกสารยื่นภาษีน้ำมันตามกฎหมาย
              </div>
            </div>
          ) : null}

          <div className="absolute top-3 right-3">
            <Tooltip>
              <TooltipTrigger
                type="button"
                delay={250}
                aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
                aria-expanded={!collapsed}
                onClick={toggleCollapsed}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`)

            const linkClass = cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
              active
                ? "bg-cyan-500/15 text-cyan-200"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )

            const link = (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass}
                aria-label={item.label}
              >
                <Icon className="size-4 shrink-0" />
                {showLabels ? <span className="truncate">{item.label}</span> : null}
              </Link>
            )

            if (showLabels) return link

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger
                  delay={250}
                  render={<Link href={item.href} className={linkClass} />}
                  aria-label={item.label}
                >
                  <Icon className="size-4 shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </aside>
    </TooltipProvider>
  )
}
