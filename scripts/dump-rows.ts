/**
 * Dump rows + cells for a specific PDF / page range to diagnose extraction failures.
 *
 * Usage:
 *   npx tsx scripts/dump-rows.ts <pdf-name>                    # all pages
 *   npx tsx scripts/dump-rows.ts <pdf-name> 3                  # page 3 only
 *   npx tsx scripts/dump-rows.ts <pdf-name> 3 5                # pages 3-5
 *
 * Looks for the PDF in $SAMPLES_DIR (default: ../sample reports relative to this repo)
 * or, if <pdf-name> is an absolute path, uses that directly.
 */
import fs from "node:fs";
import path from "node:path";
import { extractLayout } from "../src/lib/extract/pdf-layout";

const file = process.argv[2];
const fromPage = process.argv[3] ? Number(process.argv[3]) : 1;
const toPage = process.argv[4] ? Number(process.argv[4]) : Number.POSITIVE_INFINITY;

if (!file) {
  console.error("Usage: npx tsx scripts/dump-rows.ts <pdf-name> [fromPage] [toPage]");
  process.exit(1);
}

const samplesDir = process.env.SAMPLES_DIR
  ? path.resolve(process.env.SAMPLES_DIR)
  : path.resolve(__dirname, "../../sample reports");

const pdfPath = path.isAbsolute(file) ? file : path.join(samplesDir, file);

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(pdfPath);
  const layout = await extractLayout(buf);
  for (const r of layout.rows) {
    if (r.page < fromPage || r.page > toPage) continue;
    console.log(
      `p${r.page} y=${r.y.toFixed(0)} cells=${r.cells.length}: ` +
        r.cells.map((c, i) => `[${i}] ${JSON.stringify(c)}`).join("  "),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
