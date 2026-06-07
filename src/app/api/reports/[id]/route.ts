import { auth } from "@/auth";
import { db } from "@/lib/firestore";
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
  const reportDocRef = db.collection("reports").doc(id);
  const reportDoc = await reportDocRef.get();

  if (!reportDoc.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reportData = reportDoc.data();
  if (reportData?.userId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (reportData.storedPath) {
    await removeStoredFile(reportData.storedPath);
  }

  const batch = db.batch();
  batch.delete(reportDocRef);

  const measurementsSnapshot = await db
    .collection("measurements")
    .where("reportFileId", "==", id)
    .get();

  measurementsSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  return NextResponse.json({ ok: true });
}
