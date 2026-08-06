import { downloadBlobByFileName } from "@/lib/azure-blob"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: Request) {
  try {
    const name = new URL(request.url).searchParams.get("name")?.trim()
    if (!name) {
      return Response.json(
        { error: "?name= (blobFileName) required" },
        { status: 400 }
      )
    }

    const downloaded = await downloadBlobByFileName(name)
    return new Response(new Uint8Array(downloaded.buffer), {
      status: 200,
      headers: {
        "Content-Type": downloaded.contentType || "application/pdf",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const notFound = /404|not found/i.test(message)
    return Response.json(
      { error: message },
      { status: notFound ? 404 : 502 }
    )
  }
}
