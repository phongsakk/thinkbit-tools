/** Canonical column registry + keyword matcher — from ocr-review.html L243–355, L597–608 */

export const EXTRA_CANON_STORAGE_KEY = "oilOcrExtraCanon";

export const CANON = [
  "วันที่", "รายการ", "เลขที่", "B/L", "Outturn", "รับตามบัญชีสิทธิ์",
  "สิทธิ์", "อัตรา", "ผลิตภัณฑ์", "ผลิตสินค้าอื่น", "เสียหาย", "อื่นๆ", "รวมจ่าย",
  "คงเหลือ Stock", "คงเหลือตามบัญชีสิทธิ์", "คงเหลือ", "Gain", "หมายเหตุ",
] as const;

/** Columns of daily product qty under a material header. */
export const PRODUCT_CANON = "ผลิตภัณฑ์";

/** Match current + legacy AI value "product". */
export function isProductCanon(c: string | undefined | null): boolean {
  const s = (c || "").trim()
  return s === PRODUCT_CANON || /^product$/i.test(s)
}

/** Normalize AI/legacy aliases → current canon ids. */
export function normalizeCanon(c: string | undefined | null): string {
  const s = (c || "").trim()
  if (!s) return ""
  if (/^product$/i.test(s) || s === "HSD") return PRODUCT_CANON
  if (s === "สินค้าอื่น") return "ผลิตสินค้าอื่น"
  // No separate "จำนวนรับ" — always รับตามบัญชีสิทธิ์
  if (
    s === "จำนวนรับ" ||
    s === "รับตามบัญชีสิทธิ์" ||
    /^จำนวนรับตามบัญชีสิทธิ/.test(s) ||
    s === "ปริมาณรับ" ||
    s === "รับเข้า"
  ) {
    return "รับตามบัญชีสิทธิ์"
  }
  if (/^คงเหลือ\s*stock$/i.test(s) || /^stock$/i.test(s)) return "คงเหลือ Stock"
  if (
    s === "บช.สิทธิ์" ||
    s === "บช.สิทธิ" ||
    s === "บัญชีสิทธิ์" ||
    /^คงเหลือตามบัญชีสิทธิ/.test(s) ||
    /^ยอดคงเหลือตามบัญชีสิทธิ/.test(s)
  ) {
    return "คงเหลือตามบัญชีสิทธิ์"
  }
  return s
}

export const KEYWORDS: Record<string, string[]> = {
  "วันที่": ["วัน", "เดือน", "ปี"],
  "รายการ": ["รายการ"],
  "เลขที่": ["หลักฐาน", "เลขที่", "เลข"],
  "B/L": ["b/l", "bl", "ใบตราส่ง"],
  "Outturn": ["outturn"],
  "รับตามบัญชีสิทธิ์": [
    "จำนวนรับตามบัญชีสิทธิ์",
    "รับตามบัญชีสิทธิ์",
    "จำนวนรับ",
    "ปริมาณรับ",
    "รับเข้า",
  ],
  "สิทธิ์": ["สิทธิ", "ลดหย่อน", "ปริมาณสิทธิ์"],
  "อัตรา": ["อัตรา", "ภาษี"],
  "ผลิตภัณฑ์": ["ผลิตสินค้าพิกัด", "ผลิตสินค้าตามพิกัด", "hsd", "premium"],
  "ผลิตสินค้าอื่น": ["สินค้าอื่น", "ผลิตสินค้าอื่น"],
  "เสียหาย": ["เสียหาย", "สูญ"],
  "อื่นๆ": ["อื่น"],
  "รวมจ่าย": ["รวมจ่าย"],
  "คงเหลือ Stock": ["stock", "คงเหลือ stock", "ยอดคงเหลือ stock"],
  "คงเหลือตามบัญชีสิทธิ์": [
    "คงเหลือตามบัญชีสิทธิ์",
    "ยอดคงเหลือตามบัญชีสิทธิ์",
    "บช.สิทธิ์",
    "บัญชีสิทธิ",
  ],
  "คงเหลือ": ["คงเหลือ"],
  "Gain": ["gain"],
  "หมายเหตุ": ["หมายเหตุ", "remark"],
};

/** Per-form canonical registry. CANON/KEYWORDS above are the DEFAULT (07-01). */
export const FORM_CANON: Record<string, string[]> = {
  "07_02": [
    "วันที่", "รายการ", "เลขที่", "ผลิตได้", "รับคืนคลังทัณฑ์บน", "รับอื่นๆ", "รวมรับ",
    "จำหน่ายในประเทศ", "จำหน่ายต่างประเทศ", "ใช้ในโรงอุตฯ", "คลังทัณฑ์บน(จ่าย)",
    "เสียหาย", "จ่ายอื่นๆ", "รวมจ่าย", "คงเหลือ", "หมายเหตุ",
  ],
  // 07-04: headers ARE material/product names — no canonical mapping
  "07_04": [],
  "03_07_attach": [
    "วันที่", "เนื้อน้ำมัน", "ไบโอดีเซล", "สารเติมแต่ง", "ปริมาณรวม สารเติมแต่ง",
    "อัตราภาษี สรรพสามิต", "อัตราภาษี สิทธิหักลดหย่อน", "ภาษี สรรพสามิต",
    "ค่าลดหย่อน ม.105", "คงเหลือภาษี นำส่ง", "คงเหลือภาษี ขอคืน", "ผลิตภัณฑ์",
  ],
  "03_07": [
    "ลำดับที่", "ประเภทที่", "ชื่อสินค้า", "แบบ/รุ่น ดีกรี/CO", "ขนาด",
    "ปริมาณที่เสียภาษี", "ราคาขายปลีก", "อัตราภาษี ตามมูลค่า", "อัตราภาษี ตามปริมาณ",
    "ภาษีต่อปริมาณ ตามมูลค่า", "ภาษีต่อปริมาณ ตามปริมาณ",
    "รวมภาษี สรรพสามิต (บาท)", "รวมภาษี สรรพสามิต (สต.)",
    "ภาษีเก็บเพิ่ม 10% (บาท)", "ภาษีเก็บเพิ่ม 10% (สต.)",
  ],
};

export const FORM_KEYWORDS: Record<string, Record<string, string[]>> = {
  "07_04": {},
  "07_02": {
    "วันที่": ["วัน", "เดือน", "ปี"],
    "รายการ": ["รายการ"],
    "เลขที่": ["หลักฐาน", "เลขที่", "เลข"],
    "ผลิตได้": ["ผลิตได้"],
    "รับคืนคลังทัณฑ์บน": ["รับคืนจากคลังสินค้าทัณฑ์บน", "รับคืน"],
    "รับอื่นๆ": ["อื่นๆ"],
    "รวมรับ": ["รวมรับ", "รวม รับ"],
    "จำหน่ายในประเทศ": ["จำหน่ายในประเทศ", "ขายในประเทศ"],
    "จำหน่ายต่างประเทศ": ["จำหน่ายต่างประเทศ", "ขายต่างประเทศ"],
    "ใช้ในโรงอุตฯ": ["ใช้ในโรงอุต", "โรงอุตสาหกรรม"],
    "คลังทัณฑ์บน(จ่าย)": ["คลังสินค้าทัณฑ์บน"],
    "เสียหาย": ["เสียหาย", "สูญ"],
    "จ่ายอื่นๆ": ["อื่นๆ"],
    "รวมจ่าย": ["รวมจ่าย", "รวม"],
    "คงเหลือ": ["คงเหลือ"],
    "หมายเหตุ": ["หมายเหตุ"],
  },
  "03_07_attach": {
    "วันที่": ["วัน", "เดือน", "ปี"],
    "เนื้อน้ำมัน": ["เนื้อน้ำมัน"],
    "ไบโอดีเซล": ["ไบโอดีเซล"],
    "สารเติมแต่ง": ["สารเติมแต่ง"],
    "ปริมาณรวม สารเติมแต่ง": ["ปริมาณรวม สารเติมแต่ง", "ปริมาณรวม สาร"],
    "อัตราภาษี สรรพสามิต": ["อัตราภาษี สรรพสามิต", "อัตราภาษีสรรพสามิต"],
    "อัตราภาษี สิทธิหักลดหย่อน": ["สิทธิหักลดหย่อน", "สิทธิ หักลดหย่อน"],
    "ภาษี สรรพสามิต": ["ภาษี สรรพสามิต"],
    "ค่าลดหย่อน ม.105": ["ลดหย่อน มาตรา 105", "ลดหย่อน ม.105", "ค่าลดหย่อน"],
    "คงเหลือภาษี นำส่ง": ["นำส่ง"],
    "คงเหลือภาษี ขอคืน": ["ขอคืน"],
  },
  "03_07": {
    "ลำดับที่": ["ที่"],
    "ประเภทที่": ["ประเภทที่"],
    "ชื่อสินค้า": ["ชื่อสินค้า"],
    "แบบ/รุ่น ดีกรี/CO": ["แบบ/รุ่น", "ดีกรี"],
    "ขนาด": ["ขนาด"],
    "ปริมาณที่เสียภาษี": ["ปริมาณสินค้าที่เสียภาษี", "ปริมาณที่เสียภาษี"],
    "ราคาขายปลีก": ["ราคาขายปลีก"],
    "อัตราภาษี ตามมูลค่า": ["อัตราภาษี_ตามมูลค่า"],
    "อัตราภาษี ตามปริมาณ": ["อัตราภาษี_ตามปริมาณ"],
    "ภาษีต่อปริมาณ ตามมูลค่า": ["ภาษีต่อปริมาณสินค้าทั้งหมด_ตามมูลค่า"],
    "ภาษีต่อปริมาณ ตามปริมาณ": ["ภาษีต่อปริมาณสินค้าทั้งหมด_ตามปริมาณ"],
    "รวมภาษี สรรพสามิต (บาท)": ["รวมภาษีสรรพสามิต_บาท"],
    "รวมภาษี สรรพสามิต (สต.)": ["รวมภาษีสรรพสามิต_สต"],
    "ภาษีเก็บเพิ่ม 10% (บาท)": ["ร้อยละ ๑๐_บาท", "ภาษีเก็บเพิ่ม"],
    "ภาษีเก็บเพิ่ม 10% (สต.)": ["ร้อยละ ๑๐_สต"],
  },
};

export const SUMMARY_0307_COLS = [
  "รายการ",
  "รวมภาษีสรรพสามิต_บาท",
  "รวมภาษีสรรพสามิต_สต.",
  "ภาษีเก็บเพิ่มเพื่อราชการส่วนท้องถิ่น ร้อยละ 10_บาท",
  "ภาษีเก็บเพิ่มเพื่อราชการส่วนท้องถิ่น ร้อยละ 10_สต.",
] as const;

export const SUMMARY_0307_LABELS = [
  "รวมภาษี",
  "หัก ลดหย่อนภาษี",
  "คงเหลือภาษี",
  "เบี้ยปรับ",
  "เงินเพิ่มร้อยละ ต่อเดือน",
  "รวม",
  "หัก คืนภาษี",
  "รวมทั้งสิ้น",
] as const;

/** 07-04 fixed row templates when OCR misses a table */
export const T0704 = {
  materials: {
    name: "งบวัตถุดิบ",
    first: "รายการ/ประเภทวัตถุดิบ(หน่วย)",
    extraCols: 12,
    rows: [
      "(๔) คงเหลือยกมา", "(๕) รับเดือนนี้", "(๖) รวม", "(๗) ผลิตสินค้าตามพิกัดฯ",
      "(๘) ผลิตสินค้าอื่น", "(๙) ส่วนขาด/ส่วนเกิน", "(๑๐) อื่น ๆ (จ่ายโอนคลัง)",
      "(๑๑) Loss/Gain", "(๑๒) คงเหลือยกไป",
    ],
  },
  products: {
    name: "งบการผลิต",
    first: "รายการ/ประเภทสินค้า(หน่วย)",
    extraCols: 10,
    rows: [
      "(๑๓) คงเหลือยกมา", "(๑๔) รับจากการผลิต", "(๑๕) รับคืนจากคลังสินค้าทัณฑ์บน",
      "(๑๖) อื่น ๆ", "(๑๗) รวม", "(๑๘) จำหน่ายในประเทศ", "(๑๙) จำหน่ายต่างประเทศ",
      "(๒๐) ใช้ในโรงอุตสาหกรรม", "(๒๑) คลังสินค้าทัณฑ์บน", "(๒๒) เสียหาย",
      "(๒๓) อื่น ๆ (จ่าย)", "(๒๔) คงเหลือยกไป",
    ],
  },
} as const;

/** Mutable user-added canonicals (beyond built-ins). Call loadExtraCanon() on boot. */
let extraCanon: string[] = [];

export function getExtraCanon(): string[] {
  return extraCanon;
}

export function setExtraCanon(next: string[]): void {
  extraCanon = next;
}

export function formKeyOf(ft: string | undefined | null): string {
  const s = (ft || "").replace(/ภส\./, "").replace(/[-\s]/g, "_").toLowerCase();
  if (s.startsWith("07_01")) return "07_01";
  if (s.startsWith("07_02")) return "07_02";
  if (s.startsWith("07_04")) return "07_04";
  if (s.includes("attach")) return "03_07_attach";
  if (s.startsWith("03_07")) return "03_07";
  return s || "unknown";
}

/** Built-in canon for this form (default = 07-01 CANON) */
export function formCanon(ft: string | undefined | null): string[] {
  return FORM_CANON[formKeyOf(ft)] || [...CANON];
}

export function formKeywords(ft: string | undefined | null): Record<string, string[]> {
  return FORM_KEYWORDS[formKeyOf(ft)] || KEYWORDS;
}

/** All options for a form = built-in + user extras */
export function canonFor(ft: string | undefined | null): string[] {
  return [...new Set([...formCanon(ft), ...extraCanon])];
}

export function allBuiltIn(): string[] {
  return [...new Set([...CANON, ...Object.values(FORM_CANON).flat()])];
}

export function isProductHeader(h: string | undefined | null): boolean {
  return /ผลิตสินค้าพิกัดอัตราภาษีสรรพสามิต/.test(h || "");
}

export function extractProduct(h: string | undefined | null): string {
  const m = (h || "").match(/ผลิตสินค้าพิกัดอัตราภาษีสรรพสามิต[\s_]+(.+)$/);
  return m && m[1] ? m[1].trim() : "";
}

/**
 * Readable product name for the ชื่อผลิตภัณฑ์ field.
 * Prefer extracted name from tax-rate header; else use OCR header text as-is.
 */
export function productNameFromHeader(h: string | undefined | null): string {
  const extracted = extractProduct(h);
  if (extracted) return extracted;
  const s = (h || "").trim();
  if (!s) return "";
  if (/^product$/i.test(s) || s === PRODUCT_CANON) return "";
  // Generic / non-product headers — don't use as a product name
  if (
    /^(วันที่|รายการ|เลขที่|B\/L|Outturn|หมายเหตุ|เสียหาย|อื่นๆ|รวมจ่าย|Gain)$/i.test(
      s,
    )
  ) {
    return "";
  }
  return s;
}

export function suggestCanon(h: string | undefined | null, ft: string | undefined | null): string {
  const s = (h || "").trim();
  if (!s) return "";
  if (isProductHeader(s)) return PRODUCT_CANON;
  const low = s.toLowerCase();
  const entries: [string, string[]][] = [
    ...Object.entries(formKeywords(ft)),
    ...extraCanon.map((c): [string, string[]] => [c, [c.toLowerCase()]]),
  ];
  let best = "";
  let bestScore = 0;
  for (const [can, kws] of entries) {
    let sc = 0;
    for (const k of kws) {
      if (low.includes(k)) sc += k.length;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = can;
    }
  }
  return normalizeCanon(best);
}

export function loadExtraCanon(
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage !== "undefined" ? localStorage : null,
): string[] {
  try {
    const a: unknown[] = JSON.parse(storage?.getItem(EXTRA_CANON_STORAGE_KEY) || "[]");
    const clean = a
      .map((c) => String(c))
      .filter((s) => !s.startsWith("ผลิต_") && !(CANON as readonly string[]).includes(s) && !isProductCanon(s) && !/^product/i.test(s));
    if (storage && clean.length !== a.length) {
      storage.setItem(EXTRA_CANON_STORAGE_KEY, JSON.stringify(clean));
    }
    extraCanon = clean;
    return clean;
  } catch {
    extraCanon = [];
    return [];
  }
}

export function saveExtraCanon(
  storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined" ? localStorage : null,
): void {
  try {
    storage?.setItem(EXTRA_CANON_STORAGE_KEY, JSON.stringify(extraCanon));
  } catch {
    /* quota — ignore */
  }
}

/** Push if not already present; persists when storage available */
export function addExtraCanon(name: string): boolean {
  const n = name.trim();
  if (!n || allBuiltIn().includes(n) || extraCanon.includes(n)) return false;
  extraCanon.push(n);
  saveExtraCanon();
  return true;
}

export function removeExtraCanon(name: string): boolean {
  const idx = extraCanon.indexOf(name);
  if (idx < 0) return false;
  extraCanon.splice(idx, 1);
  saveExtraCanon();
  return true;
}
