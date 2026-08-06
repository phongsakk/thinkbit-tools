import { MongoClient, type Db } from "mongodb"

const GLOBAL_KEY = "__thinkbit_mongodb_client__"

type MongoGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: {
    client: MongoClient
    promise: Promise<MongoClient>
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function assertMongoEnv() {
  requiredEnv("MONGODB_URI")
}

export function getMongoDbName() {
  return process.env.MONGODB_DB?.trim() || "thinkbit_tools"
}

function getMongoGlobal() {
  return globalThis as MongoGlobal
}

async function connectMongoClient(): Promise<MongoClient> {
  assertMongoEnv()
  const uri = requiredEnv("MONGODB_URI")
  const store = getMongoGlobal()

  if (!store[GLOBAL_KEY]) {
    const client = new MongoClient(uri)
    store[GLOBAL_KEY] = {
      client,
      promise: client.connect(),
    }
  }

  const entry = store[GLOBAL_KEY]!
  await entry.promise
  return entry.client
}

export async function getMongoClient(): Promise<MongoClient> {
  return connectMongoClient()
}

export async function getMongoDb(dbName?: string): Promise<Db> {
  const client = await getMongoClient()
  return client.db(dbName || getMongoDbName())
}

export async function pingMongo(): Promise<{ ok: true; db: string }> {
  const db = await getMongoDb()
  await db.command({ ping: 1 })
  return { ok: true, db: db.databaseName }
}
