import type { Metadata } from "next"

import { HealthDashboard } from "@/components/health/health-dashboard"

export const metadata: Metadata = {
  title: "System Health",
  description: "Connection health checks for Cosmos DB, Azure Blob, and local cache",
}

export default function HealthPage() {
  return <HealthDashboard />
}
