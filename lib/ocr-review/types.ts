/** OCR review core types — adapted from public/ocr-review.html */

export type RowKind = "data" | "carry" | "sum";

export type TableType0704 = "materials" | "products";

export interface Row {
  kind: RowKind;
  cells: string[];
  /** Present on carry/sum rows when parsed from keyed objects */
  label?: string;
}

export interface SummaryTable {
  columns: string[];
  rows: string[][];
}

export interface Section {
  formType: string;
  page: string;
  /** Numeric/source page when available (07-04 labeling) */
  pageNo?: string | number;
  oilType: string;
  branch: string;
  /** Raw information_keys from OCR (values may be string | {content}) */
  infoKeys: Record<string, unknown> | null;
  summaryTable: SummaryTable | null;
  summaryExtra: Record<string, string>;
  headers: string[];
  rows: Row[];
  /** 07-04: materials | products */
  tableType?: TableType0704;
  /** Index into fields.all_pages; null = template section OCR missed */
  apIdx?: number | null;
  /** Tax invoice: table_2 items + table_6 VAT + information_keys */
  isTaxInvoice?: boolean;
}

/** Nested cell edits: edits[si][ri][ci] = value */
export type CellEdits = Record<number, Record<number, Record<number, string>>>;

/** infoEdits[si][key] = value (summary extras use key `summary_${k}`) */
export type InfoEdits = Record<number, Record<string, string>>;

/** summaryEdits[si][ri][ci] = value */
export type SummaryEdits = Record<number, Record<number, Record<number, string>>>;

export interface PageMeta {
  oilType?: string;
  continuationOf?: string;
  /** Forced receive cols were inserted/seeded — treat as dirty until save */
  structureDirty?: boolean;
}

export interface FileState {
  cur: Section[];
  sourceName: string;
  /** colMap[si][ci] = canonical name or "" */
  colMap: string[][];
  /**
   * displayOrder[si] = column indices in UI order
   * (identity → receive → pay → …; data arrays stay in OCR order)
   */
  displayOrder: number[][];
  edits: CellEdits;
  pageMeta: Record<number, PageMeta>;
  /** prodName[si][ci] when canonical === "product" */
  prodName: Record<number, Record<number, string>>;
  /** AI-cleaned / 07-04 edited headers: headerClean[si][ci] */
  headerClean: Record<number, Record<number, string>>;
  /** Full Cosmos docs parallel to sections (same length as cur) */
  rawDocs: CosmosDoc[];
  /** Keys `${si}:${ri}` */
  deletedRows: Set<string>;
  /** Keys `${si}:${ci}` */
  deletedCols: Set<string>;
  infoEdits: InfoEdits;
  summaryEdits: SummaryEdits;
  summaryColMap: Record<number, unknown>;
}

/** Minimal Cosmos document shape used by load/save/rebuild */
export interface CosmosDoc {
  id: string;
  fields?: Record<string, unknown>;
  fields_original?: Record<string, unknown>;
  blobFileName?: string;
  plainOriginalFileName?: string;
  docType?: string;
  pageNumber?: number | string;
  [key: string]: unknown;
}

export interface RebuildContext {
  cur: Section[];
  rawDocs: CosmosDoc[];
  colMap: string[][];
  /** Optional UI column index order; falls back to natural order */
  displayOrder?: number[][];
  edits: CellEdits;
  deletedRows: Set<string>;
  deletedCols: Set<string>;
  pageMeta: Record<number, PageMeta>;
  prodName: Record<number, Record<number, string>>;
  headerClean: Record<number, Record<number, string>>;
  infoEdits: InfoEdits;
  summaryEdits: SummaryEdits;
}

export function createEmptyFileState(): FileState {
  return {
    cur: [],
    sourceName: "",
    colMap: [],
    displayOrder: [],
    edits: {},
    pageMeta: {},
    prodName: {},
    headerClean: {},
    rawDocs: [],
    deletedRows: new Set(),
    deletedCols: new Set(),
    infoEdits: {},
    summaryEdits: {},
    summaryColMap: {},
  };
}
