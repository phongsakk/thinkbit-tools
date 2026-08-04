/**
 * Type structure for ภส.07-01 read result.
 * Source of truth: docs/document-analysis/07-01.md
 */

export const FORM_0701_TYPE = "ภส.07-01" as const

export type Form0701Type = typeof FORM_0701_TYPE

/** A = short header; B = full numbered columns */
export type Form0701LayoutPattern = "A" | "B"

export type Form0701RowType = "opening" | "daily"

/** Where taxed product name came from */
export type Form0701ProductNameSource = "document" | "database"

/** Quantity unit — liters; temperature only when printed on the document */
export type Form0701Unit = {
  name: "ลิตร"
  /** Oil temperature at measurement (°F). null if not on the document. */
  temperature_f: number | null
}

export type Form0701Material = {
  /** ประเภทวัตถุดิบ */
  name: string
  /** ส่วนผสมหลัก / มีสัดส่วนมากสุดในผลิตภัณฑ์ */
  is_base: boolean
  unit: Form0701Unit
}

export type Form0701Header = {
  agency: string | null
  title: string | null
}

/** Opening row ยอดยกมา */
export type Form0701Opening = {
  label: "ยอดยกมา" | string
  /** Pattern A: single balance */
  balance: number | null
  /** Pattern B: stock balance */
  balance_stock: number | null
  /** Pattern B: account-rights balance */
  balance_account_rights: number | null
}

export type Form0701Receive = {
  /** Pattern A: combined inbound quantity */
  quantity_in: number | null
  /** Pattern B + base: from tax invoice (B/L) */
  bl: number | null
  /** Pattern B + base: measured on receipt (Outturn); generally ≠ bl */
  outturn: number | null
  /** ปริมาณสิทธิ์หักลดหย่อน */
  discount_rights: number | null
  /** อัตราภาษีสรรพสามิต */
  tax_rate: number | null
}

export type Form0701TaxedProduct = {
  name: string
  name_source: Form0701ProductNameSource
  quantity: number | null
}

export type Form0701Pay = {
  /** Repeatable taxed-product outputs */
  taxed_products: Form0701TaxedProduct[]
  other_product: number | null
  damaged: number | null
  other: number | null
  total_out: number | null
}

export type Form0701Balance = {
  /** Pattern A: single remaining quantity */
  quantity: number | null
  /** Pattern B: STOCK */
  stock: number | null
  /** Pattern B: ตามบัญชีสิทธิ์ */
  account_rights: number | null
}

export type Form0701Row = {
  row_type: Form0701RowType
  date: string | null
  description: string | null
  evidence_no: string | null
  receive: Form0701Receive
  pay: Form0701Pay
  balance: Form0701Balance
  remark: string | null
  /** ผลต่าง / Gain when separate from remark */
  gain: number | null
}

/** Full ภส.07-01 document read result */
export type Form0701Document = {
  form_type: Form0701Type
  layout_pattern: Form0701LayoutPattern
  material: Form0701Material
  header: Form0701Header
  /**
   * Sub-column names under ผลิตสินค้าพิกัด for this page.
   * Empty when the warehouse produces one product and omits names on the form.
   */
  taxed_product_columns: string[]
  opening: Form0701Opening | null
  rows: Form0701Row[]
}
