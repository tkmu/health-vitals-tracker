"use client";

import { AppShell } from "@/components/app-shell";
import { faTrash, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useState } from "react";

type ReportRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  reportDate: string;
  createdAt: string;
  parseNote: string | null;
  _count: { measurements: number };
};

export default function FilesPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reports");
    if (res.ok) setRows(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setBusy(id);
    await fetch(`/api/reports/${id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Your files</h1>
        <p className="mt-2 text-sm text-zinc-400">Deleting a file removes its measurements from your timeline.</p>
        <ul className="mt-8 space-y-3">
          {rows.length === 0 ? (
            <li className="rounded-2xl border border-white/10 bg-zinc-950/50 p-8 text-center text-sm text-zinc-500">
              No uploads yet.
            </li>
          ) : (
            rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-cyan-300">
                    <FontAwesomeIcon icon={faFileLines} />
                  </span>
                  <div>
                    <div className="font-medium text-zinc-100">{r.originalName}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Report date {new Date(r.reportDate).toLocaleDateString()} · {r._count.measurements} values ·{" "}
                      {(r.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                    {r.parseNote ? <div className="mt-1 text-xs text-amber-300/90">{r.parseNote}</div> : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => remove(r.id)}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950/50 disabled:opacity-50 sm:self-center"
                >
                  <FontAwesomeIcon icon={faTrash} />
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </AppShell>
  );
}
