"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  addExtraCanon,
  canonFor,
  getExtraCanon,
  isProductCanon,
  removeExtraCanon,
} from "@/lib/ocr-review/canon"
import {
  COLUMN_CATEGORIES,
  COLUMN_GROUPS,
  type ColumnGroupId,
} from "@/lib/ocr-review/0701-columns"
import { formKeyOf } from "@/lib/ocr-review/canon"
import { cn } from "@/lib/utils"

type Props = {
  formType: string
  current: string
  /** Canonicals already used by other columns in this section (hidden, except ผลิตภัณฑ์). */
  used: string[]
  x: number
  y: number
  onClose: () => void
  onSelect: (value: string) => void
  onExtraAdded: () => void
}

export function CanonPicker({
  formType,
  current,
  used,
  x,
  y,
  onClose,
  onSelect,
  onExtraAdded,
}: Props) {
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const is0701 = formKeyOf(formType) === "07_01"

  const usedSet = useMemo(() => {
    const s = new Set<string>()
    for (const u of used) {
      const t = (u || "").trim()
      if (!t || isProductCanon(t)) continue
      s.add(t)
    }
    return s
  }, [used])

  const flatOptions = useMemo(() => {
    const all = is0701
      ? [
          ...COLUMN_CATEGORIES.map((c) => c.id),
          ...getExtraCanon(),
        ]
      : [...canonFor(formType), ...getExtraCanon()]
    const uniq = [...new Set(all)].filter(
      (c) => !c || c === current || isProductCanon(c) || !usedSet.has(c)
    )
    const qq = q.trim().toLowerCase()
    if (!qq) return uniq
    return uniq.filter((c) => !c || c.toLowerCase().includes(qq))
  }, [formType, q, usedSet, current, is0701])

  const grouped = useMemo(() => {
    if (!is0701) return null
    const byGroup = new Map<ColumnGroupId | "extra", string[]>()
    for (const g of COLUMN_GROUPS) byGroup.set(g.id, [])
    byGroup.set("extra", [])

    const catIds = new Set(COLUMN_CATEGORIES.map((c) => c.id))
    for (const name of flatOptions) {
      if (!name) continue
      const cat = COLUMN_CATEGORIES.find((c) => c.id === name)
      if (cat) {
        const list = byGroup.get(cat.group) || []
        list.push(name)
        byGroup.set(cat.group, list)
      } else if (!catIds.has(name)) {
        const list = byGroup.get("extra") || []
        list.push(name)
        byGroup.set("extra", list)
      }
    }
    return byGroup
  }, [flatOptions, is0701])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 280)
  const top = Math.min(y, window.innerHeight - 400)

  const renderItem = (name: string) => {
    const isExtra = getExtraCanon().includes(name)
    const label =
      COLUMN_CATEGORIES.find((c) => c.id === name)?.label || name
    return (
      <div
        key={name}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-slate-800",
          current === name && "bg-cyan-950/50 font-semibold text-cyan-300"
        )}
      >
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect(name)}
        >
          {label}
        </button>
        {isExtra ? (
          <button
            type="button"
            className="rounded px-1 text-[11px] text-slate-500 hover:bg-red-600 hover:text-white"
            title="ลบรายการที่เพิ่มเอง"
            onClick={(e) => {
              e.stopPropagation()
              removeExtraCanon(name)
              onExtraAdded()
              if (current === name) onSelect("")
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 flex max-h-[380px] w-[260px] flex-col rounded-[10px] border border-slate-700 bg-slate-900 shadow-2xl"
      style={{ left, top }}
    >
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหมวดหัวตาราง..."
        className="m-2 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-400"
      />
      <div className="flex-1 overflow-auto pb-1">
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-800",
            !current && "bg-cyan-950/50 font-semibold text-cyan-300"
          )}
          onClick={() => onSelect("")}
        >
          <span className="text-slate-500">— ไม่แมพ —</span>
        </button>

        {grouped
          ? (
              <>
                {COLUMN_GROUPS.map((g) => {
                  const items = grouped.get(g.id) || []
                  if (!items.length) return null
                  return (
                    <div key={g.id}>
                      <div className="sticky top-0 bg-slate-950/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {g.label}
                      </div>
                      {items.map(renderItem)}
                    </div>
                  )
                })}
                {(grouped.get("extra") || []).length ? (
                  <div>
                    <div className="sticky top-0 bg-slate-950/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      เพิ่มเอง
                    </div>
                    {(grouped.get("extra") || []).map(renderItem)}
                  </div>
                ) : null}
              </>
            )
          : flatOptions.filter(Boolean).map(renderItem)}

        {q.trim() &&
        !canonFor(formType).includes(q.trim()) &&
        !COLUMN_CATEGORIES.some((c) => c.id === q.trim()) &&
        !getExtraCanon().includes(q.trim()) &&
        (isProductCanon(q.trim()) || !usedSet.has(q.trim())) ? (
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-cyan-300 hover:bg-slate-800"
            onClick={() => {
              if (addExtraCanon(q.trim())) {
                onExtraAdded()
                onSelect(q.trim())
              }
            }}
          >
            ＋ เพิ่ม “{q.trim()}”
          </button>
        ) : null}
        {!flatOptions.filter(Boolean).length ? (
          <div className="px-3 py-2 text-xs text-slate-500">ไม่พบรายการ</div>
        ) : null}
      </div>
    </div>
  )
}
