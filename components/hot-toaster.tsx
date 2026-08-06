"use client"

import { Toaster, ToastBar } from "react-hot-toast"

export function HotToaster() {
  return (
    <Toaster
      position="top-center"
      gutter={12}
      containerStyle={{ top: 16, zIndex: 9999 }}
      toastOptions={{
        className: "!text-sm !font-medium !shadow-xl",
        duration: 4500,
        style: {
          background: "#0f172a",
          color: "#f1f5f9",
          border: "1px solid #475569",
          padding: "12px 16px",
          maxWidth: "420px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
        },
        success: {
          duration: 4000,
          style: {
            background: "#052e1c",
            color: "#a7f3d0",
            border: "1px solid #059669",
          },
          iconTheme: { primary: "#34d399", secondary: "#052e1c" },
        },
        error: {
          duration: 6000,
          style: {
            background: "#450a0a",
            color: "#fecaca",
            border: "1px solid #dc2626",
          },
          iconTheme: { primary: "#f87171", secondary: "#450a0a" },
        },
        loading: {
          style: {
            background: "#083344",
            color: "#a5f3fc",
            border: "1px solid #0891b2",
          },
          iconTheme: { primary: "#22d3ee", secondary: "#083344" },
        },
      }}
    >
      {(t) => (
        <ToastBar
          toast={t}
          style={{
            animation: t.visible
              ? "toast-bounce-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both"
              : "toast-bounce-out 0.4s cubic-bezier(0.36, 0, 0.66, -0.56) both",
          }}
        />
      )}
    </Toaster>
  )
}
