/** Client fetch helpers for /api/ocr-review/* routes */

import type { CosmosDoc } from "./types";

export type HealthResponse = {
  ok: boolean;
  base?: string;
  upstreamStatus?: number;
  error?: string;
};

export type GroupResponse = {
  items: CosmosDoc[];
  count: number;
};

export type AiMapResponse = {
  mapping: Record<string, string>;
  products: Record<string, string>;
  headerClean: Record<string, string>;
  error?: string;
};

export type CorrectedResponse = {
  item: CosmosDoc;
  source: "corrected" | "original";
};

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data && data.error
        ? String(data.error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/** GET /api/ocr-review/health */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/ocr-review/health", { cache: "no-store" });
  return readJson<HealthResponse>(res);
}

/** GET /api/ocr-review/cosmos/group/:documentGroup — items have `fields` for parseData */
export async function fetchGroup(dg: string): Promise<GroupResponse> {
  const res = await fetch(
    `/api/ocr-review/cosmos/group/${encodeURIComponent(dg)}`,
    { cache: "no-store" },
  );
  return readJson<GroupResponse>(res);
}

/** GET /api/ocr-review/blob?name= — returns PDF bytes */
export async function fetchBlob(name: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `/api/ocr-review/blob?name=${encodeURIComponent(name)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) message = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.arrayBuffer();
}

/** POST /api/ocr-review/ai-map */
export async function postAiMap(body: {
  headers: string[];
  canonical: string[];
  pdf?: string;
}): Promise<AiMapResponse> {
  const res = await fetch("/api/ocr-review/ai-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<AiMapResponse>(res);
}

/** PUT /api/ocr-review/cosmos/id/:id — save corrected Cosmos doc */
export async function putCorrected(
  id: string,
  doc: unknown,
): Promise<CorrectedResponse> {
  const res = await fetch(
    `/api/ocr-review/cosmos/id/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    },
  );
  return readJson<CorrectedResponse>(res);
}

/** POST /api/ocr-review/reocr — re-run OCR from blob */
export async function postReocr(
  blobFileName: string,
  filename?: string,
): Promise<unknown> {
  const qs = new URLSearchParams({ blobFileName });
  if (filename) qs.set("filename", filename);
  const res = await fetch(`/api/ocr-review/reocr?${qs.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobFileName, filename }),
  });
  return readJson<unknown>(res);
}
