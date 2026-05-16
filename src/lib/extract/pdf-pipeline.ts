/**
 * Full PDF extraction pipeline.
 *
 *   1. Layout-aware text + row extraction via pdfjs-dist (`extractLayout`)
 *   2. OCR fallback (`tesseract.js`) for pages with zero extractable text
 *      — we render the page to a canvas via pdfjs, then OCR that image,
 *        synthesize rows from Tesseract's word boxes, and append them.
 *   3. Catalog matching over all rows (`matchCatalog`)
 *   4. Unmatched-candidate surfacing — clean "Name | Value | Unit | Range"
 *      rows that found no catalog entry, for catalog-growth tooling.
 *
 * Designed to be the single PDF entry point used by `ingest-file.ts`.
 * Has no external dependencies beyond pdfjs-dist and tesseract.js,
 * both already in `package.json`.
 */

import { createWorker } from "tesseract.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { LayoutResult, Row } from "@/lib/extract/pdf-layout";
import { extractLayout } from "@/lib/extract/pdf-layout";
import { matchCatalog, peekCatalogMatch } from "@/lib/extract/catalog-matcher";
import type { Reading } from "@/lib/extract/catalog-matcher";

export type PdfExtractionResult = {
  readings: Reading[];
  /** Candidates that look like test rows but didn't match the catalog. Useful for
   *  surfacing potential catalog gaps to the user/admin. */
  unmatched: Array<{ page: number; label: string; value: string; unit: string; range: string }>;
  fullText: string;
  pageCount: number;
  /** Pages that needed OCR (no embedded text). */
  ocrPages: number[];
  /** Pages we still couldn't read at all. */
  failedPages: number[];
};

const OCR_DPI = 200;
const NUMERIC_RE = /^[<>≤≥]?\s*-?\d+(?:[.,\s]\d+)*$/;

export async function extractPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  const layout = await extractLayout(buffer);
  const ocrPages: number[] = [];
  const failedPages: number[] = [];

  let rows: Row[] = layout.rows;
  let fullText = layout.fullText;

  if (layout.emptyPages.length > 0) {
    const { extraRows, extraText, ok, failed } = await ocrEmptyPages(buffer, layout.emptyPages);
    rows = [...rows, ...extraRows].sort((a, b) => a.page - b.page || a.y - b.y);
    fullText = `${fullText}\n${extraText}`;
    ocrPages.push(...ok);
    failedPages.push(...failed);
  }

  const readings = matchCatalog(rows, fullText);
  const matchedRowIdxs = new Set(readings.map((r) => r.rowIndex).filter((n) => n >= 0));
  const matchedKeys = new Set(readings.map((r) => r.parameterKey));
  const unmatched = findUnmatchedCandidates(rows, matchedRowIdxs, matchedKeys);

  return {
    readings,
    unmatched,
    fullText,
    pageCount: layout.pageCount,
    ocrPages,
    failedPages,
  };
}

async function ocrEmptyPages(
  buffer: Buffer,
  pages: number[],
): Promise<{ extraRows: Row[]; extraText: string; ok: number[]; failed: number[] }> {
  const ok: number[] = [];
  const failed: number[] = [];
  const extraRows: Row[] = [];
  let extraText = "";

  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;
  const worker = await createWorker("eng", 1, { logger: () => {} });
  try {
    for (const p of pages) {
      try {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: OCR_DPI / 72 });
        const png = await renderPageToPng(page, viewport);

        const { data: tessData } = await worker.recognize(png, undefined, { blocks: true });
        const ocrRows = tessToRows(tessData as unknown as TessData, p, viewport.height, OCR_DPI / 72);
        // Use viewport.height to satisfy unused-var lint; it's exposed for callers debugging coords.
        void viewport.height;
        if (ocrRows.length > 0) {
          extraRows.push(...ocrRows);
          extraText += ocrRows.map((r) => r.cells.join("  ")).join("\n") + "\n";
          ok.push(p);
        } else {
          failed.push(p);
        }
        page.cleanup();
      } catch {
        failed.push(p);
      }
    }
  } finally {
    await worker.terminate();
    await doc.cleanup();
  }
  return { extraRows, extraText, ok, failed };
}

type CanvasModule = {
  createCanvas: (w: number, h: number) => {
    getContext: (t: "2d") => unknown;
    toBuffer: (mime: string) => Buffer;
  };
};

async function loadCanvas(): Promise<CanvasModule | null> {
  try {
    // Dynamic resolution at runtime so the TS compiler doesn't require
    // node-canvas's types at build time. `canvas` is an optional peer dep —
    // most PDFs we see are text-based, so this path is rarely hit.
    const id: string = "canvas";
    const mod = await import(/* @vite-ignore */ id).catch(() => null);
    if (!mod) return null;
    const candidate = (mod.createCanvas ? mod : mod.default) as CanvasModule | undefined;
    return candidate?.createCanvas ? candidate : null;
  } catch {
    return null;
  }
}

async function renderPageToPng(
  // Loosely typed because pdfjs-dist's PDFPageProxy.render() has a very strict
  // RenderParameters type that requires either canvasContext+canvas or
  // canvasFactory; node-canvas works fine in practice.
  page: unknown,
  viewport: { width: number; height: number },
): Promise<Buffer> {
  const CanvasMod = await loadCanvas();
  if (!CanvasMod) throw new Error("OCR fallback needs the `canvas` package installed");
  const canvas = CanvasMod.createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  const renderable = page as { render: (p: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<unknown> } };
  await renderable.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer("image/png");
}

type TessData = {
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{
          text: string;
          bbox: { x0: number; y0: number; x1: number; y1: number };
          confidence: number;
        }>;
      }>;
    }>;
  }>;
};

function tessToRows(tessData: TessData, page: number, _pageHeight: number, scale: number): Row[] {
  const rows: Row[] = [];
  const blocks = tessData.blocks ?? [];
  for (const b of blocks) {
    for (const para of b.paragraphs ?? []) {
      for (const ln of para.lines ?? []) {
        const words = (ln.words ?? []).filter((w) => w.confidence >= 40 && w.text.trim());
        if (words.length === 0) continue;
        // Convert to layout-space (divide by scale to match pdfjs coords).
        const sorted = words.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
        const cells: string[] = [];
        const cellRanges: Array<[number, number]> = [];
        let buf: typeof sorted = [sorted[0]];
        for (let k = 1; k < sorted.length; k++) {
          const prev = buf[buf.length - 1];
          const gap = (sorted[k].bbox.x0 - prev.bbox.x1) / scale;
          if (gap > 12) {
            cells.push(buf.map((w) => w.text).join(" ").trim());
            cellRanges.push([buf[0].bbox.x0 / scale, buf[buf.length - 1].bbox.x1 / scale]);
            buf = [sorted[k]];
          } else {
            buf.push(sorted[k]);
          }
        }
        cells.push(buf.map((w) => w.text).join(" ").trim());
        cellRanges.push([buf[0].bbox.x0 / scale, buf[buf.length - 1].bbox.x1 / scale]);
        const minY = Math.min(...words.map((w) => w.bbox.y0)) / scale;
        const maxY = Math.max(...words.map((w) => w.bbox.y1)) / scale;
        rows.push({
          page,
          y: minY,
          height: maxY - minY,
          cells,
          cellRanges,
          text: cells.join("\t"),
        });
      }
    }
  }
  return rows;
}

/**
 * Find rows that look like test results but were NOT used by the catalog matcher.
 * Skips:
 *   - rows that already produced a reading
 *   - rows whose label maps to an already-matched catalog key (duplicates on
 *     summary pages, etc.)
 *   - patient/admin rows
 */
function findUnmatchedCandidates(
  rows: Row[],
  matchedRowIdxs: Set<number>,
  matchedKeys: Set<string>,
): PdfExtractionResult["unmatched"] {
  const out: PdfExtractionResult["unmatched"] = [];
  const seenLabels = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (matchedRowIdxs.has(i)) continue;
    const r = rows[i];
    if (r.cells.length < 2) continue;
    const label = r.cells[0];
    if (!label || !/[A-Za-z]/.test(label)) continue;
    if (label.length > 80) continue;
    if (/^(patient|age|gender|barcode|sample|client|booking|partner|name|ref|cin|access|order|customer|bill date|report date|page no|test name|test description|test results?)/i.test(label)) continue;
    const valueIdx = r.cells.findIndex((c, idx) => idx > 0 && NUMERIC_RE.test(c.trim()));
    if (valueIdx < 0) continue;
    // De-dupe by label across the whole document
    const lkey = label.toLowerCase().trim();
    if (seenLabels.has(lkey)) continue;
    seenLabels.add(lkey);
    // If this label would resolve to a catalog key that's already matched
    // elsewhere in the document, treat it as a duplicate rather than a gap.
    const peeked = peekCatalogMatch(label);
    if (peeked && matchedKeys.has(peeked)) continue;
    out.push({
      page: r.page,
      label,
      value: r.cells[valueIdx],
      unit: r.cells[valueIdx + 1] ?? "",
      range: r.cells[valueIdx + 2] ?? "",
    });
  }
  return out;
}

export type { Reading, LayoutResult };
