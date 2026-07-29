import type { Metadata } from "next"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import { CosmosExplorer } from "@/components/cosmos/cosmos-explorer"

export const metadata: Metadata = {
  title: "Cosmos Data Explorer",
  description: "Browse and filter documents in Azure Cosmos DB",
}

export default function CosmosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-svh items-center justify-center bg-slate-950 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <CosmosExplorer />
    </Suspense>
  )
}
