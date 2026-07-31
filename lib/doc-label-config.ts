/**
 * DOCXXXX → document wording for Cosmos explorer tree.
 * group `00` = standard pack (DOC0001–DOC0028)
 * group `01` = transport pack (DOC0101–DOC0131)
 */
export type DocLabelEntry = {
  /** Business section number from the document checklist */
  sectionId: number
  label: string
  group: "00" | "01"
}

export const DOC_LABELS: Record<string, DocLabelEntry> = {
  // --- group 00 ---
  DOC0001: {
    sectionId: 1,
    label: "หนังสือนำส่งเอกสารขอคืนภาษีสรรพสามิต",
    group: "00",
  },
  DOC0002: {
    sectionId: 2,
    label: "ตารางเปรียบเทียบปริมาณการจ่ายวัตถุดิบ… (ถ้ามี)",
    group: "00",
  },
  DOC0003: {
    sectionId: 3,
    label: "สูตรน้ำมัน → หนังสือตราครุฑ (subtitle 1)",
    group: "00",
  },
  DOC0004: {
    sectionId: 3,
    label: "สูตรน้ำมัน → ภ.ษ 01-29 (subtitle 2)",
    group: "00",
  },
  DOC0005: {
    sectionId: 3,
    label: "สูตรน้ำมัน → ภส.05-02 (subtitle 3)",
    group: "00",
  },
  DOC0006: {
    sectionId: 3,
    label: "สูตรน้ำมัน → ภส.05-02/1 (subtitle 4)",
    group: "00",
  },
  DOC0007: {
    sectionId: 4,
    label: "การเปลี่ยนแปลงสารเติมแต่ง (ถ้ามี)",
    group: "00",
  },
  DOC0008: {
    sectionId: 5,
    label: "รับรองการให้ความเห็นชอบการเติมสารเติมแต่ง (ถ้ามี)",
    group: "00",
  },
  DOC0009: { sectionId: 6, label: "แบบ ภส.07-01", group: "00" },
  DOC0010: { sectionId: 7, label: "แบบ ภส.07-02", group: "00" },
  DOC0011: { sectionId: 8, label: "แบบ ภส.03-07", group: "00" },
  DOC0012: { sectionId: 9, label: "เอกสารแนบแบบ ภส.03-07", group: "00" },
  DOC0013: { sectionId: 10, label: "แบบ ภส.07-04", group: "00" },
  DOC0014: {
    sectionId: 11,
    label: "แบบรายงานการใช้สารเติมแต่งในน้ำมัน (ถ้ามี)",
    group: "00",
  },
  DOC0015: {
    sectionId: 12,
    label: "ตารางเปรียบเทียบ ภส.07-01 / 07-02 / 03-07 (ถ้ามี)",
    group: "00",
  },
  DOC0016: {
    sectionId: 13,
    label: "บัญชีรับ-จ่ายน้ำมันที่ใช้เป็นวัตถุดิบ",
    group: "00",
  },
  DOC0017: { sectionId: 14, label: "ใบกำกับภาษี (โรงกลั่น)", group: "00" },
  DOC0018: {
    sectionId: 15,
    label: "ใบเสร็จ จากกรมศุลกากร (ถ้ามี)",
    group: "00",
  },
  DOC0019: { sectionId: 16, label: "0409 ใบขนขาเข้า (ถ้ามี)", group: "00" },
  DOC0020: { sectionId: 17, label: "Outturn Statement", group: "00" },
  DOC0021: {
    sectionId: 18,
    label: "ใบกำกับภาษี / ใบแจ้งหนี้ / ใบส่งของ / …",
    group: "00",
  },
  DOC0022: { sectionId: 19, label: "แบบ ภส.05-03", group: "00" },
  DOC0023: { sectionId: 20, label: "หนังสือหักคืน (ถ้ามี)", group: "00" },
  DOC0024: {
    sectionId: 21,
    label: "ใบรับรองการชำระภาษีสรรพสามิต (ถ้ามี)",
    group: "00",
  },
  DOC0025: {
    sectionId: 22,
    label: "สรุปรายการใบกำกับภาษีซื้อน้ำมัน (ถ้ามี)",
    group: "00",
  },
  DOC0026: {
    sectionId: 23,
    label: "สรุปการจ่ายภาษี จากโรงกลั่น (ถ้ามี)",
    group: "00",
  },
  DOC0027: {
    sectionId: 24,
    label: "ใบเสร็จรับเงินของส่วนราชการกรมสรรพสามิต (ถ้ามี)",
    group: "00",
  },
  DOC0028: {
    sectionId: 25,
    label: "ตารางเปรียบเทียบ ภส.05-03 กับ ภส.03-07 (ถ้ามี)",
    group: "00",
  },

  // --- group 01 (Transport) ---
  DOC0101: {
    sectionId: 26,
    label: "หนังสือนำส่งเอกสารขอคืนภาษีสรรพสามิต",
    group: "01",
  },
  DOC0102: {
    sectionId: 27,
    label: "ตารางเปรียบเทียบปริมาณการจ่ายวัตถุดิบ… (ถ้ามี)",
    group: "01",
  },
  DOC0103: {
    sectionId: 28,
    label: "สูตรน้ำมัน → หนังสือตราครุฑ",
    group: "01",
  },
  DOC0104: {
    sectionId: 28,
    label: "สูตรน้ำมัน → ภ.ษ 01-29",
    group: "01",
  },
  DOC0105: {
    sectionId: 28,
    label: "สูตรน้ำมัน → ภส.05-02",
    group: "01",
  },
  DOC0106: {
    sectionId: 28,
    label: "สูตรน้ำมัน → ภส.05-02/1",
    group: "01",
  },
  DOC0107: {
    sectionId: 29,
    label: "การเปลี่ยนแปลงสารเติมแต่ง (ถ้ามี)",
    group: "01",
  },
  DOC0108: {
    sectionId: 30,
    label: "รับรองการให้ความเห็นชอบการเติมสารเติมแต่ง (ถ้ามี)",
    group: "01",
  },
  DOC0109: { sectionId: 31, label: "แบบ ภส.07-01", group: "01" },
  DOC0110: { sectionId: 32, label: "แบบ ภส.07-02", group: "01" },
  DOC0111: { sectionId: 33, label: "แบบ ภส.03-07", group: "01" },
  DOC0112: { sectionId: 34, label: "เอกสารแนบแบบ ภส.03-07", group: "01" },
  DOC0113: { sectionId: 35, label: "แบบ ภส.07-04", group: "01" },
  DOC0114: {
    sectionId: 36,
    label: "แบบรายงานการใช้สารเติมแต่งในน้ำมัน (ถ้ามี)",
    group: "01",
  },
  DOC0115: {
    sectionId: 37,
    label: "ตารางเปรียบเทียบ ภส.07-01 / 07-02 / 03-07 (ถ้ามี)",
    group: "01",
  },
  DOC0116: {
    sectionId: 38,
    label: "บัญชีรับ-จ่ายน้ำมันที่ใช้เป็นวัตถุดิบ",
    group: "01",
  },
  DOC0117: {
    sectionId: 39,
    label: "ใบกำกับภาษี (โรงกลั่น) (ถ้ามี)",
    group: "01",
  },
  DOC0118: {
    sectionId: 40,
    label: "ใบเสร็จ จากกรมศุลกากร (ถ้ามี)",
    group: "01",
  },
  DOC0119: { sectionId: 41, label: "0409 ใบขนขาเข้า (ถ้ามี)", group: "01" },
  DOC0120: { sectionId: 42, label: "Outturn Statement (ถ้ามี)", group: "01" },
  DOC0121: {
    sectionId: 43,
    label: "ใบกำกับภาษี / ใบแจ้งหนี้ / ใบส่งของ / …",
    group: "01",
  },
  DOC0122: { sectionId: 44, label: "แบบ ภส.05-03", group: "01" },
  DOC0123: { sectionId: 45, label: "หนังสือหักคืน (ถ้ามี)", group: "01" },
  DOC0124: {
    sectionId: 46,
    label: "ใบรับรองการชำระภาษีสรรพสามิต (ถ้ามี)",
    group: "01",
  },
  DOC0125: {
    sectionId: 47,
    label: "สรุปรายการใบกำกับภาษีซื้อน้ำมัน (ถ้ามี)",
    group: "01",
  },
  DOC0126: {
    sectionId: 48,
    label: "สรุปการจ่ายภาษี จากโรงกลั่น (ถ้ามี)",
    group: "01",
  },
  DOC0127: {
    sectionId: 49,
    label: "จาก 3PL → Thappline (subtitle 1)",
    group: "01",
  },
  DOC0128: {
    sectionId: 49,
    label: "จาก 3PL → ปริมาณรับ Thappline (subtitle 2)",
    group: "01",
  },
  DOC0129: {
    sectionId: 49,
    label: "จาก 3PL → FPT (subtitle 3)",
    group: "01",
  },
  DOC0130: {
    sectionId: 49,
    label: "จาก 3PL → ปริมาณรับ FPT (subtitle 4)",
    group: "01",
  },
  DOC0131: {
    sectionId: 50,
    label: "ตารางเปรียบเทียบ ภส.05-03 กับ ภส.03-07 (ถ้ามี)",
    group: "01",
  },
}

export function normalizeDocId(docId: string): string {
  return docId.trim().toUpperCase()
}

export function getDocLabelEntry(docId: string): DocLabelEntry | null {
  return DOC_LABELS[normalizeDocId(docId)] ?? null
}

/** Human-readable wording; falls back to raw DOC id. */
export function getDocLabel(docId: string): string {
  return getDocLabelEntry(docId)?.label ?? docId
}

/** Tree display: `DOC0009 · แบบ ภส.07-01` */
export function formatDocTreeLabel(docId: string): string {
  const entry = getDocLabelEntry(docId)
  if (!entry) return docId
  return `${normalizeDocId(docId)} · ${entry.label}`
}

/** DOC ids for a pack group, ordered by checklist section then id. */
export function listDocIdsByGroup(group: "00" | "01"): string[] {
  return Object.entries(DOC_LABELS)
    .filter(([, entry]) => entry.group === group)
    .sort(([aId, a], [bId, b]) => {
      if (a.sectionId !== b.sectionId) return a.sectionId - b.sectionId
      return aId.localeCompare(bId, undefined, { numeric: true })
    })
    .map(([docId]) => docId)
}
