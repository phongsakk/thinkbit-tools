import type { Metadata } from "next"

import { CosmosExplorer } from "@/components/cosmos/cosmos-explorer"

export const metadata: Metadata = {
  title: "Cosmos Data Explorer",
  description: "Browse and filter documents in Azure Cosmos DB",
}

export default function CosmosPage() {
  return <CosmosExplorer />
}
