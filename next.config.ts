import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Docker/self-host only. Do not enable on Vercel — it breaks serverless packaging.
  ...(process.env.OUTPUT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Azure SDKs break when Next bundles them for serverless functions.
  serverExternalPackages: ["@azure/cosmos", "@azure/storage-blob"],
}

export default nextConfig
