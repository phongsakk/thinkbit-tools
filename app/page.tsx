import Link from "next/link"
import { Database } from "lucide-react"

import { HealthSummary } from "@/components/health/health-summary"
import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <main className="relative min-h-svh overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-blue-500/40 blur-3xl" />
        <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-cyan-400/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-svh max-w-5xl items-center px-6 py-10">
        <div className="w-full space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur md:p-8">
            <p className="mb-3 inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
              Thinkbit Platform
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Internal Tools Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
              Browse Cosmos documents and monitor system connectivity from one place.
            </p>

            <div className="mt-6">
              <Link href="/cosmos" className="block max-w-md">
                <Button className="h-12 w-full justify-start gap-2 rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                  <Database className="size-4" />
                  Open Cosmos Explorer
                </Button>
              </Link>
            </div>
          </div>

          <HealthSummary />
        </div>
      </div>
    </main>
  )
}
