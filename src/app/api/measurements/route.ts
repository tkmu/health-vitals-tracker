import { auth } from "@/auth";
import { db } from "@/lib/firestore";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

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

  const measurementsRef = db.collection("measurements");
  const query = measurementsRef
    .where("userId", "==", userId)
    .where("measuredAt", ">=", Timestamp.fromDate(fromD))
    .where("measuredAt", "<=", Timestamp.fromDate(toD))
    .orderBy("measuredAt", "asc")
    .orderBy("parameterKey", "asc");

  const snapshot = await query.get();
  const rows = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      parameterKey: data.parameterKey,
      value: data.value,
      unit: data.unit,
      measuredAt: data.measuredAt && typeof data.measuredAt.toDate === "function" 
        ? data.measuredAt.toDate().toISOString() 
        : data.measuredAt,
      reportFileId: data.reportFileId,
    };
  });

  return NextResponse.json(rows);
}
