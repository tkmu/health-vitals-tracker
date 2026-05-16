# PDF / file extraction pipeline

Entry point: `ingestBuffer(buf, fileName, mimeType)` in `ingest-file.ts`.

For PDFs, this calls the **layout-aware pipeline** in `pdf-pipeline.ts`. The
old `pdf-parse` path has been removed — it could not preserve the visual
column structure that lab reports rely on.

## Why we don't use `pdf-parse`

`pdf-parse` returns a single flat text dump. Lab reports lay out data in
columns (`Test | Value | Unit | Reference Range`). When the text collapses,
values from the reference-range column get attributed to the test value,
producing nonsense like `Hemoglobin = 8 g/dL` (actual value: 13.3) or
`Creatinine = 10.33` (actual value: 0.86). Sanity bounds catch the worst,
but most wrong values stay within sanity ranges.

## Pipeline (PDFs)

```
PDF Buffer
  │
  ▼
1. pdf-layout.ts (pdfjs-dist)
   ├─ Read every text item with (x, y, fontHeight)
   ├─ Collapse 4+ identical letter runs (handles "TTTTeeeesssstttt" glyphs)
   ├─ Group words into rows by Y coordinate (3pt tolerance)
   └─ Cluster each row into cells by horizontal gaps (8pt threshold)
  │
  ▼
2. OCR fallback for pages with no embedded text
   ├─ Render page to PNG via pdfjs + node-canvas (optional dep)
   ├─ Tesseract.js OCR with `blocks: true`
   └─ Reuse the same row/cell reconstruction on OCR word boxes
  │
  ▼
3. catalog-matcher.ts
   ├─ stretchLabel: absorb adjacent label-only rows above/below in the same
   │  column band (handles multi-line test names like "Low-Density / High-
   │  Density Lipoprotein (LDL/HDL) Ratio")
   ├─ matchAlias: exact substring → token subsequence with prefix tolerance
   │  → 1-char typo tolerance for long tokens. Single-word aliases must be
   │  ≥5 chars to be distinctive.
   ├─ parseValueCell: handles "< 1.73", "6,100", "5,1", "2.5 x 10^3"
   └─ sanity bounds (`sanityMin`/`sanityMax` per catalog entry) reject
      garbage values BEFORE accepting a reading
  │
  ▼
4. findUnmatchedCandidates: rows that look like tests but don't map to any
   catalog entry — useful for catalog growth.
  │
  ▼
Result: { readings, unmatched, fullText, pageCount, ocrPages, failedPages }
```

## Matching strategy

Each catalog entry has aliases (e.g. `hemoglobin`, `haemoglobin`, `hb`). The
matcher runs three layers:

1. **Exact substring** — `"hemoglobin"` appears verbatim in the label
2. **Token subsequence with prefix tolerance** — tokens of the alias appear
   in the label in order, allowing prefix matches (`chol` ↔ `cholesterol`)
   and one-character typos for tokens ≥5 chars. Up to 5 unrelated tokens
   may sit between adjacent alias tokens.
3. **Acronym repair** — `"H D L"` (one letter per token) is merged into
   `"HDL"` during normalization, so old PDFs with broken character runs
   still match.

The first cell that **parses as a number AND passes sanity bounds** is
accepted as the value. Reference-range numbers (`< 200`, `40 - 80`) are
captured separately in `rawRange`.

## Output

```ts
type Reading = {
  parameterKey: string;     // catalog key, e.g. "hemoglobin"
  value: number;            // numeric value
  unit: string;             // canonical unit from catalog (always normalized)
  rawValue: string;         // value as it appeared in the PDF
  rawUnit: string;          // unit cell as it appeared
  rawRange: string;         // reference range cell as it appeared
  qualifier: "" | "<" | ">" | "≤" | "≥";
  matchAlias: string;       // which alias matched
  confidence: number;       // 0.55 (text-window) to 0.95 (row, tight match)
  source: "row" | "text";
  page: number;
  rowIndex: number;
  sourceSnippet: string;    // human-readable for debugging
};
```

The legacy `ExtractedValue` shape the upload route consumes is a strict
subset of `Reading`, so wiring is non-breaking.

## Extending the catalog

After running ingestion, check `result.unmatchedCandidates` for rows that
look like tests but found no match. Typical gaps in this repo's catalog:

- `Conjugated Bilirubin` / `Unconjugated Bilirubin` (synonyms for direct/indirect)
- `Non-HDL Cholesterol`, `HDL/LDL Ratio`, `SGOT/SGPT Ratio`, `Urea/Creatinine Ratio`
- CBC sub-parameters: `RDW-SD`, `MPV`, `PDW`, `PCT`, `P-LCR`, `Mentzer Index`
- Absolute differential counts: `Absolute Neutrophils`, etc.
- Heavy metals (Thyrocare Aarogyam X panels)

To add a new parameter, edit `src/lib/parameter-catalog.ts` and run
`scripts/bench-final.ts` to verify it gets picked up.

## Performance

The pipeline takes ~1–3 seconds per text-PDF on a typical Cloud Run
instance. OCR adds ~5–10 seconds per image-only page. There is no per-page
LLM call — extraction is fully deterministic.

## Dev scripts

Add a folder of sample lab PDFs at `../sample reports/` (relative to the repo
root) or set `SAMPLES_DIR=/path/to/pdfs`. Then:

```bash
npm run bench:extractor              # run extractor on every PDF; show
                                     # matches AND unmatched candidates
npm run dump:rows <pdf-name>         # dump rows/cells for a PDF, all pages
npm run dump:rows <pdf-name> 3 5     # dump rows/cells for pages 3-5
```

`bench:extractor` is the canonical way to verify the extractor end-to-end
after editing the matcher or catalog. `dump:rows` is for diagnosing why a
specific row didn't match — it prints the cell breakdown as the extractor
sees it.

Both scripts are devtools — they're not bundled into the production build.
