import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

function asSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Old path → ภส.07-01 review */
export default async function OcrReviewRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) ?? {}
  const qs = new URLSearchParams()
  const dg = asSingle(sp.dg) || asSingle(sp.documentGroup) || asSingle(sp.set)
  const from = asSingle(sp.from)
  if (dg) qs.set("dg", dg)
  if (from) qs.set("from", from)
  const q = qs.toString()
  redirect(q ? `/docs/07-01-review?${q}` : "/docs/07-01-review")
}
