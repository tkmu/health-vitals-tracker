import { auth } from "@/auth";
import { db } from "@/lib/firestore";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reportsRef = db.collection("reports");
  const query = reportsRef
    .where("userId", "==", userId)
    .orderBy("reportDate", "desc");

  const snapshot = await query.get();
  const reports = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      reportDate: data.reportDate && typeof data.reportDate.toDate === "function"
        ? data.reportDate.toDate().toISOString()
        : data.reportDate,
      createdAt: data.createdAt && typeof data.createdAt.toDate === "function"
        ? data.createdAt.toDate().toISOString()
        : data.createdAt,
      parseNote: data.parseNote || null,
      _count: {
        measurements: data.measurementsCount || 0,
      },
    };
  });

  return NextResponse.json(reports);
}
