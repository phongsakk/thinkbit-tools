/** rebuildFields — save corrected section state back into a Cosmos doc.
 *  Source: ocr-review.html L1227–1395
 *
 *  Pass ctx instead of relying on HTML globals (cur/rawDocs/edits/…).
 *  Pass docIn from a previous call to ACCUMULATE 07-04 sections into one doc.
 */

import { SUMMARY_0307_COLS, SUMMARY_0307_LABELS, isProductCanon, normalizeCanon } from "./canon";
import { cellText } from "./parse-ocr";
import type { CosmosDoc, RebuildContext, Section } from "./types";

export function is0307Main(sec: Section | undefined): boolean {
  const ft = (sec?.formType || "").replace("_", "-").toLowerCase();
  return ft.includes("03-07") && !ft.includes("attach");
}

export function rebuildFields(si: number, ctx: RebuildContext, docIn?: CosmosDoc | null): CosmosDoc {
  const {
    cur, rawDocs, colMap, displayOrder, edits, deletedRows, deletedCols,
    pageMeta, prodName, headerClean, infoEdits, summaryEdits,
  } = ctx;

  const doc: CosmosDoc = docIn || JSON.parse(JSON.stringify(rawDocs[si]));
  const base = (doc.fields || (doc.fields = {})) as Record<string, unknown>;

  if (!doc.fields_original) {
    doc.fields_original = JSON.parse(JSON.stringify(base));
  }

  const sec = cur[si];
  const n = sec.headers.length;
  const order =
    displayOrder?.[si]?.length
      ? displayOrder[si].filter((ci) => ci >= 0 && ci < n)
      : sec.headers.map((_, ci) => ci);
  const seen = new Set(order);
  const ordered = [...order];
  for (let ci = 0; ci < n; ci++) {
    if (!seen.has(ci)) ordered.push(ci);
  }
  const visCols = ordered.filter((ci) => !deletedCols.has(si + ":" + ci));

  const cellVal = (ri: number, ci: number): string => {
    const ed = edits[si]?.[ri]?.[ci];
    return String(ed != null ? ed : (sec.rows[ri]?.cells?.[ci] ?? ""));
  };
  const rowCells = (ri: number) => visCols.map((ci) => ({ content: cellVal(ri, ci) }));

  // columns must be plain strings (NOT {content:...})
  const columns = visCols.map((ci) => {
    const mapped = normalizeCanon(colMap[si]?.[ci]);
    if (mapped) {
      if (isProductCanon(mapped)) return prodName[si]?.[ci] || sec.headers[ci] || "ผลิตภัณฑ์";
      return mapped;
    }
    return String(headerClean[si]?.[ci] || sec.headers[ci] || "");
  });

  const dataRows: { content: string }[][] = [];
  const carry: Record<string, { content: string }[]> = {};
  const summ: Record<string, { content: string }[]> = {};

  sec.rows.forEach((r, ri) => {
    if (deletedRows.has(si + ":" + ri)) return;
    const cells = rowCells(ri);
    if (r.kind === "carry") carry[r.label || "ยอดยกมา"] = cells;
    else if (r.kind === "sum") summ[r.label || "รวม"] = cells;
    else dataRows.push(cells);
  });

  const applyTo = (target: Record<string, unknown>) => {
    const tk = target.table_detail
      ? "table_detail"
      : target.table_2
        ? "table_2"
        : target.table
          ? "table"
          : target.table_1
            ? "table_1"
            : null;
    if (tk) target[tk] = { columns, rows: dataRows };
    if (Object.keys(carry).length) target.carry_forward_rows = carry;
    if (Object.keys(summ).length) target.summary_rows = summ;
    if (pageMeta[si]?.oilType != null) target.oil_type = pageMeta[si].oilType;

    if (infoEdits[si]) {
      if (!target.information_keys) target.information_keys = {};
      const ik = target.information_keys as Record<string, unknown>;
      for (const [k, v] of Object.entries(infoEdits[si])) {
        const realKey = k.startsWith("summary_") ? k.slice(8) : k;
        if (k.startsWith("summary_")) {
          if (!target.summary_rows) target.summary_rows = {};
          const sr = target.summary_rows as Record<string, unknown>;
          if (sr[realKey] && typeof sr[realKey] === "object") {
            (sr[realKey] as { content: string }).content = v;
          } else {
            sr[realKey] = { content: v };
          }
        } else {
          if (ik[realKey] && typeof ik[realKey] === "object") {
            (ik[realKey] as { content: string }).content = v;
          } else {
            ik[realKey] = { content: v };
          }
        }
      }
    }

    const is0307 = is0307Main(cur[si]);
    if (is0307) {
      const cols = SUMMARY_0307_COLS.map((c) => ({ content: c }));
      const rows = SUMMARY_0307_LABELS.map((label, sri) => {
        const ocrRow = cur[si]?.summaryTable?.rows?.[sri] || [];
        return SUMMARY_0307_COLS.map((_, ci) => {
          const ed = summaryEdits[si]?.[sri]?.[ci];
          const ocrVal = ocrRow[ci] || "";
          return { content: ed != null ? ed : ci === 0 ? label : ocrVal };
        });
      });
      target.summary_rows = { columns: cols, rows };
      if (cur[si]?.summaryExtra) {
        const sr = target.summary_rows as Record<string, unknown>;
        for (const [k, v] of Object.entries(cur[si].summaryExtra)) {
          const ed = infoEdits[si]?.["summary_" + k];
          sr[k] = { content: ed != null ? ed : cellText(v) };
        }
      }
    } else if (summaryEdits[si] && target.summary_rows && (target.summary_rows as { rows?: unknown }).rows) {
      const srRows = (target.summary_rows as { rows: unknown[][] }).rows;
      for (const [ri, cols] of Object.entries(summaryEdits[si])) {
        const r = srRows[+ri];
        if (!r) continue;
        for (const [ci, val] of Object.entries(cols)) {
          if (r[+ci] && typeof r[+ci] === "object") (r[+ci] as { content: string }).content = val;
          else r[+ci] = { content: val };
        }
      }
    }

    // tax-invoice: summary edits → table_6
    if (summaryEdits[si] && target.table_6 && (target.table_6 as { rows?: unknown }).rows) {
      const t6rows = (target.table_6 as { rows: unknown[][] }).rows;
      for (const [ri, cols] of Object.entries(summaryEdits[si])) {
        const r = t6rows[+ri];
        if (!r) continue;
        for (const [ci, val] of Object.entries(cols)) {
          if (r[+ci] && typeof r[+ci] === "object") (r[+ci] as { content: string }).content = val;
          else r[+ci] = { content: val };
        }
      }
    }
  };

  // ---- 07-04 branch ----
  if (sec.tableType) {
    const cols0704 = visCols.map((ci) => String(headerClean[si]?.[ci] || sec.headers[ci] || ""));
    const ap = Array.isArray(base.all_pages)
      ? (base.all_pages as Record<string, unknown>[])
      : ((base.all_pages = []) as Record<string, unknown>[]);
    let entry: Record<string, unknown>
    if (sec.apIdx != null && ap[sec.apIdx]) {
      entry = ap[sec.apIdx]!
    } else {
      entry = ap[0] ? (JSON.parse(JSON.stringify(ap[0])) as Record<string, unknown>) : {}
      delete entry.table_detail
      delete entry.summary_rows
      delete entry.carry_forward_rows
      ap.push(entry)
    }
    const existingTt = (entry.table_detail as { table_type?: unknown } | undefined)?.table_type
    entry.table_detail = {
      table_type: existingTt || { content: sec.tableType },
      columns: cols0704,
      rows: dataRows,
    }
    if (Object.keys(carry).length) entry.carry_forward_rows = carry
    if (Object.keys(summ).length) entry.summary_rows = summ
    if (sec.tableType === "products") {
      const baseTt = (base.table_detail as { table_type?: unknown } | undefined)?.table_type
      base.table_detail = {
        table_type: baseTt || { content: "products" },
        columns: cols0704,
        rows: dataRows,
      }
    }
    doc.fields = base
    return doc
  }

  // ---- tax-invoice branch ----
  if (sec.isTaxInvoice) {
    base.table_2 = { columns, rows: dataRows };
    if (sec.summaryTable) {
      const sCols = sec.summaryTable.columns.map((c) => ({ content: c }));
      const sRows = sec.summaryTable.rows.map((r, ri) => {
        const cells = Array.isArray(r) ? r : [];
        return cells.map((orig, ci) => {
          const ed = summaryEdits[si]?.[ri]?.[ci];
          return {
            content:
              ed != null
                ? ed
                : typeof orig === "object"
                  ? String((orig as { content?: unknown }).content ?? "")
                  : String(orig || ""),
          };
        });
      });
      base.table_6 = { columns: sCols, rows: sRows };
    }
    if (infoEdits[si]) {
      if (!base.information_keys) base.information_keys = {};
      const ik = base.information_keys as Record<string, unknown>;
      for (const [k, v] of Object.entries(infoEdits[si])) {
        if (ik[k] && typeof ik[k] === "object") (ik[k] as { content: string }).content = v;
        else ik[k] = { content: v };
      }
    }
    if (Array.isArray(base.all_pages)) {
      (base.all_pages as Record<string, unknown>[]).forEach((p) => {
        p.table_2 = base.table_2;
        p.table_6 = base.table_6;
        p.information_keys = base.information_keys;
      });
    }
    doc.fields = base;
    return doc;
  }

  // ---- generic (07-01, 07-02, 03-07, attach, …) ----
  applyTo(base);
  if (Array.isArray(base.all_pages)) {
    (base.all_pages as Record<string, unknown>[]).forEach((p) =>
      applyTo((p.data || p) as Record<string, unknown>),
    );
  }

  // inherit product_name for 0307-attach
  const ftStr = cur[si]?.formType || "";
  if (ftStr.replace("_", "-").includes("attach") || ftStr.includes("formular")) {
    const pnKey = "product_name";
    const ik = base.information_keys as Record<string, unknown> | undefined;
    let pn = ik?.[pnKey];
    let pnVal = pn ? (typeof pn === "object" ? cellText(pn) : String(pn)) : "";
    if (!pnVal) {
      for (let j = 0; j < cur.length; j++) {
        if (j === si) continue;
        const other = cur[j]?.infoKeys?.[pnKey];
        const otherVal = other ? cellText(other) : "";
        if (otherVal) {
          pnVal = otherVal;
          break;
        }
      }
      if (pnVal) {
        if (!base.information_keys) base.information_keys = {};
        (base.information_keys as Record<string, unknown>)[pnKey] = { content: pnVal };
      }
    }
  }

  doc.fields = base;
  return doc;
}
