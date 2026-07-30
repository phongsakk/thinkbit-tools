import type { Metadata } from "next"

import { CosmosExplorer } from "@/components/cosmos/cosmos-explorer"
import { loadInitialCosmosQuery } from "@/lib/cosmos-query"

export const metadata: Metadata = {
  title: "Cosmos Data Explorer",
  description: "Browse and filter documents in Azure Cosmos DB",
}

export const dynamic = "force-dynamic"

function asSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function CosmosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const initial = await loadInitialCosmosQuery({
    unixtime: asSingle(sp.unixtime),
    id: asSingle(sp.id),
    field: asSingle(sp.field),
    mode: asSingle(sp.mode),
    value: asSingle(sp.value),
    fresh: asSingle(sp.fresh),
  })

  return (
    <CosmosExplorer
      initialFilter={initial.filter}
      initialData={initial.result}
      initialError={initial.error}
    />
  )
}
