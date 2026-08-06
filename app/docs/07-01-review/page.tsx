import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Form0701ReviewApp } from "@/components/ocr-review/form-0701-review-app"

export const metadata: Metadata = {
  title: "ภส.07-01 · รีวิว OCR",
  description: "AI แมพหัวตาราง / แก้ OCR / export สำหรับแบบ ภส.07-01",
}

export const dynamic = "force-dynamic"

function asSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function safeDocsReturnHref(from: string | undefined): string {
  if (!from) return "/docs"
  const trimmed = from.trim()
  if (!trimmed.startsWith("/docs")) return "/docs"
  if (trimmed.startsWith("//") || trimmed.includes("://")) return "/docs"
  return trimmed
}

export default async function Form0701ReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const dg = asSingle(sp.dg) || asSingle(sp.documentGroup) || asSingle(sp.set)
  const from = asSingle(sp.from)
  const backHref = safeDocsReturnHref(from)

  return (
    <div className="flex h-svh min-h-0 flex-col bg-slate-950">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          กลับโต๊ะเอกสาร
        </Link>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            ภส.07-01 · รีวิว OCR
          </div>
          <div className="truncate text-[11px] text-slate-400">
            {dg
              ? `ชุด ${dg}`
              : "AI แมพหัวตาราง · แก้ OCR · เซฟ corrected · export"}
          </div>
        </div>
      </div>
      <Form0701ReviewApp setKey={dg?.trim() || null} backHref={backHref} />
    </div>
  )
}
