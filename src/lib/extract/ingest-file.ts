import { extractFromPlainText, extractFromTableRows, type ExtractedValue } from "@/lib/extract/text-pipeline";
import { extractPdf } from "@/lib/extract/pdf-pipeline";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { createWorker } from "tesseract.js";

export type IngestResult = {
  readings: ExtractedValue[];
  method: "pdf-text" | "pdf-ocr" | "xlsx" | "csv" | "docx" | "ocr" | "plain" | "unsupported";
  note?: string;
  extractedDate?: Date;
  fullText?: string;
  /** Test-like rows that did NOT match the catalog. Useful for catalog-growth tooling. */
  unmatchedCandidates?: Array<{ page: number; label: string; value: string; unit: string; range: string }>;
};

export async function ingestBuffer(buf: Buffer, fileName: string, mimeType: string): Promise<IngestResult> {
  const name = fileName.toLowerCase();

  if (name.endsWith(".csv") || mimeType === "text/csv") {
    const text = buf.toString("utf-8");
    let rows: string[][] = [];
    try {
      rows = parse(text, { relax_column_count: true, skip_empty_lines: true }) as string[][];
    } catch {
      rows = text.split(/\r?\n/).map((l) => l.split(/[,\t]/));
    }
    const fromTable = extractFromTableRows(rows);
    const fromText = extractFromPlainText(text);
    return { readings: mergeReadings(fromTable, fromText), method: "csv", extractedDate: extractDateFromText(text) };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mimeType.includes("spreadsheet")) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const rows: string[][] = [];
    for (const sn of wb.SheetNames) {
      const sheet = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as unknown[][];
      for (const r of data) {
        rows.push(r.map((c) => (c == null ? "" : String(c))));
      }
    }
    return { readings: extractFromTableRows(rows), method: "xlsx" };
  }

  if (name.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { readings: extractFromPlainText(value), method: "docx", extractedDate: extractDateFromText(value) };
  }

  if (name.endsWith(".pdf") || mimeType === "application/pdf") {
    try {
      const res = await extractPdf(buf);
      // Translate Reading[] to the legacy ExtractedValue[] shape so callers
      // (DB writer, UI) keep working without changes.
      const readings: ExtractedValue[] = res.readings.map((r) => ({
        parameterKey: r.parameterKey,
        value: r.value,
        unit: r.unit,
        matchAlias: r.matchAlias,
        sourceSnippet: r.sourceSnippet,
      }));
      const usedOcr = res.ocrPages.length > 0;
      const note =
        readings.length === 0
          ? usedOcr
            ? "PDF was rendered + OCR'd but no catalog matches were found."
            : "PDF text was extracted but no catalog matches were found."
          : res.failedPages.length > 0
            ? `Pages ${res.failedPages.join(", ")} could not be read.`
            : undefined;
      return {
        readings,
        method: usedOcr ? "pdf-ocr" : "pdf-text",
        note,
        fullText: res.fullText,
        extractedDate: extractDateFromText(res.fullText),
        unmatchedCandidates: res.unmatched,
      };
    } catch (e) {
      return {
        readings: [],
        method: "pdf-text",
        note: `PDF parse failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif") ||
    mimeType.startsWith("image/")
  ) {
    const text = await runOcr(buf);
    const readings = extractFromPlainText(text);
    return {
      readings,
      method: "ocr",
      note: readings.length === 0 ? "OCR produced no catalog matches." : undefined,
      extractedDate: extractDateFromText(text),
    };
  }

  if (name.endsWith(".txt") || mimeType === "text/plain") {
    const text = buf.toString("utf-8");
    return { readings: extractFromPlainText(text), method: "plain", extractedDate: extractDateFromText(text) };
  }

  if (name.endsWith(".doc") && !name.endsWith(".docx")) {
    return {
      readings: [],
      method: "unsupported",
      note: "Legacy .doc is not supported. Save as .docx or PDF and upload again.",
    };
  }

  return {
    readings: [],
    method: "unsupported",
    note: "Unsupported file type.",
  };
}

function mergeReadings(
  a: ReturnType<typeof extractFromPlainText>,
  b: ReturnType<typeof extractFromPlainText>,
) {
  const map = new Map<string, (typeof a)[0]>();
  for (const x of [...a, ...b]) {
    if (!map.has(x.parameterKey)) map.set(x.parameterKey, x);
  }
  return [...map.values()];
}

function extractDateFromText(text: string): Date | undefined {
  const keywords = ["sample collected", "date of test", "report date", "collected", "date", "drawn"];
  const regex = new RegExp(`(?:${keywords.join("|")})\\s*[:\\-]?\\s*(\\d{1,4}[/\\-\\sA-Za-z]+\\d{2,4})`, "gi");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const dateStr = match[1].trim();
    const date = new Date(dateStr);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
}

async function runOcr(imageBuffer: Buffer): Promise<string> {
  const worker = await createWorker("eng", 1, { logger: () => {} });
  try {
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    return text || "";
  } finally {
    await worker.terminate();
  }
}
