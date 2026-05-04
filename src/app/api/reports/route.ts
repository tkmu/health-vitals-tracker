import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await prisma.reportFile.findMany({
    where: { userId },
    orderBy: { reportDate: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      reportDate: true,
      createdAt: true,
      parseNote: true,
      _count: { select: { measurements: true } },
    },
  });

  return NextResponse.json(reports);
}
