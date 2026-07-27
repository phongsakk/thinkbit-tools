import { BlobServiceClient } from "@azure/storage-blob"

let blobServiceClient: BlobServiceClient | null = null

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      requiredEnv("AZURE_STORAGE_CONNECTION_STRING")
    )
  }
  return blobServiceClient
}

/**
 * Parse cosmos `blobFileName` into container + blob path.
 * Default: first path segment is the container (`OR-test/...`).
 * Override container with `AZURE_STORAGE_CONTAINER` to treat the whole string as blob name.
 */
export function parseBlobStoragePath(blobFileName: string): {
  containerName: string
  blobName: string
  fileName: string
} {
  const normalized = blobFileName.replace(/^\/+/, "").trim()
  if (!normalized) {
    throw new Error("blobFileName is empty")
  }

  const overrideContainer = process.env.AZURE_STORAGE_CONTAINER?.trim()
  let containerName: string
  let blobName: string

  if (overrideContainer) {
    containerName = overrideContainer
    blobName = normalized
  } else {
    const slash = normalized.indexOf("/")
    if (slash <= 0 || slash === normalized.length - 1) {
      throw new Error(
        "blobFileName must be container/path/... (or set AZURE_STORAGE_CONTAINER)"
      )
    }
    containerName = normalized.slice(0, slash)
    blobName = normalized.slice(slash + 1)
  }

  const fileName = blobName.split("/").pop() || "download.pdf"
  return { containerName, blobName, fileName }
}

export async function downloadBlobByFileName(blobFileName: string): Promise<{
  buffer: Buffer
  contentType: string | undefined
  containerName: string
  blobName: string
  fileName: string
}> {
  const { containerName, blobName, fileName } = parseBlobStoragePath(blobFileName)
  const container = getBlobServiceClient().getContainerClient(containerName)
  const blob = container.getBlobClient(blobName)
  const exists = await blob.exists()
  if (!exists) {
    throw new Error(`Blob not found: ${containerName}/${blobName}`)
  }
  const buffer = await blob.downloadToBuffer()
  const properties = await blob.getProperties()
  return {
    buffer,
    contentType: properties.contentType,
    containerName,
    blobName,
    fileName,
  }
}
