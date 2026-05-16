/**
 * Catalog-aware matching over row-level data.
 *
 * Two extraction strategies, run in order:
 *
 *   1. ROW MATCH (high confidence) — for each row, build a "stretched label"
 *      that may absorb adjacent label-only rows in the same column band, then
 *      perform token-subset matching against catalog aliases. If matched, look
 *      for a value in the row's other cells.
 *
 *   2. TEXT WINDOW MATCH (low confidence fallback) — for keys still unmatched,
 *      scan the joined text for the longest catalog alias and grab the nearest
 *      number. Used only when the alias is sufficiently distinctive
 *      (≥2 tokens or ≥6 chars) to avoid false positives.
 *
 * Every candidate is gated by the catalog's sanityMin/sanityMax.
 */

import { PARAMETER_CATALOG } from "@/lib/parameter-catalog";
import type { ParameterCatalogEntry } from "@/lib/parameter-catalog";
import type { Row } from "@/lib/extract/pdf-layout";

export type Reading = {
  parameterKey: string;
  value: number;
  unit: string;
  rawValue: string;
  rawUnit: string;
  rawRange: string;
  qualifier: "" | "<" | ">" | "≤" | "≥";
  matchAlias: string;
  confidence: number;
  source: "row" | "text";
  page: number;
  /** Index into the `rows` array passed to `matchCatalog`, or -1 if `text` source. */
  rowIndex: number;
  sourceSnippet: string;
};

const CATALOG_BY_KEY = new Map(PARAMETER_CATALOG.map((p) => [p.key, p]));

type AliasEntry = {
  key: string;
  alias: string;
  norm: string;
  tokens: string[];
};

const ALIAS_INDEX: AliasEntry[] = (() => {
  const out: AliasEntry[] = [];
  for (const p of PARAMETER_CATALOG) {
    const seen = new Set<string>();
    const all = [p.label, ...p.aliases];
    for (const a of all) {
      const norm = normalizeAlias(a);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push({ key: p.key, alias: a, norm, tokens: norm.split(" ").filter((t) => t.length > 0) });
    }
  }
  // Longer aliases first so "ldl cholesterol" beats "ldl".
  return out.sort((a, b) => b.norm.length - a.norm.length);
})();

function normalizeAlias(s: string): string {
  let out = s
    .toLowerCase()
    .replace(/[‐-―\-_/\\]+/g, " ") // dashes, slashes
    .replace(/[(),:;|]/g, " ")
    .replace(/[.]/g, "") // drop periods inside acronyms ("V.L.D.L" -> "VLDL")
    .replace(/\s+/g, " ")
    .trim();
  // Merge runs of consecutive single letters into one acronym: "h d l" → "hdl",
  // "c r p" → "crp". Common in older lab PDFs where text rendering breaks acronyms.
  out = out.replace(/\b([a-z])(?:\s+([a-z])){1,5}\b/g, (m) => m.replace(/\s+/g, ""));
  return out;
}

/** Parse a value cell. */
function parseValueCell(raw: string): {
  value: number | null;
  qualifier: "" | "<" | ">" | "≤" | "≥";
  raw: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, qualifier: "", raw };

  const m = trimmed.match(
    /^(?:(<|>|≤|≥)\s*)?(-?\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*10\^?(-?\d+))?/,
  );
  if (!m) return { value: null, qualifier: "", raw };
  const qualifier = (m[1] as "" | "<" | ">" | "≤" | "≥") ?? "";

  let numStr = m[2];
  if (numStr.includes(",")) {
    const parts = numStr.split(",");
    // Heuristic: "6,100" (1-3 digits then 3 digits) → thousands; "5,1" → decimal.
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      numStr = numStr.replace(/,/g, "");
    } else if (parts.length === 2 && parts[1].length <= 2 && !numStr.includes(".")) {
      numStr = `${parts[0]}.${parts[1]}`;
    } else {
      numStr = numStr.replace(/,/g, "");
    }
  }
  numStr = numStr.replace(/\s/g, "");
  let value = Number.parseFloat(numStr);
  if (!Number.isFinite(value)) return { value: null, qualifier: "", raw };

  if (m[3]) {
    const exp = Number.parseInt(m[3], 10);
    if (Number.isFinite(exp)) value = value * Math.pow(10, exp);
  }

  return { value, qualifier, raw };
}

function passesSanity(entry: ParameterCatalogEntry, value: number): boolean {
  if (entry.sanityMin != null && value < entry.sanityMin) return false;
  if (entry.sanityMax != null && value > entry.sanityMax) return false;
  return true;
}

const CONTINUATION_RE = /^(method|technology|sample|machine|calculated|note|reference|specimen|department|comment|interpretation|clinical|page no|barcode|patient|age|gender)/i;

/**
 * Build a stretched logical label for each row by absorbing label-only rows
 * in the same column band, both upward and downward.
 *
 * `labelBand` is the [x0, x1] band where labels are expected for that row.
 * For "label-on-left" rows, this is the first cell's range.
 * For "value-only" rows (no label cell), we pass a leftmost-band estimate.
 */
function stretchLabel(
  rows: Row[],
  rowIdx: number,
  seedLabel: string,
  labelBand: [number, number],
): string {
  const r = rows[rowIdx];
  let label = seedLabel;
  const fontH = r.height || 10;
  const maxGap = Math.max(2.5 * fontH, 24);

  // Upward
  let topAnchor = r.y;
  for (let k = rowIdx - 1; k >= Math.max(0, rowIdx - 4); k--) {
    const prev = rows[k];
    if (prev.page !== r.page) break;
    if (prev.cells.length !== 1) break;
    const txt = prev.cells[0];
    if (CONTINUATION_RE.test(txt)) break;
    if (sameColumnBand(prev.cellRanges[0], labelBand) < 0.4) break;
    if (topAnchor - (prev.y + (prev.height || 10)) > maxGap) break;
    label = `${txt} ${label}`.trim();
    topAnchor = prev.y;
  }

  // Downward
  let bottomAnchor = r.y + fontH;
  for (let k = rowIdx + 1; k <= Math.min(rows.length - 1, rowIdx + 3); k++) {
    const next = rows[k];
    if (next.page !== r.page) break;
    if (next.cells.length !== 1) break;
    if (sameColumnBand(next.cellRanges[0], labelBand) < 0.4) break;
    if (next.y - bottomAnchor > maxGap) break;
    const txt = next.cells[0];
    if (/\d/.test(txt) || txt.length > 50) break;
    if (CONTINUATION_RE.test(txt)) break;
    label = `${label} ${txt}`.trim();
    bottomAnchor = next.y;
  }

  return label;
}

function sameColumnBand(a: [number, number], b: [number, number]): number {
  const overlap = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  const width = Math.max(a[1], b[1]) - Math.min(a[0], b[0]);
  return width > 0 ? overlap / width : 0;
}

/**
 * Find the catalog alias that best matches a label string.
 *
 * Strategy: tokens of the alias must appear in the label tokens, in order,
 * with no foreign tokens INSIDE the alias span (but extra tokens at the edges
 * are fine). This handles "Cholesterol/High Density Lipoprotein (HDL) Ratio"
 * matching "Cholesterol/HDL Ratio" via tokens [cholesterol, hdl, ratio] —
 * actually it should NOT match here because "high density lipoprotein" sits
 * between "cholesterol" and "hdl". So strict in-order matching is too strict.
 *
 * Better: use full-phrase substring with tokenization that treats acronyms in
 * parentheses as standalone tokens. We allow up to 4 additional tokens between
 * adjacent alias tokens.
 */
function tokenMatches(labelToken: string, aliasToken: string): boolean {
  if (labelToken === aliasToken) return true;
  // Allow prefix matching: handles singular/plural (basophil/basophils) and
  // short forms (chol/cholesterol). Both sides need to be ≥3 chars.
  if (aliasToken.length >= 3 && labelToken.startsWith(aliasToken)) return true;
  if (labelToken.length >= 3 && aliasToken.startsWith(labelToken)) return true;
  // Tolerate a 1-character difference for long tokens (typo robustness, e.g. "hba1c" / "hbalc")
  if (labelToken.length >= 5 && aliasToken.length >= 5 && Math.abs(labelToken.length - aliasToken.length) <= 1) {
    let diffs = 0;
    const a = labelToken;
    const b = aliasToken;
    const max = Math.max(a.length, b.length);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++;
        j++;
      } else {
        diffs++;
        if (diffs > 1) return false;
        if (a.length > b.length) i++;
        else if (b.length > a.length) j++;
        else {
          i++;
          j++;
        }
      }
    }
    diffs += a.length - i + b.length - j;
    return diffs <= 1 && max >= 5;
  }
  return false;
}

function matchAlias(label: string): { entry: ParameterCatalogEntry; alias: string; score: number } | null {
  const norm = normalizeAlias(label);
  if (!norm) return null;
  const labelTokens = norm.split(" ").filter((t) => t.length > 0);

  let best: { entry: ParameterCatalogEntry; alias: string; score: number } | null = null;

  for (const a of ALIAS_INDEX) {
    // 1. Exact substring with word boundaries.
    if (norm.includes(a.norm)) {
      const idx = norm.indexOf(a.norm);
      const before = idx === 0 ? " " : norm[idx - 1];
      const after = idx + a.norm.length >= norm.length ? " " : norm[idx + a.norm.length];
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        const entry = CATALOG_BY_KEY.get(a.key);
        if (entry) return { entry, alias: a.alias, score: 1.5 };
      }
    }

    if (a.tokens.length === 0) continue;

    // 2. Token subsequence with prefix-tolerant matching.
    let li = 0;
    let firstHit = -1;
    let lastHit = -1;
    let hits = 0;
    let prevHitIdx = -1;
    for (const at of a.tokens) {
      let found = -1;
      for (let j = li; j < labelTokens.length; j++) {
        if (tokenMatches(labelTokens[j], at)) {
          found = j;
          break;
        }
      }
      if (found < 0) {
        hits = -1;
        break;
      }
      // Limit gap between consecutive matched tokens.
      if (prevHitIdx >= 0 && found - prevHitIdx > 5) {
        hits = -1;
        break;
      }
      if (firstHit < 0) firstHit = found;
      lastHit = found;
      prevHitIdx = found;
      li = found + 1;
      hits++;
    }
    // Accept single-token aliases only if the token is long enough to be distinctive
    // (≥5 chars). This lets "basophil" match "basophils" but blocks "hdl" from
    // matching random "h" tokens.
    if (hits === a.tokens.length && (a.tokens.length >= 2 || (a.tokens.length === 1 && a.tokens[0].length >= 5))) {
      // Score: penalize loose matches (more tokens between alias tokens) and
      // reward when the alias span sits at the start of the label.
      const span = lastHit - firstHit + 1;
      const tightness = a.tokens.length / Math.max(span, 1);
      const score = tightness + (firstHit === 0 ? 0.1 : 0);
      if (!best || score > best.score) {
        const entry = CATALOG_BY_KEY.get(a.key);
        if (entry) best = { entry, alias: a.alias, score };
      }
    }
  }
  return best;
}

function findFirstValueCellIdx(cells: string[]): number {
  for (let i = 0; i < cells.length; i++) {
    const parsed = parseValueCell(cells[i]);
    if (parsed.value != null) return i;
  }
  return -1;
}

/** Estimate the leftmost-column band on the page that contains label rows. */
function estimateLabelBand(rows: Row[], page: number): [number, number] | null {
  const lefts: number[] = [];
  for (const r of rows) {
    if (r.page !== page) continue;
    if (r.cells.length === 0) continue;
    // First cell that contains alphabetic content
    for (let c = 0; c < r.cells.length; c++) {
      if (/[a-zA-Z]/.test(r.cells[c])) {
        lefts.push(r.cellRanges[c][0]);
        break;
      }
    }
  }
  if (lefts.length === 0) return null;
  lefts.sort((a, b) => a - b);
  const median = lefts[Math.floor(lefts.length / 2)];
  return [median - 8, median + 80];
}

const NOISE_CELL_RE =
  /^(method\b|technology\b|sample type\b|sample drawn\b|machine\b|calculated\b|note\s*[:]|reference\b|specimen\b|department\b|interpretation\b|comments?\b|clinical use\b)/i;

const TEST_HEADER_RE = /^(test\s*(name|description|results?|asked)|results?|units?|value\(s\)|reference range|bio\.?\s*ref)/i;

/** Strategy 1: row-level catalog match. Handles three row shapes:
 *  A. label + value+ on same row (most common)
 *  B. multi-line label above/below; value cell is alone on its row
 *  C. label-only continuation rows (skipped; absorbed into A/B via stretchLabel)
 */
function rowStrategy(rows: Row[]): Reading[] {
  const found = new Map<string, Reading>();

  // Cache page-level label-band estimates.
  const labelBandByPage = new Map<number, [number, number] | null>();
  function bandForPage(p: number): [number, number] | null {
    if (!labelBandByPage.has(p)) labelBandByPage.set(p, estimateLabelBand(rows, p));
    return labelBandByPage.get(p) ?? null;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.cells.length === 0) continue;
    const labelCell0 = r.cells[0];
    if (NOISE_CELL_RE.test(labelCell0)) continue;
    if (TEST_HEADER_RE.test(labelCell0)) continue;

    const firstValIdx = findFirstValueCellIdx(r.cells);

    // Decide label seed and value cell:
    let label = "";
    let valueIdx = -1;
    let labelBand: [number, number] | null = null;

    if (firstValIdx > 0) {
      // Shape A: label cells precede value cell.
      label = r.cells.slice(0, firstValIdx).join(" ").trim();
      valueIdx = firstValIdx;
      labelBand = r.cellRanges[0];
    } else if (firstValIdx === 0) {
      // Shape B: row starts with the value; label must come from neighbors.
      valueIdx = 0;
      labelBand = bandForPage(r.page);
      if (!labelBand) continue;
      label = "";
    } else {
      // Pure label/heading row — handled when its neighbor (a value row) absorbs it.
      continue;
    }

    if (!/[a-zA-Z]/.test(label)) {
      // No alpha in seed; rely entirely on absorbed neighbor labels.
      label = stretchLabel(rows, i, "", labelBand);
    } else {
      label = stretchLabel(rows, i, label, labelBand);
    }
    if (!/[a-zA-Z]/.test(label)) continue;

    const matched = matchAlias(label);
    if (!matched) continue;

    const parsed = parseValueCell(r.cells[valueIdx]);
    if (parsed.value == null) continue;
    if (!passesSanity(matched.entry, parsed.value)) continue;

    const rawUnit = r.cells[valueIdx + 1] ?? "";
    const rawRange = r.cells[valueIdx + 2] ?? "";

    const reading: Reading = {
      parameterKey: matched.entry.key,
      value: parsed.value,
      unit: matched.entry.unit,
      rawValue: parsed.raw,
      rawUnit,
      rawRange,
      qualifier: parsed.qualifier,
      matchAlias: matched.alias,
      confidence: 0.85 + Math.min(0.1, matched.score / 15),
      source: "row",
      page: r.page,
      rowIndex: i,
      sourceSnippet: r.cells.join(" | "),
    };

    const prior = found.get(matched.entry.key);
    if (!prior || reading.confidence > prior.confidence) {
      found.set(matched.entry.key, reading);
    }
  }
  return [...found.values()];
}

/**
 * Strategy 2: plain-text window fallback. STRICT — only used when:
 *   - alias is distinctive (≥2 tokens or ≥6 chars)
 *   - the value found in the window doesn't look like a reference range
 *     boundary ("< 200" range bounds are skipped — we want the test result,
 *     not the threshold)
 */
function textStrategy(fullText: string, already: Set<string>): Reading[] {
  const haystack = normalizeAlias(fullText);
  const out: Reading[] = [];

  for (const entry of PARAMETER_CATALOG) {
    if (already.has(entry.key)) continue;

    const candidates = [entry.label, ...entry.aliases]
      .map((a) => ({ raw: a, norm: normalizeAlias(a) }))
      .filter((a) => a.norm.length >= 6 || a.norm.split(" ").length >= 2)
      .sort((a, b) => b.norm.length - a.norm.length);

    let best: Reading | null = null;
    for (const c of candidates) {
      let from = 0;
      while (true) {
        const idx = haystack.indexOf(c.norm, from);
        if (idx < 0) break;
        const before = idx === 0 ? " " : haystack[idx - 1];
        const after = idx + c.norm.length >= haystack.length ? " " : haystack[idx + c.norm.length];
        if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) {
          from = idx + 1;
          continue;
        }
        const window = haystack.slice(idx + c.norm.length, idx + c.norm.length + 60);
        // STRICT: number must NOT be preceded by < > ≤ ≥ (which signal a range bound),
        // and not preceded by another decimal number (which would be a unit denominator).
        const m = window.match(/^\s+(-?\d+(?:[.,]\d+)?)/);
        if (m) {
          const parsed = parseValueCell(m[1]);
          if (parsed.value != null && passesSanity(entry, parsed.value)) {
            best = {
              parameterKey: entry.key,
              value: parsed.value,
              unit: entry.unit,
              rawValue: parsed.raw,
              rawUnit: "",
              rawRange: "",
              qualifier: parsed.qualifier,
              matchAlias: c.raw,
              confidence: 0.55,
              source: "text",
              page: 0,
              rowIndex: -1,
              sourceSnippet: fullText.slice(Math.max(0, idx - 30), idx + c.norm.length + 80),
            };
            break;
          }
        }
        from = idx + 1;
      }
      if (best) break;
    }
    if (best) out.push(best);
  }
  return out;
}

export function matchCatalog(rows: Row[], fullText: string): Reading[] {
  const rowHits = rowStrategy(rows);
  const seen = new Set(rowHits.map((r) => r.parameterKey));
  const textHits = textStrategy(fullText, seen);
  return [...rowHits, ...textHits].sort((a, b) => a.parameterKey.localeCompare(b.parameterKey));
}

/** Probe: return the catalog key a label would map to, or null. Used by the
 * unmatched-candidates surfacer to dedupe across pages. */
export function peekCatalogMatch(label: string): string | null {
  const m = matchAlias(label);
  return m?.entry.key ?? null;
}
