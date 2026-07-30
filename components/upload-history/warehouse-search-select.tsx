"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronsUpDown, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"

type WarehouseSearchSelectProps = {
  value: string[]
  warehouses: string[]
  disabled?: boolean
  onChange: (value: string[]) => void
  className?: string
}

function summarize(selected: string[]) {
  if (selected.length === 0) return "ทุกคลัง"
  if (selected.length === 1) return selected[0]
  if (selected.length === 2) return `${selected[0]}, ${selected[1]}`
  return `${selected[0]}, ${selected[1]} +${selected.length - 2}`
}

export function WarehouseSearchSelect({
  value,
  warehouses,
  disabled,
  onChange,
  className,
}: WarehouseSearchSelectProps) {
  return (
    <Combobox.Root
      multiple
      items={warehouses}
      value={value}
      onValueChange={(next) => onChange(next ?? [])}
      disabled={disabled}
    >
      <div className={cn("relative", className)}>
        <Combobox.Trigger
          className={cn(
            "flex h-9 w-full items-center gap-1.5 rounded-md border border-slate-600 bg-slate-900 px-2 text-left text-sm text-slate-100 outline-none",
            "hover:border-slate-500 focus-visible:border-cyan-500/60",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "data-[popup-open]:border-cyan-500/60"
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              value.length === 0 ? "text-slate-500" : "text-slate-100"
            )}
          >
            {summarize(value)}
          </span>
          {value.length > 0 ? (
            <span
              role="button"
              tabIndex={-1}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label="ล้างคลังที่เลือก"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange([])
              }}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="size-3.5 shrink-0 text-slate-400" />
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner className="z-50 outline-none" sideOffset={4}>
          <Combobox.Popup
            className={cn(
              "w-[var(--anchor-width)] overflow-hidden rounded-md border border-slate-600",
              "bg-slate-900 shadow-xl outline-none"
            )}
          >
            <div className="border-b border-slate-700/80 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-500" />
                <Combobox.Input
                  placeholder="ค้นหาคลัง…"
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 pr-2 pl-7 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500/50"
                />
              </div>
              {value.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {value.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[11px] text-cyan-100"
                    >
                      {item}
                      <button
                        type="button"
                        className="rounded p-0.5 text-cyan-200/80 hover:bg-cyan-500/20 hover:text-cyan-50"
                        aria-label={`ลบ ${item}`}
                        onClick={() => onChange(value.filter((v) => v !== item))}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <Combobox.Empty className="px-3 py-2 text-xs text-slate-500">
              ไม่พบคลัง
            </Combobox.Empty>
            <Combobox.List className="max-h-48 overflow-auto py-1">
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-200 outline-none select-none",
                    "data-[highlighted]:bg-cyan-500/15 data-[highlighted]:text-cyan-100",
                    "data-[selected]:text-cyan-200"
                  )}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    <Combobox.ItemIndicator>
                      <Check className="size-3.5 text-cyan-300" />
                    </Combobox.ItemIndicator>
                  </span>
                  {item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
