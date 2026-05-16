/**
 * Layout-aware PDF extraction using pdfjs-dist.
 *
 * We use pdfjs-dist's word-level positions rather than a flat text dump
 * because lab reports lay out data in columns. Column-aware reconstruction
 * is the only way to keep the Test Name | Value | Unit | Reference Range
 * relationship intact.
 *
 * Output:
 *  - rows: a sequence of logical rows. Each row carries its cells (column-clustered
 *    by horizontal gaps) plus metadata (page, y, font size).
 *  - fullText: pretty-printed reconstruction (for date extraction, debugging,
 *    and a plain-text fallback pass).
 */

// pdfjs-dist v4+ ships ESM by default; the legacy build works in Node without a worker.
import "./polyfill";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type Word = {
  text: string;
  x: number;        // left
  y: number;        // top, page-coord (y=0 is page top after flipping)
  width: number;
  height: number;
  fontHeight: number;
  page: number;
};

export type Row = {
  page: number;
  y: number;
  height: number;
  cells: string[];        // grouped by horizontal gap clustering
  cellRanges: Array<[number, number]>;  // [x0, x1] of each cell, parallel to cells[]
  text: string;           // tab-joined cell text (for human-readable debugging)
};

const ROW_TOL = 3;              // points; rows within this y-diff are merged
const COL_GAP_MIN = 8;          // points; horizontal gap that splits a row into cells

/**
 * Some lab PDFs (e.g. 2018 NPL) encode each glyph 4× — "TTTTeeeesssstttt" instead of "Test".
 * Collapse runs of 4+ identical LETTERS to a single one. We deliberately exclude
 * digits because "4000" or "11000" must stay intact.
 */
function normalizeWord(s: string): string {
  if (!s) return s;
  return s.replace(/([A-Za-z])\1{3,}/g, "$1");
}

/**
 * Read every text item with position information.
 * pdfjs reports transform = [a, b, c, d, e, f]; (e, f) is the position in PDF space
 * (y grows upward). We flip Y so that y=0 is the page top, which matches how
 * humans read.
 */
async function readWords(buffer: Buffer): Promise<{ words: Word[]; pageCount: number; pageHeights: number[] }> {
  const data = new Uint8Array(buffer);
  // pdfjs warnings/info are noisy in production; suppress.
  const doc = await getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;

  const allWords: Word[] = [];
  const pageHeights: number[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    pageHeights.push(viewport.height);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const transform = it.transform as number[];
      const x = transform[4];
      const fontHeight = Math.hypot(transform[2], transform[3]) || it.height || 0;
      const y = viewport.height - transform[5] - fontHeight; // flip + bring to baseline-top
      allWords.push({
        text: normalizeWord(it.str),
        x,
        y,
        width: it.width,
        height: it.height,
        fontHeight,
        page: p,
      });
    }
    page.cleanup();
  }
  await doc.cleanup();
  return { words: allWords, pageCount: doc.numPages, pageHeights };
}

/** Group words on the same baseline. Words within ROW_TOL of an existing row join that row. */
function groupRows(words: Word[]): Word[][] {
  if (words.length === 0) return [];
  // Sort by page, then top, then x.
  const sorted = [...words].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const rows: Word[][] = [];
  let current: Word[] = [sorted[0]];
  let curPage = sorted[0].page;
  let curY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (w.page === curPage && Math.abs(w.y - curY) <= ROW_TOL) {
      current.push(w);
      // Keep curY as the running median-ish anchor.
      curY = (curY + w.y) / 2;
    } else {
      rows.push(current.sort((a, b) => a.x - b.x));
      current = [w];
      curPage = w.page;
      curY = w.y;
    }
  }
  rows.push(current.sort((a, b) => a.x - b.x));
  return rows;
}

/** Cluster a row into cells by horizontal gaps. */
function rowToCells(words: Word[]): { cells: string[]; cellRanges: Array<[number, number]> } {
  if (words.length === 0) return { cells: [], cellRanges: [] };
  const cells: string[] = [];
  const ranges: Array<[number, number]> = [];
  let buf: Word[] = [words[0]];
  for (let k = 1; k < words.length; k++) {
    const prev = buf[buf.length - 1];
    const gap = words[k].x - (prev.x + prev.width);
    if (gap > COL_GAP_MIN) {
      cells.push(buf.map((w) => w.text).join(" ").trim());
      ranges.push([buf[0].x, prev.x + prev.width]);
      buf = [words[k]];
    } else {
      buf.push(words[k]);
    }
  }
  cells.push(buf.map((w) => w.text).join(" ").trim());
  ranges.push([buf[0].x, buf[buf.length - 1].x + buf[buf.length - 1].width]);
  return { cells, cellRanges: ranges };
}

export type LayoutResult = {
  rows: Row[];
  fullText: string;
  pageCount: number;
  /** Pages that produced zero text — candidates for OCR fallback. */
  emptyPages: number[];
};

export async function extractLayout(buffer: Buffer): Promise<LayoutResult> {
  const { words, pageCount, pageHeights } = await readWords(buffer);
  const grouped = groupRows(words);

  const rows: Row[] = grouped.map((g) => {
    const { cells, cellRanges } = rowToCells(g);
    return {
      page: g[0].page,
      y: g[0].y,
      height: Math.max(...g.map((w) => w.fontHeight || w.height || 0)),
      cells,
      cellRanges,
      text: cells.join("\t"),
    };
  });

  // Build a readable full-text dump (used for date extraction + plain-text fallback).
  const lines: string[] = [];
  let currentPage = 0;
  for (const r of rows) {
    if (r.page !== currentPage) {
      if (currentPage !== 0) lines.push(""); // page break
      currentPage = r.page;
    }
    lines.push(r.cells.join("  "));
  }
  const fullText = lines.join("\n");

  // Identify pages with no text → OCR candidates.
  const pagesWithText = new Set(rows.map((r) => r.page));
  const emptyPages: number[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (!pagesWithText.has(p)) emptyPages.push(p);
  }
  void pageHeights; // not used downstream yet

  return { rows, fullText, pageCount, emptyPages };
}
