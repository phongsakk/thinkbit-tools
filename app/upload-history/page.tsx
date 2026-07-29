import type { Metadata } from "next"

import { UploadHistory } from "@/components/upload-history/upload-history"

export const metadata: Metadata = {
  title: "Upload History",
  description: "Upload batches grouped by blobFileName timestamp",
}

export default function UploadHistoryPage() {
  return <UploadHistory />
}
