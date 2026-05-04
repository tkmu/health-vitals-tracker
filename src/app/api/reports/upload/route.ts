import { auth } from "@/auth";
import { ingestBuffer } from "@/lib/extract/ingest-file";
import { prisma } from "@/lib/prisma";
import { saveFile } from "@/lib/uploads";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const reportDateRaw = form.get("reportDate");
  let reportDate: Date | null = null;
  if (typeof reportDateRaw === "string" && reportDateRaw) {
    reportDate = new Date(reportDateRaw);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ingest = await ingestBuffer(buf, file.name, file.type || "application/octet-stream");

  // Try to extract date if not provided
  if (!reportDate && ingest.extractedDate) {
    reportDate = ingest.extractedDate;
  }

  if (!reportDate || Number.isNaN(reportDate.getTime())) {
    // Abort DB save and ask frontend to prompt the user
    return NextResponse.json({
      error: "Date could not be extracted automatically.",
      requiresDate: true,
      readingsCount: ingest.readings.length,
      method: ingest.method,
    }, { status: 200 }); // Return 200 to avoid console noise, frontend handles requiresDate

  }

  const id = crypto.randomUUID();
  const storedPath = await saveFile(buf, userId, file.name, id, file.type || "application/octet-stream");

  const rawTextHash = crypto.createHash("sha256").update(buf.subarray(0, Math.min(buf.length, 500_000))).digest("hex");

  const report = await prisma.reportFile.create({
    data: {
      id,
      userId,
      originalName: file.name,
      storedPath,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: buf.length,
      reportDate,
      parseNote: ingest.note?.replace(/\0/g, "") ?? null,
      rawTextHash,
    },
  });

  if (ingest.readings.length > 0) {
    await prisma.labMeasurement.createMany({
      data: ingest.readings.map((r) => ({
        userId,
        reportFileId: report.id,
        parameterKey: r.parameterKey,
        value: r.value,
        unit: r.unit,
        measuredAt: reportDate,
        matchAlias: r.matchAlias.replace(/\0/g, ""),
        sourceSnippet: r.sourceSnippet.replace(/\0/g, ""),
      })),
    });
  }

  return NextResponse.json({
    reportId: report.id,
    readingsCount: ingest.readings.length,
    method: ingest.method,
    note: ingest.note,
  });
}
