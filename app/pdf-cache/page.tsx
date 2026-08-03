import type { Metadata } from "next"

import { PdfGallery } from "@/components/pdf/pdf-gallery"

export const metadata: Metadata = {
  title: "คลัง PDF",
  description: "แกลเลอรี PDF ที่ cache ไว้ใน download/blob",
}

export default function PdfCachePage() {
  return <PdfGallery />
}
