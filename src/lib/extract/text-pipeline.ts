import type { ParameterCatalogEntry } from "@/lib/parameter-catalog";
import { PARAMETER_CATALOG } from "@/lib/parameter-catalog";

export type ExtractedValue = {
  parameterKey: string;
  value: number;
  unit: string;
  matchAlias: string;
  sourceSnippet: string;
};

const CATALOG_FOR_MATCH: ParameterCatalogEntry[] = PARAMETER_CATALOG.map((p) => ({
  ...p,
  aliases: [...new Set([...p.aliases.map((a) => a.toLowerCase()), p.label.toLowerCase()])].sort(
    (a, b) => b.length - a.length,
  ),
}));

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/\|/g, " ")
    .replace(/[,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberToken(raw: string): number | null {
  const t = raw.replace(/,/g, ".").replace(/[^\d.-]/g, "");
  if (!t || t === "-" || t === ".") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deterministic extraction: only catalog-backed analytes; values parsed from the same text line as the label.
 */
export function extractFromPlainText(text: string): ExtractedValue[] {
  // Normalize text for matching but keep it mostly intact
  const normalized = text.replace(/\s+/g, " ");
  const results: ExtractedValue[] = [];

  // Sort by length already done in CATALOG_FOR_MATCH initialization

  for (const p of CATALOG_FOR_MATCH) {
    for (const alias of p.aliases) {
      let startPos = 0;
      const lowerText = normalized.toLowerCase();
      
      // Find all occurrences of the alias in the text
      while (true) {
        const idx = lowerText.indexOf(alias, startPos);
        if (idx === -1) break;

        // Found alias, look for a number in the immediate vicinity (next 120 chars)
        // Lab reports often have: Label [Result] [Unit] [Ref Range]
        const lookAhead = normalized.slice(idx + alias.length, idx + alias.length + 120);
        
        // Regex for numbers, including scientific notation and common prefixes like < or >
        // We match common lab formats: 123, 123.45, 1,234.5, <5.0, 1.2 x 10^6
        const numMatch = lookAhead.match(/(?:[<>]\s*)?(\d+(?:[.,]\d+)?(?:\s*[x*]\s*10\^?\d+)?)/i);
        
        if (numMatch) {
          const rawValue = numMatch[1];
          const value = parseNumberToken(rawValue);
          
          if (value !== null) {
            // Apply sanity bounds to reject OCR artifacts or misidentifications
            if ((p.sanityMin == null || value >= p.sanityMin) && 
                (p.sanityMax == null || value <= p.sanityMax)) {
              results.push({
                parameterKey: p.key,
                value,
                unit: p.unit,
                matchAlias: alias,
                sourceSnippet: normalized.slice(Math.max(0, idx - 30), idx + alias.length + 60),
              });
              // Once we find a valid match for this parameter, we stop looking for this parameter
              // in the current report to avoid double-counting if an alias appears in a footer/header.
              break; 
            }
          }
        }
        startPos = idx + 1;
        // Optimization: if we already looked ahead and didn't find a number, don't keep searching for the same alias
        if (startPos > lowerText.length - alias.length) break;
      }
      
      // If we found a match for this parameter using one alias, don't try other aliases
      if (results.some(r => r.parameterKey === p.key)) break;
    }
  }

  return dedupeByParam(results);
}

function dedupeByParam(rows: ExtractedValue[]): ExtractedValue[] {
  const seen = new Set<string>();
  const out: ExtractedValue[] = [];
  for (const r of rows) {
    if (seen.has(r.parameterKey)) continue;
    seen.add(r.parameterKey);
    out.push(r);
  }
  return out;
}

export function extractFromTableRows(rows: string[][]): ExtractedValue[] {
  const flat: ExtractedValue[] = [];
  for (const row of rows) {
    const cells = row.map((c) => normalizeLine(String(c ?? ""))).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    const line = cells.join(" ");
    flat.push(...extractFromPlainText(line));
  }
  return dedupeByParam(flat);
}
