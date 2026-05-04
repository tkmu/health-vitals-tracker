import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { removeStoredFile } from "@/lib/uploads";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const report = await prisma.reportFile.findFirst({
    where: { id, userId },
  });
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await removeStoredFile(report.storedPath);
  await prisma.reportFile.delete({ where: { id: report.id } });

  return NextResponse.json({ ok: true });
}
