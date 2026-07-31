"use client"

import { cn } from "@/lib/utils"

function formatPrimitive(value: unknown): string {
  if (value == null) return "—"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—"
    return new Intl.NumberFormat("th-TH").format(value)
  }
  if (typeof value === "string") return value.trim() === "" ? "—" : value
  return String(value)
}

function formatCell(value: unknown): string {
  if (value == null || value === "") return "—"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—"
    if (value === 0) return "—"
    return new Intl.NumberFormat("th-TH").format(value)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || trimmed === "0" || trimmed === "-") return "—"
    const asNumber = Number(trimmed.replace(/,/g, ""))
    if (trimmed !== "" && Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
      return asNumber === 0 ? "—" : new Intl.NumberFormat("th-TH").format(asNumber)
    }
    return trimmed
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** Split prepare payload: table uses `.data` only; everything else is meta. */
export function splitPreparePayload(prepare: {
  data?: unknown
  [key: string]: unknown
} | null): {
  meta: Record<string, unknown>
  data: unknown
} {
  if (!prepare) return { meta: {}, data: null }

  const meta: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(prepare)) {
    if (key === "data") continue
    // Never surface upstream prepare endpoint in the UI.
    if (key === "url") continue
    meta[key] = value
  }

  const rawData = prepare.data
  if (rawData == null) {
    return { meta, data: null }
  }

  // API envelope: { status, message, data: { fields / … } }
  if (isPlainObject(rawData) && "data" in rawData) {
    if ("status" in rawData) meta.status = rawData.status
    if ("message" in rawData) meta.message = rawData.message
    const inner = rawData.data
    if (isPlainObject(inner)) {
      const { fields, ...innerMeta } = inner
      for (const [key, value] of Object.entries(innerMeta)) {
        meta[`data.${key}`] = value
      }
      return { meta, data: fields !== undefined ? fields : inner }
    }
    return { meta, data: inner }
  }

  return { meta, data: rawData }
}

function PrepareNode({
  value,
  depth = 0,
}: {
  value: unknown
  depth?: number
}) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-500">[]</span>
    }
    const allPrimitive = value.every(
      (item) => item == null || ["string", "number", "boolean"].includes(typeof item)
    )
    if (allPrimitive) {
      return (
        <ul className="list-disc space-y-0.5 pl-4 text-slate-200">
          {value.map((item, index) => (
            <li key={index} className="break-words">
              {formatPrimitive(item)}
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-md border border-slate-700/80 bg-slate-950/40 p-2"
          >
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              #{index + 1}
            </div>
            <PrepareNode value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return <span className="text-slate-500">{"{}"}</span>
    }
    return (
      <div
        className={cn(
          "overflow-hidden rounded-md border border-slate-700/70",
          depth > 0 && "bg-slate-950/30"
        )}
      >
        <table className="w-full border-collapse text-left text-[12px]">
          <tbody>
            {entries.map(([key, child]) => {
              const nested = isPlainObject(child) || Array.isArray(child)
              return (
                <tr key={key} className="border-b border-slate-800 last:border-b-0">
                  <th className="w-[38%] max-w-[10rem] align-top bg-slate-900/70 px-2.5 py-1.5 font-medium text-slate-400">
                    <span className="break-words">{key}</span>
                  </th>
                  <td className="align-top px-2.5 py-1.5 text-slate-100">
                    {nested ? (
                      <PrepareNode value={child} depth={depth + 1} />
                    ) : (
                      <span className="break-words whitespace-pre-wrap">
                        {formatPrimitive(child)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <span className="break-words whitespace-pre-wrap text-slate-100">
      {formatPrimitive(value)}
    </span>
  )
}

type Form0701Fields = {
  form_type?: unknown
  material_type?: unknown
  material_id?: unknown
  unit?: unknown
  physical_open?: unknown
  report_open?: unknown
  reports?: unknown
  total?: unknown
}

const REPORT_COLUMNS: Array<{ key: string; label: string; group?: string }> = [
  { key: "date", label: "วันที่" },
  { key: "description", label: "รายการ" },
  { key: "evidence_number", label: "หลักฐานเลขที่" },
  { key: "outturn", label: "Outturn", group: "จำนวนรับ" },
  { key: "bl", label: "B/L", group: "จำนวนรับ" },
  { key: "discount", label: "รวมรับ", group: "จำนวนรับ" },
  { key: "tax_rate", label: "ผลิตสินค้าพิกัดภาษี", group: "จำนวนจ่าย" },
  { key: "other_product", label: "ผลิตสินค้าอื่น", group: "จำนวนจ่าย" },
  { key: "broken", label: "เสียหาย", group: "จำนวนจ่าย" },
  { key: "other_loss", label: "อื่นๆ", group: "จำนวนจ่าย" },
  { key: "total", label: "รวมจ่าย", group: "จำนวนจ่าย" },
  { key: "remains_physical", label: "คงเหลือจริง", group: "ยอดคงเหลือ" },
  { key: "remains_report", label: "คงเหลือตามบัญชี", group: "ยอดคงเหลือ" },
  { key: "diff", label: "ผลต่าง" },
  { key: "main_product", label: "หมายเหตุ" },
]

function isForm0701(data: unknown, docType?: string | null): data is Form0701Fields {
  if (typeof docType === "string" && /oil-07-01/i.test(docType)) return isPlainObject(data)
  if (!isPlainObject(data)) return false
  const formType = typeof data.form_type === "string" ? data.form_type : ""
  if (/07-01|๐๗-๐๑|ภส\.?\s*07/i.test(formType)) return true
  return Array.isArray(data.reports) && ("physical_open" in data || "material_type" in data)
}

function Form0701Table({ fields }: { fields: Form0701Fields }) {
  const reports = Array.isArray(fields.reports) ? fields.reports : []
  const total = isPlainObject(fields.total) ? fields.total : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2">
        <div className="text-center text-[13px] font-semibold tracking-wide text-slate-100">
          {formatPrimitive(fields.form_type) === "—"
            ? "ภส.07-01"
            : formatPrimitive(fields.form_type)}
        </div>
        <div className="mt-0.5 text-center text-[11px] text-slate-400">
          บัญชีประจำวันแสดงการรับและการจ่ายวัตถุดิบ
        </div>
        <div className="mt-2 grid gap-1 text-[12px] text-slate-200 sm:grid-cols-2">
          <div>
            <span className="text-slate-500">ประเภทวัตถุดิบ: </span>
            {formatPrimitive(fields.material_type)}
          </div>
          <div>
            <span className="text-slate-500">หน่วย: </span>
            {formatPrimitive(fields.unit)}
          </div>
          <div>
            <span className="text-slate-500">ยอดยกมา (จริง): </span>
            {formatCell(fields.physical_open)}
          </div>
          <div>
            <span className="text-slate-500">ยอดยกมา (บัญชี): </span>
            {formatCell(fields.report_open)}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-700">
        <table className="min-w-[1100px] w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-700 bg-slate-900 text-slate-300 shadow-[0_1px_0_0_rgb(30_41_59)]">
              {REPORT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap border-r border-slate-800 bg-slate-900 px-2 py-1.5 font-medium last:border-r-0"
                >
                  {col.group ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-normal text-slate-500">{col.group}</span>
                      <span>{col.label}</span>
                    </div>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td
                  colSpan={REPORT_COLUMNS.length}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  ไม่มีรายการใน reports
                </td>
              </tr>
            ) : (
              reports.map((row, index) => {
                const item = isPlainObject(row) ? row : {}
                return (
                  <tr
                    key={index}
                    className="border-b border-slate-800/80 odd:bg-slate-950/40 even:bg-slate-900/20"
                  >
                    {REPORT_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "border-r border-slate-800/60 px-2 py-1 align-top text-slate-100 last:border-r-0",
                          col.key === "description" || col.key === "main_product"
                            ? "min-w-[9rem] max-w-[14rem] break-words"
                            : "whitespace-nowrap tabular-nums",
                          col.key === "date" && "font-medium text-slate-200"
                        )}
                      >
                        {col.key === "date" ||
                        col.key === "description" ||
                        col.key === "evidence_number" ||
                        col.key === "main_product"
                          ? formatPrimitive(item[col.key])
                          : formatCell(item[col.key])}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
          {total ? (
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t border-slate-600 bg-slate-900 text-slate-100 shadow-[0_-1px_0_0_rgb(71_85_105)]">
                <td className="bg-slate-900 px-2 py-1.5 font-semibold" colSpan={3}>
                  รวมทั้งเดือน
                </td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">{formatCell(total.outturn)}</td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">{formatCell(total.bl)}</td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">
                  {formatCell(total.for_deduction ?? total.discount)}
                </td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">{formatCell(total.use)}</td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">{formatCell(total.other_product)}</td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">{formatCell(total.defected)}</td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums">{formatCell(total.etc)}</td>
                <td className="bg-slate-900 px-2 py-1.5 tabular-nums font-semibold">
                  {formatCell(total.overall)}
                </td>
                <td className="bg-slate-900 px-2 py-1.5" colSpan={4} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}

function MetaPanel({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return null

  return (
    <details className="rounded-md border border-slate-800 bg-slate-950/40">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-300">
        Meta ({entries.length})
      </summary>
      <div className="border-t border-slate-800 p-2">
        <PrepareNode value={Object.fromEntries(entries)} />
      </div>
    </details>
  )
}

export function PrepareDataTable({
  prepare,
  docType,
}: {
  prepare: {
    data?: unknown
    docType?: string
    [key: string]: unknown
  } | null
  docType?: string | null
}) {
  if (!prepare) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-sm text-slate-500">
        No prepare data
      </div>
    )
  }

  const { meta, data } = splitPreparePayload(prepare)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-3">
      <div className="shrink-0">
        <MetaPanel meta={meta} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {data == null ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            ไม่มีค่าใน .data
          </div>
        ) : isForm0701(data, docType) ? (
          <Form0701Table fields={data} />
        ) : (
          <div className="h-full overflow-auto">
            <PrepareNode value={data} />
          </div>
        )}
      </div>
    </div>
  )
}
