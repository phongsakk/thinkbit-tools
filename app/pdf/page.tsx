import type { Metadata } from "next"

import { PdfGallery } from "@/components/pdf/pdf-gallery"

export const metadata: Metadata = {
  title: "PDF Cache",
  description: "Grid of PDFs cached under download/blob",
}

export default function PdfPage() {
  return <PdfGallery />
}
