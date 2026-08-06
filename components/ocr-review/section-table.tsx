"use client"

import { useMemo, type ReactNode } from "react"
import { BetweenVerticalStart, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { isProductCanon } from "@/lib/ocr-review/canon"
import {
  buildGroupSpans,
  getColumnCategory,
  type ColumnGroupId,
} from "@/lib/ocr-review/0701-columns"
import type { Row, Section } from "@/lib/ocr-review/types"
import { swalConfirm } from "@/lib/swal"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Props = {
  si: number
  section: Section
  colMap: string[]
  /** Column indices in UI order (identity → receive → …). */
  displayOrder?: number[]
  edits: Record<number, Record<number, string>>
  deletedRows: Set<string>
  deletedCols: Set<string>
  prodName: Record<number, string>
  headerClean: Record<number, string>
  tableSearch: string
  /** Use two-row grouped header (07-01). */
  groupedHeader?: boolean
  onOpenCanon: (ci: number, x: number, y: number) => void
  onCellChange: (ri: number, ci: number, value: string) => void
  onProdNameChange: (ci: number, value: string) => void
  onDeleteCol: (ci: number) => void
  onDeleteRow: (ri: number) => void
  onInsertCol: (afterCi: number) => void
  onInsertRow: (afterRi: number) => void
}

function isNum(s: string) {
  if (!s || s === "-") return false
  return /^[0-9.,]+$/.test(s.trim())
}

const GROUP_BG: Record<ColumnGroupId, string> = {
  identity: "bg-slate-800",
  receive: "bg-teal-950/80",
  pay: "bg-indigo-950/70",
  balance: "bg-amber-950/70",
  other: "bg-slate-800",
  unknown: "bg-red-950/50",
}

function IconAction({
  label,
  className,
  onClick,
  children,
}: {
  label: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        delay={200}
        aria-label={label}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors",
          className
        )}
        onClick={onClick}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function SectionTable({
  si,
  section,
  colMap,
  displayOrder,
  edits,
  deletedRows,
  deletedCols,
  prodName,
  headerClean,
  tableSearch,
  groupedHeader = true,
  onOpenCanon,
  onCellChange,
  onProdNameChange,
  onDeleteCol,
  onDeleteRow,
  onInsertCol,
  onInsertRow,
}: Props) {
  const visCols = useMemo(() => {
    const n = section.headers.length
    const base =
      displayOrder && displayOrder.length
        ? displayOrder.filter((ci) => ci >= 0 && ci < n)
        : section.headers.map((_, ci) => ci)
    // Include any missing indices (e.g. newly inserted) at end
    const seen = new Set(base)
    const ordered = [...base]
    for (let ci = 0; ci < n; ci++) {
      if (!seen.has(ci)) ordered.push(ci)
    }
    return ordered.filter((ci) => !deletedCols.has(`${si}:${ci}`))
  }, [section.headers, deletedCols, si, displayOrder])

  const groupSpans = useMemo(
    () => (groupedHeader ? buildGroupSpans(visCols, colMap) : []),
    [groupedHeader, visCols, colMap]
  )

  const q = tableSearch.trim().toLowerCase()

  const renderLeafHeader = (ci: number) => {
    const mapped = colMap[ci] || ""
    const ocr = section.headers[ci] || ""
    const cleaned = headerClean[ci]
    const catLabel = getColumnCategory(mapped)?.label || mapped
    return (
      <th
        key={ci}
        className={cn(
          "sticky z-[2] whitespace-nowrap border-b border-r border-slate-700 bg-slate-800 px-1.5 py-1.5 text-left align-top font-semibold text-slate-200",
          groupedHeader ? "top-[28px]" : "top-0"
        )}
      >
        <div className="colops mb-1 flex gap-0.5">
          <IconAction
            label="แทรกคอลัมน์หลังนี้"
            className="bg-cyan-950/50 text-cyan-300 hover:bg-cyan-800 hover:text-white"
            onClick={() => onInsertCol(ci)}
          >
            <BetweenVerticalStart className="size-3.5" />
          </IconAction>
          <IconAction
            label="ลบคอลัมน์นี้"
            className="text-slate-500 hover:bg-red-600 hover:text-white"
            onClick={() => {
              void (async () => {
                if (
                  await swalConfirm(
                    `ลบคอลัมน์ “${mapped || ocr || ci + 1}”?`
                  )
                ) {
                  onDeleteCol(ci)
                }
              })()
            }}
          >
            <Trash2 className="size-3.5" />
          </IconAction>
        </div>
        <button
          type="button"
          title="เลือกหมวดคอลัมน์ — แมพทั้งคอลัมน์"
          className={cn(
            "mb-1 block w-full max-w-[160px] truncate rounded border px-2 py-0.5 text-left text-xs font-semibold",
            mapped
              ? "border-slate-600 bg-slate-950 text-slate-100 hover:border-cyan-400"
              : "border-red-800/80 bg-red-950/40 font-bold text-red-200"
          )}
          onClick={(e) => {
            const r = (e.target as HTMLElement).getBoundingClientRect()
            onOpenCanon(ci, r.left, r.bottom + 4)
          }}
        >
          {catLabel || "✎ เลือกหมวด"}
        </button>
        {isProductCanon(mapped) ? (
          <>
            <div className="mb-0.5 mt-1 text-[10px] font-medium text-cyan-500/90">
              ชื่อผลิตภัณฑ์
            </div>
            <input
              className="mb-1 block w-full max-w-[160px] rounded border border-slate-600 bg-cyan-950/40 px-1.5 py-1 text-[11px] font-semibold text-cyan-100 outline-none focus:border-cyan-400"
              placeholder="ชื่อสินค้าใต้หัวผลิตภัณฑ์"
              title="ชื่อผลิตภัณฑ์ในคอลัมน์นี้"
              value={prodName[ci] || ""}
              onChange={(e) => onProdNameChange(ci, e.target.value)}
            />
            <div
              className="ohdr max-w-[160px] overflow-hidden text-ellipsis text-[11px] font-normal text-slate-500"
              title={ocr}
            >
              OCR: {ocr || "·"}
            </div>
          </>
        ) : (
          <div
            className={cn(
              "ohdr mt-0.5 max-w-[120px] overflow-hidden text-ellipsis text-[11px] font-normal text-slate-500",
              cleaned && "text-emerald-400"
            )}
            title={cleaned || ocr}
          >
            {cleaned || ocr}
            {cleaned ? (
              <span className="ml-1 rounded bg-emerald-700 px-1 text-[9px] text-emerald-50">
                AI
              </span>
            ) : null}
          </div>
        )}
      </th>
    )
  }

  return (
    <TooltipProvider delay={200}>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            {groupedHeader ? (
              <>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 top-0 z-[4] w-14 border-b border-r border-slate-700 bg-slate-800 px-1 py-1.5 text-center text-[11px] font-medium text-slate-400"
                  >
                    actions
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky left-14 top-0 z-[4] w-10 border-b border-r border-slate-700 bg-slate-800 px-1.5 py-1.5 text-right text-slate-500"
                  >
                    #
                  </th>
                  {groupSpans.map((span, i) => (
                    <th
                      key={`${span.group}-${i}`}
                      colSpan={span.cols.length}
                      className={cn(
                        "sticky top-0 z-[3] border-b border-r border-slate-700 px-2 py-1 text-center text-[10px] font-semibold tracking-wide text-slate-300",
                        GROUP_BG[span.group]
                      )}
                    >
                      {span.group === "unknown" ? "ยังไม่แมพหมวด" : span.label}
                    </th>
                  ))}
                </tr>
                <tr>{visCols.map((ci) => renderLeafHeader(ci))}</tr>
              </>
            ) : (
              <tr>
                <th className="sticky left-0 z-[3] w-14 border-b border-r border-slate-700 bg-slate-800 px-1 py-1.5 text-center text-[11px] font-medium text-slate-400">
                  actions
                </th>
                <th className="sticky left-14 z-[3] w-10 border-b border-r border-slate-700 bg-slate-800 px-1.5 py-1.5 text-right text-slate-500">
                  #
                </th>
                {visCols.map((ci) => renderLeafHeader(ci))}
              </tr>
            )}
          </thead>
          <tbody>
            {section.rows.map((row: Row, ri) => {
              if (deletedRows.has(`${si}:${ri}`)) return null
              const cells = visCols.map((ci) => {
                const ed = edits[ri]?.[ci]
                return ed != null ? ed : row.cells[ci] ?? ""
              })
              const hay = cells.join(" ").toLowerCase()
              const dim = q && !hay.includes(q)
              return (
                <tr
                  key={ri}
                  className={cn(
                    "group even:bg-slate-950/60 hover:bg-amber-950/30",
                    row.kind === "carry" && "[&>td]:bg-sky-950/60",
                    row.kind === "sum" && "font-semibold [&>td]:bg-slate-900",
                    dim && "opacity-20"
                  )}
                >
                  <td className="sticky left-0 z-[1] border-b border-r border-slate-800 bg-inherit px-1 py-1">
                    <div className="flex items-center justify-center gap-0.5">
                      <IconAction
                        label="แทรกแถวใต้แถวนี้"
                        className="text-sky-400/70 hover:bg-cyan-500 hover:text-slate-950"
                        onClick={() => onInsertRow(ri)}
                      >
                        <Plus className="size-3.5" />
                      </IconAction>
                      <IconAction
                        label="ลบแถวนี้"
                        className="text-slate-500 hover:bg-red-600 hover:text-white"
                        onClick={() => {
                          void (async () => {
                            if (await swalConfirm(`ลบแถวที่ ${ri + 1}?`)) {
                              onDeleteRow(ri)
                            }
                          })()
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconAction>
                    </div>
                  </td>
                  <td className="sticky left-14 z-[1] border-b border-r border-slate-800 bg-inherit px-1.5 py-1 text-right text-slate-500">
                    {ri + 1}
                  </td>
                  {visCols.map((ci, idx) => {
                    const val = cells[idx]
                    const edited = edits[ri]?.[ci] != null
                    return (
                      <td
                        key={ci}
                        contentEditable
                        suppressContentEditableWarning
                        className={cn(
                          "whitespace-nowrap border-b border-r border-slate-800 px-1.5 py-1 outline-none focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/50",
                          isNum(val) && "text-right font-mono tabular-nums",
                          edited &&
                            "bg-emerald-950/50 shadow-[inset_0_0_0_1px_#22c55e]"
                        )}
                        onBlur={(e) => {
                          const next = e.currentTarget.textContent ?? ""
                          const orig = row.cells[ci] ?? ""
                          if (next !== orig) onCellChange(ri, ci, next)
                        }}
                      >
                        {val}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            <tr className="add-row-btn">
              <td colSpan={visCols.length + 2} className="px-2 py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-600 bg-slate-900 px-3 py-1 text-sm text-cyan-300 hover:border-cyan-400 hover:bg-slate-800"
                  onClick={() =>
                    onInsertRow(
                      Math.max(
                        -1,
                        ...section.rows
                          .map((_, ri) => ri)
                          .filter((ri) => !deletedRows.has(`${si}:${ri}`))
                      )
                    )
                  }
                >
                  <Plus className="size-3.5" />
                  เพิ่มแถว
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}
