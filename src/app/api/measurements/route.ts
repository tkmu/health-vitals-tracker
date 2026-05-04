import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to (ISO dates) required" }, { status: 400 });
  }

  const fromD = new Date(from);
  const toD = new Date(to);
  if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const rows = await prisma.labMeasurement.findMany({
    where: {
      userId,
      measuredAt: { gte: fromD, lte: toD },
    },
    orderBy: [{ measuredAt: "asc" }, { parameterKey: "asc" }],
    select: {
      parameterKey: true,
      value: true,
      unit: true,
      measuredAt: true,
      reportFileId: true,
    },
  });

  return NextResponse.json(rows);
}
