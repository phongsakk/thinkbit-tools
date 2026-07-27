import { CosmosClient, type Container, type Database } from "@azure/cosmos"

let client: CosmosClient | null = null

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getCosmosClient(): CosmosClient {
  if (!client) {
    client = new CosmosClient({
      endpoint: requiredEnv("COSMOS_ENDPOINT"),
      key: requiredEnv("COSMOS_KEY"),
    })
  }
  return client
}

export function getCosmosDatabase(): Database {
  return getCosmosClient().database(requiredEnv("COSMOS_DATABASE_ID"))
}

export function getCosmosContainer(): Container {
  return getCosmosDatabase().container(requiredEnv("COSMOS_CONTAINER_ID"))
}

export function getCosmosMeta() {
  return {
    databaseId: requiredEnv("COSMOS_DATABASE_ID"),
    containerId: requiredEnv("COSMOS_CONTAINER_ID"),
  }
}
