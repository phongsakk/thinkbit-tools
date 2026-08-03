import type { Metadata } from "next"

import { HealthDashboard } from "@/components/health/health-dashboard"

export const metadata: Metadata = {
  title: "สุขภาพระบบ",
  description: "ตรวจสถานะการเชื่อมต่อ Cosmos DB, Azure Blob และ local cache",
}

export default function HealthPage() {
  return <HealthDashboard />
}
