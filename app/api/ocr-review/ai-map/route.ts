export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

type AiMapBody = {
  headers?: unknown
  canonical?: unknown
  pdf?: unknown
}

export async function POST(request: Request) {
  const AI_KEY = process.env.ANTHROPIC_API_KEY?.trim() || ""
  const AI_MODEL = process.env.AI_MODEL?.trim() || "claude-haiku-4-5-20251001"

  if (!AI_KEY) {
    return Response.json(
      {
        error:
          "server ยังไม่ได้ตั้ง ANTHROPIC_API_KEY — ใส่ใน .env.local แล้วรีสตาร์ท dev server",
      },
      { status: 400 }
    )
  }

  let body: AiMapBody
  try {
    body = (await request.json()) as AiMapBody
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 })
  }

  const headers = Array.isArray(body.headers)
    ? body.headers.filter((h): h is string => typeof h === "string")
    : []
  const canonical = Array.isArray(body.canonical)
    ? body.canonical.filter((c): c is string => typeof c === "string")
    : []
  const pdf = typeof body.pdf === "string" ? body.pdf : ""

  if (!headers.length) {
    return Response.json({ mapping: {}, products: {}, headerClean: {} })
  }

  const prompt =
    `จับคู่หัวคอลัมน์ OCR (ฟอร์ม ภส.07-01, ภาษาไทย) กับ canonical ที่ให้มา\n` +
    `ตัวเลือก canonical: ${canonical.join(", ")}\n` +
    `หัวคอลัมน์ OCR (บางค่าอาจถูก OCR อ่านผิด/ไม่เป็นคำ):\n${headers.map((h, i) => `${i}\t${h}`).join("\n")}\n` +
    (pdf
      ? `มีไฟล์ PDF แนบ — ใช้สิ่งที่เห็นใน PDF เป็นหลักในการตัดสินใจทุกอย่าง (OCR ผิดบ่อย)\n`
      : "") +
    `เลือก canonical จากรายการที่ให้ 1 ตัวต่อหัวคอลัมน์ ถ้าไม่มีที่ตรงเลย ให้ตั้งชื่อ canonical ใหม่ที่สั้นและสื่อความหมาย (เช่น "จำนวนรับ") ใช้ "" เฉพาะเมื่ออ่านไม่ออกจริงๆ\n` +
    `สำคัญมากเรื่อง "อัตรา": คำว่า "อัตรา" หรือ "อัตราภาษีสรรพสามิต" ปรากฏในหลายคอลัมน์ — ทั้งคอลัมน์อัตราภาษีจริง และคอลัมน์สินค้า ("ผลิตสินค้าพิกัดอัตราภาษีสรรพสามิต_<ชื่อสินค้า>") ${pdf ? "ดูจาก PDF เสมอว่าคอลัมน์ไหนคือสินค้า (มีชื่อสินค้า เช่น B10/B20/HSD/แก๊สโซฮอล์) แม้ OCR จะเหลือแค่คำว่าอัตราภาษีสรรพสามิต ก็ตาม " : ""}→ คอลัมน์สินค้าใช้ canonical "product" และใส่ชื่อสินค้าใน products (ห้ามใช้ "อัตรา", ห้ามตั้ง "product: ชื่อ") ส่วนคอลัมน์อัตราภาษีจริงใช้ "อัตรา"\n` +
    `สำหรับคอลัมน์ "product" ให้ใส่ชื่อ product ใน products[] ${pdf ? "ที่อ่านได้ชัดจาก PDF " : ""}— ชื่อ product คือส่วนหลัง "ผลิตสินค้าพิกัดอัตราภาษีสรรพสามิต" เก็บชื่อเต็มไว้ครบ ห้ามตัดทอนเป็นแค่รหัส (เช่น "ดีเซลหมุนเร็ว(BO)" ไม่ใช่ "BO"; ตัวอย่างที่ถูก: "แก๊สโซฮอล์95", "B10", "ดีเซลหมุนเร็ว(BO)") — ถ้า${pdf ? "" : "ไม่มี PDF หรือ"}อ่านไม่ออก/ไม่มั่นใจ ห้ามใส่ ห้ามเดา/ประดิษฐ์ ห้ามมีคำว่า "พิกัดอัตราภาษีสรรพสามิต"\n` +
    `สำหรับทุกหัวคอลัมน์ ให้ระบุข้อความหัวคอลัมน์ที่สะอาด/ถูกต้อง — อ่านจาก PDF ถ้ามี ถ้าอ่านไม่ออกหรือไม่มั่นใจ ให้ใช้ข้อความ OCR เดิม (ห้ามเดา)\n` +
    `ตอบเป็น JSON เท่านั้น ห้ามอธิบาย: {"mapping":[{"i":0,"canonical":"..."}],"products":[{"i":0,"name":"..."}],"headers":[{"i":0,"text":"..."}]}`

  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "document"
        source: { type: "base64"; media_type: "application/pdf"; data: string }
      }
  > = [{ type: "text", text: prompt }]

  if (pdf) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdf,
      },
    })
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 2500,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(120_000),
    })

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
      error?: unknown
    }

    if (!response.ok) {
      return Response.json(
        { error: "Anthropic API error", detail: payload },
        { status: response.status }
      )
    }

    const txt = payload.content?.[0]?.text || ""
    const m = txt.match(/\{[\s\S]*\}/)
    const mapping: Record<string, string> = {}
    const products: Record<string, string> = {}
    const headerClean: Record<string, string> = {}

    if (m) {
      const parsed = JSON.parse(m[0]) as {
        mapping?: Array<{ i?: number; canonical?: string }>
        products?: Array<{ i?: number; name?: string }>
        headers?: Array<{ i?: number; text?: string }>
      }
      for (const x of parsed.mapping || []) {
        if (x.i != null && headers[x.i] != null) {
          mapping[headers[x.i]] = x.canonical || ""
        }
      }
      for (const x of parsed.products || []) {
        if (x.i != null && headers[x.i] != null && x.name) {
          products[headers[x.i]] = String(x.name)
        }
      }
      for (const x of parsed.headers || []) {
        if (x.i != null && headers[x.i] != null && x.text) {
          headerClean[headers[x.i]] = String(x.text)
        }
      }
    }

    console.log(
      `[ocr-review/ai-map] ${headers.length} headers → ${Object.keys(mapping).length} mapped, ${Object.keys(products).length} products, ${Object.keys(headerClean).length} cleaned (pdf: ${pdf ? "yes" : "no"})`
    )

    return Response.json({ mapping, products, headerClean })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    )
  }
}
