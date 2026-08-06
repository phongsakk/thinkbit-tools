"use client"

import Swal from "sweetalert2"

export type SwalConfirmOptions = {
  title?: string
  confirmText?: string
  cancelText?: string
  /** Use destructive (red) confirm button — default true for delete-style confirms */
  destructive?: boolean
}

/**
 * Confirm dialog via SweetAlert2 with blurred backdrop.
 * Returns true if the user confirms.
 */
export async function swalConfirm(
  message: string,
  opts: SwalConfirmOptions = {}
): Promise<boolean> {
  const {
    title = "ยืนยัน",
    confirmText = "ยืนยัน",
    cancelText = "ยกเลิก",
    destructive = true,
  } = opts

  const result = await Swal.fire({
    title,
    text: message,
    icon: "warning",
    showCancelButton: true,
    reverseButtons: true,
    focusCancel: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    buttonsStyling: false,
    backdrop: "rgba(2, 6, 23, 0.72)",
    customClass: {
      container: "swal-blur-container",
      popup: "swal-dark-popup",
      title: "swal-dark-title",
      htmlContainer: "swal-dark-html",
      actions: "swal-dark-actions",
      confirmButton: destructive
        ? "swal-btn swal-btn-danger"
        : "swal-btn swal-btn-primary",
      cancelButton: "swal-btn swal-btn-ghost",
    },
  })

  return result.isConfirmed
}

/** @deprecated Prefer swalConfirm — kept for existing call sites */
export const toastConfirm = swalConfirm
