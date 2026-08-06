"use client"

import { createPortal } from "react-dom"
import toast from "react-hot-toast"

export function toastConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean, id: string) => {
      toast.dismiss(id)
      resolve(ok)
    }

    toast.custom(
      (t) =>
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="toast-confirm-title"
          >
            <button
              type="button"
              aria-label="ปิด"
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
              onClick={() => finish(false, t.id)}
            />
            <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-500/80 bg-slate-900 px-5 py-4 text-slate-100 shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <p
                id="toast-confirm-title"
                className="text-base font-medium leading-snug text-slate-50"
              >
                {message}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onClick={() => finish(false, t.id)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                  onClick={() => finish(true, t.id)}
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          </div>,
          document.body
        ),
      {
        duration: Infinity,
        style: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
          width: 0,
          height: 0,
          margin: 0,
          overflow: "hidden",
        },
      }
    )
  })
}
