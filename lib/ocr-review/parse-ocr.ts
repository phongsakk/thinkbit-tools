/** parseData + table picking — from ocr-review.html L357–528 */

import { T0704 } from "./canon";
import type { Row, Section, SummaryTable, TableType0704 } from "./types";

export function cellText(c: unknown): string {
  if (c == null) return "";
  if (typeof c === "object") {
    const o = c as { content?: unknown };
    return o.content != null ? String(o.content) : "";
  }
  return String(c);
}

/** Strip leading Thai-numeral prefix like "(๑๓) " or "(๔) " */
export function stripThaiNumPrefix(s: unknown): string {
  return String(s == null ? "" : s).replace(/^\(\s*[๐-๙]+\s*\)\s*/, "");
}

export function isNum(s: string | undefined | null): boolean {
  if (!s || s === "-") return false;
  return /^[0-9.,]+$/.test(s.trim());
}

export function tableType0704(d: Record<string, unknown> | null | undefined): TableType0704 | null {
  const td = d?.table_detail as { table_type?: unknown } | undefined;
  const tt = cellText(td?.table_type).toLowerCase();
  if (tt.includes("material")) return "materials";
  if (tt.includes("product")) return "products";
  return null;
}

export function getPages(doc: Record<string, unknown>): unknown[] {
  const result = doc.result as { results?: unknown } | undefined;
  const r = result?.results;
  if (Array.isArray(r)) return r;
  if (r && typeof r === "object") {
    return Object.keys(r as object)
      .sort((a, b) => +a - +b)
      .map((k) => (r as Record<string, unknown>)[k]);
  }
  return [];
}

export function pickTable(d: Record<string, unknown>): unknown {
  const td = d.table_detail as { rows?: unknown[]; columns?: unknown } | undefined;
  if (td && td.rows && td.rows.length > 0) return td;
  if (td && td.columns && !td.rows) return td;
  // tax-invoice: table_2 = Product List
  const t2 = d.table_2 as { rows?: unknown[] } | undefined;
  if (t2 && t2.rows && t2.rows.length > 0) return t2;
  return d.table_1 || d.table || d.detail_table || d.detail_table_1 || null;
}

export function pickTable2(d: Record<string, unknown>): unknown {
  return d.detail_table_2 || d.table_2 || null;
}

function emptySection(partial: Partial<Section> & Pick<Section, "formType" | "page" | "headers" | "rows">): Section {
  return {
    oilType: "",
    branch: "",
    infoKeys: null,
    summaryTable: null,
    summaryExtra: {},
    ...partial,
  };
}

export function parseData(raw: Record<string, unknown>): Section[] {
  const sections: Section[] = [];
  let docs: Record<string, unknown>[] | null = (raw.documents as Record<string, unknown>[] | undefined) ?? null;

  if (!docs) {
    const rawFt = cellText(raw.form_type);
    if (/07[-_]?04/.test(rawFt) && Array.isArray(raw.all_pages) && raw.all_pages.length) {
      // 07-04: all_pages has one entry PER TABLE
      docs = [
        {
          result: { results: raw.all_pages },
          form_type: rawFt,
          source_pages: (raw.all_pages as Record<string, unknown>[]).map(
            (p) => raw.pageNumber ?? p.page_number ?? "",
          ),
        },
      ];
    } else if (Array.isArray(raw.results)) {
      docs = [{ result: { results: raw.results } }];
    } else if (raw.table_detail || raw.table || raw.table_1) {
      // flat page-data (e.g. Cosmos doc.fields)
      docs = [
        {
          data: raw,
          form_type: raw.form_type,
          source_pages: [raw.pageNumber || raw.page_number || ""],
        },
      ];
    } else {
      docs = [raw];
    }
  }

  docs.forEach((doc) => {
    const result = doc.result as { form_type?: unknown; source_pages?: unknown[]; results?: unknown } | undefined;
    const ft = String(doc.form_type || result?.form_type || "?");
    const src: unknown[] = (doc.source_pages as unknown[]) || result?.source_pages || [];
    const seen0704: Record<TableType0704, boolean> = { materials: false, products: false };
    let pages = getPages(doc);
    if (pages.length === 0 && doc.data) pages = [doc];

    pages.forEach((page, i) => {
      const pageObj = page as Record<string, unknown>;
      const data = (pageObj.data || pageObj) as Record<string, unknown>;

      // 07-04 structured: {materials:[...], products:[...]}
      if (Array.isArray(data.materials) || Array.isArray(data.products)) {
        const matLabels: Record<string, string> = {
          materialName: "ชื่อวัตถุดิบ", open: "คงเหลือยกมา", getted: "รับเข้า", produce: "ผลิต",
          purchase: "ซื้อ", importIn: "นำเข้า", total: "รวมรับ", use: "ใช้ในการผลิต",
          distribute: "จ่ายออก", loss: "สูญเสีย/อื่นๆ", remain: "คงเหลือยกไป", materialId: "material_id",
        };
        const prodLabels: Record<string, string> = {
          productName: "ชื่อสินค้า", productId: "product_id", open: "คงเหลือยกมา", produced: "ผลิตได้",
          bondedReturn: "รับคืนทัณฑ์บน", otherReceive: "รับอื่นๆ", totalReceive: "รวมรับ",
          distributed: "จำหน่าย", otherDistribute: "จ่ายอื่นๆ", loss: "สูญเสีย",
          bondedOut: "ส่งออกทัณฑ์บน", remain: "คงเหลือยกไป",
        };
        const toTable = (
          arr: Record<string, unknown>[] | undefined,
          labels: Record<string, string>,
        ): { headers: string[]; rows: Row[] } | null => {
          if (!arr || !arr.length) return null;
          const keys = Object.keys(arr[0]);
          const h = keys.map((k) => labels[k] || k);
          const r: Row[] = arr.map((item) => ({
            kind: "data",
            cells: keys.map((k) => {
              const v = item[k];
              return v == null ? "" : String(v);
            }),
          }));
          return { headers: h, rows: r };
        };
        const matTable = toTable(data.materials as Record<string, unknown>[], matLabels);
        const prodTable = toTable(data.products as Record<string, unknown>[], prodLabels);
        const pageBase = src[i] != null ? String(src[i]) : "?" + i;

        if (prodTable) {
          const ml = Math.max(prodTable.headers.length, ...prodTable.rows.map((r) => r.cells.length));
          while (prodTable.headers.length < ml) prodTable.headers.push("");
          prodTable.rows.forEach((r) => {
            while (r.cells.length < ml) r.cells.push("");
          });
          sections.push(
            emptySection({
              formType: ft,
              page: pageBase + " (งบสินค้า)",
              headers: prodTable.headers,
              rows: prodTable.rows,
            }),
          );
        }
        if (matTable) {
          const ml2 = Math.max(matTable.headers.length, ...matTable.rows.map((r) => r.cells.length));
          while (matTable.headers.length < ml2) matTable.headers.push("");
          matTable.rows.forEach((r) => {
            while (r.cells.length < ml2) r.cells.push("");
          });
          sections.push(
            emptySection({
              formType: ft,
              page: pageBase + " (งบวัตถุดิบ)",
              headers: matTable.headers,
              rows: matTable.rows,
            }),
          );
        }
        if (!matTable && !prodTable) {
          sections.push(
            emptySection({
              formType: ft,
              page: pageBase,
              headers: ["คอลัมน์ 1"],
              rows: [],
            }),
          );
        }
        return;
      }

      const tbl = pickTable(data) as
        | { columns?: unknown[]; rows?: unknown[]; properties?: unknown }
        | unknown[]
        | null;
      let headers: string[];
      let rows: Row[] = [];

      if (!tbl) {
        headers = ["คอลัมน์ 1", "คอลัมน์ 2", "คอลัมน์ 3", "คอลัมน์ 4"];
      } else if (Array.isArray(tbl) && (tbl[0] as { properties?: unknown })?.properties) {
        // old format: array of {properties: {column_N: {value}}}
        const arr = tbl as { properties?: Record<string, { value?: unknown }> }[];
        const numCols = Math.max(...arr.map((r) => (r?.properties ? Object.keys(r.properties).length : 0)));
        arr.forEach((r) => {
          if (!r?.properties) return;
          const cells: string[] = [];
          for (let c = 1; c <= numCols; c++) {
            cells.push(cellText(r.properties["column_" + c]?.value ?? ""));
          }
          rows.push({ kind: "data", cells });
        });
        headers = rows[0]?.cells || Array(numCols).fill("");
      } else {
        const t = tbl as { columns?: unknown[]; rows?: unknown[] };
        headers = (t.columns || []).map(cellText);
        const carry = data.carry_forward_rows as Record<string, unknown> | undefined;
        if (carry) {
          for (const [k, c] of Object.entries(carry)) {
            if (Array.isArray(c)) rows.push({ kind: "carry", label: k, cells: c.map(cellText) });
          }
        }
        (t.rows || []).forEach((c) => {
          if (Array.isArray(c)) rows.push({ kind: "data", cells: c.map(cellText) });
        });
        const summaryRows = data.summary_rows as Record<string, unknown> | undefined;
        if (summaryRows) {
          if (!(summaryRows.columns && summaryRows.rows)) {
            for (const [k, c] of Object.entries(summaryRows)) {
              if (Array.isArray(c)) rows.push({ kind: "sum", label: k, cells: c.map(cellText) });
            }
          }
        }
      }

      let summaryTable: SummaryTable | null = null;
      const summaryExtra: Record<string, string> = {};
      if (data.summary_rows) {
        const sr = data.summary_rows as Record<string, unknown>;
        if (sr.columns && sr.rows) {
          summaryTable = {
            columns: (sr.columns as unknown[]).map(cellText),
            rows: (sr.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(cellText) : [])),
          };
          for (const [k, v] of Object.entries(sr)) {
            if (k !== "columns" && k !== "rows") summaryExtra[k] = cellText(v);
          }
        } else {
          for (const [k, c] of Object.entries(sr)) {
            if (Array.isArray(c)) rows.push({ kind: "sum", label: k, cells: c.map(cellText) });
          }
        }
      }
      // tax-invoice: table_6 = VAT Summary
      const t6 = data.table_6 as { columns?: unknown[]; rows?: unknown[] } | undefined;
      if (!summaryTable && t6 && t6.rows && t6.rows.length) {
        summaryTable = {
          columns: (t6.columns || []).map(cellText),
          rows: (t6.rows || []).map((r) => (Array.isArray(r) ? r.map(cellText) : [])),
        };
      }

      const is0704 = /07[-_]?04/.test(String(ft));
      const tt = is0704 ? tableType0704(data) : null;
      if (tt) seen0704[tt] = true;

      // legacy 07-04: detail_table_2 products as separate section
      const tbl2 = pickTable2(data);
      if (is0704 && !tt && Array.isArray(tbl2) && (tbl2[0] as { properties?: unknown })?.properties) {
        const arr2 = tbl2 as { properties?: Record<string, { value?: unknown }> }[];
        const nc2 = Math.max(...arr2.map((r) => (r?.properties ? Object.keys(r.properties).length : 0)));
        const r2: Row[] = [];
        arr2.forEach((r) => {
          if (!r?.properties) return;
          const cs: string[] = [];
          for (let c = 1; c <= nc2; c++) cs.push(cellText(r.properties["column_" + c]?.value ?? ""));
          r2.push({ kind: "data", cells: cs });
        });
        const h2 = r2[0]?.cells || Array(nc2).fill("");
        sections.push(
          emptySection({
            formType: ft,
            page: (src[i] != null ? String(src[i]) : "?" + i) + " (งบการผลิต)",
            headers: h2,
            rows: r2,
          }),
        );
      }

      const pageNo = src[i] != null ? (src[i] as string | number) : "?" + i;
      const pageLabel = String(pageNo) + (tt ? ` (${T0704[tt].name})` : "");
      const isTaxInvoice = !!(
        (data.table_2 as { rows?: unknown[] } | undefined)?.rows?.length && data.information_keys
      );
      const maxLen = Math.max(headers.length, ...rows.map((r) => r.cells.length), 0);
      while (headers.length < maxLen) headers.push("");
      rows.forEach((r) => {
        while (r.cells.length < maxLen) r.cells.push("");
      });
      if (tt) {
        rows.forEach((r) => {
          if (r.cells[0] != null && r.cells[0] !== "") r.cells[0] = stripThaiNumPrefix(r.cells[0]);
        });
      }

      sections.push({
        formType: ft,
        page: pageLabel,
        pageNo,
        oilType: cellText(data.oil_type),
        branch: cellText(data.branch),
        infoKeys: (data.information_keys as Record<string, unknown>) || null,
        summaryTable,
        summaryExtra,
        headers,
        rows,
        tableType: tt || undefined,
        apIdx: tt ? i : undefined,
        isTaxInvoice: isTaxInvoice || undefined,
      });
    });

    // 07-04: add empty template for missing table
    if (/07[-_]?04/.test(String(ft)) && (seen0704.materials || seen0704.products)) {
      for (const k of ["materials", "products"] as const) {
        if (seen0704[k]) continue;
        const t = T0704[k];
        const headers = [t.first, ...Array(t.extraCols).fill("")];
        const rows: Row[] = t.rows.map((l) => ({
          kind: "data",
          cells: [stripThaiNumPrefix(l), ...Array(t.extraCols).fill("")],
        }));
        sections.push({
          formType: ft,
          page: `(${t.name} — OCR ไม่เจอ เติมเอง)`,
          pageNo: src[0] != null ? (src[0] as string | number) : "",
          oilType: "",
          branch: "",
          infoKeys: null,
          summaryTable: null,
          summaryExtra: {},
          headers,
          rows,
          tableType: k,
          apIdx: null,
        });
      }
    }
  });

  // inherit product_name across attach pages
  const firstPn = sections.find((s) => s.infoKeys?.product_name)?.infoKeys?.product_name;
  if (firstPn) {
    for (const s of sections) {
      if (!s.infoKeys) s.infoKeys = {};
      if (!s.infoKeys.product_name) s.infoKeys.product_name = firstPn;
    }
  }
  return sections;
}
