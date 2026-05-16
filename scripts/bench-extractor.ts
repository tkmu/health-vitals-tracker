/**
 * Benchmark the PDF extraction pipeline against a directory of sample PDFs.
 *
 * Reports both catalog matches (parameters with verified numeric values) and
 * unmatched candidates (test-shaped rows the catalog doesn't know about) —
 * the unmatched list is the catalog-growth backlog.
 *
 * Usage:
 *   npx tsx scripts/bench-extractor.ts                  # default samples dir
 *   SAMPLES_DIR=/path/to/pdfs npx tsx scripts/bench-extractor.ts
 */
import fs from "node:fs";
import path from "node:path";
import { extractPdf } from "../src/lib/extract/pdf-pipeline";
import { PARAMETER_CATALOG } from "../src/lib/parameter-catalog";

const SAMPLES_DIR = process.env.SAMPLES_DIR
  ? path.resolve(process.env.SAMPLES_DIR)
  : path.resolve(__dirname, "../../sample reports");

async function main() {
  if (!fs.existsSync(SAMPLES_DIR)) {
    console.error(`Samples directory not found: ${SAMPLES_DIR}`);
    console.error(`Set SAMPLES_DIR=/path/to/pdfs or place PDFs at ${SAMPLES_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  if (files.length === 0) {
    console.error(`No PDFs in ${SAMPLES_DIR}`);
    process.exit(1);
  }

  const overall = { matches: 0, files: 0, unmatched: 0 };

  for (const file of files) {
    const buf = fs.readFileSync(path.join(SAMPLES_DIR, file));
    const res = await extractPdf(buf);
    overall.files += 1;
    overall.matches += res.readings.length;
    overall.unmatched += res.unmatched.length;

    console.log(`\n=== ${file} ===`);
    console.log(
      `Pages: ${res.pageCount}  OCR-used: ${res.ocrPages.length}  Failed: ${res.failedPages.length}` +
        `   Matches: ${res.readings.length}/${PARAMETER_CATALOG.length}` +
        `   Unmatched candidates: ${res.unmatched.length}`,
    );
    console.log("MATCHES:");
    for (const r of res.readings) {
      const cat = PARAMETER_CATALOG.find((p) => p.key === r.parameterKey);
      console.log(`  ${cat?.label ?? r.parameterKey} = ${r.value} ${r.unit}`);
    }
    console.log("UNMATCHED (first 30):");
    for (const u of res.unmatched.slice(0, 30)) {
      console.log(`  p${u.page}: "${u.label}"  →  value="${u.value}" unit="${u.unit}" range="${u.range}"`);
    }
  }

  console.log(`\n========= TOTAL =========`);
  console.log(`PDFs: ${overall.files}  Total matches: ${overall.matches}  Total unmatched: ${overall.unmatched}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
