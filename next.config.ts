import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Docker/self-host only. Do not enable on Vercel — it breaks serverless packaging.
  ...(process.env.OUTPUT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Prevent Next from bundling Azure SDKs into serverless functions.
  serverExternalPackages: ["@azure/storage-blob"],
}

export default nextConfig
