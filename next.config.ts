import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Docker/self-host only. Never enable standalone on Vercel runtime.
  ...(process.env.OUTPUT_STANDALONE === "1" && !process.env.VERCEL
    ? { output: "standalone" as const }
    : {}),
  // Prevent Next from bundling Azure SDKs into serverless functions.
  serverExternalPackages: ["@azure/storage-blob"],
  async redirects() {
    return [
      {
        source: "/cosmos",
        destination: "/doc-workbench",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
