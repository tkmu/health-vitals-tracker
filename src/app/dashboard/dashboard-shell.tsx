"use client";

import { VitalsChart } from "@/components/vitals-chart";
import { LabsDataTable } from "@/components/labs-data-table";
import { DEFAULT_CHART_KEYS } from "@/lib/parameter-catalog";
import { PARAMETER_BY_KEY } from "@/lib/parameter-catalog";
import type { MeasurementRow } from "@/lib/pivot-measurements";
import { pivotByDate } from "@/lib/pivot-measurements";
import { DEFAULT_RANGE_ID, RANGE_PRESETS, type RangePresetId, rangeFromPreset } from "@/lib/time-range";
import { faChartLine, faTable } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useState } from "react";

export function DashboardShell() {
  const [rangeId, setRangeId] = useState<RangePresetId>(DEFAULT_RANGE_ID);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"charts" | "table">("charts");

  const { from, to } = useMemo(() => rangeFromPreset(rangeId), [rangeId]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const res = await fetch(`/api/measurements?${qs}`);
    if (res.ok) {
      const data = (await res.json()) as MeasurementRow[];
      setRows(data);
    } else {
      setRows([]);
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const pivot = useMemo(() => pivotByDate(rows), [rows]);

  const lipidKeys = [...DEFAULT_CHART_KEYS[0]];
  const lipidUnit = PARAMETER_BY_KEY.get("ldl")?.unit ?? "mg/dL";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/90">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Vitals trajectory</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            Deterministic parsing from your uploads — only catalog parameters with explicit matches are stored.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Range</label>
          <select
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value as RangePresetId)}
            className="rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-cyan-500/40 focus:ring-2"
          >
            {RANGE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex gap-2 rounded-2xl border border-white/10 bg-zinc-900/40 p-1">
        <button
          type="button"
          onClick={() => setTab("charts")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition sm:flex-none sm:px-6 ${
            tab === "charts" ? "bg-cyan-500/15 text-cyan-200" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <FontAwesomeIcon icon={faChartLine} className="opacity-80" />
          Graphs
        </button>
        <button
          type="button"
          onClick={() => setTab("table")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition sm:flex-none sm:px-6 ${
            tab === "table" ? "bg-violet-500/15 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <FontAwesomeIcon icon={faTable} className="opacity-80" />
          Table
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-12 text-center text-sm text-zinc-500">
          Loading measurements…
        </div>
      ) : tab === "charts" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <VitalsChart title="Lipid panel" data={pivot} keys={lipidKeys} yLabel={`Lipids (${lipidUnit})`} />
          <VitalsChart title="Hemoglobin (Hb)" data={pivot} keys={["hemoglobin"]} yLabel="Hemoglobin (g/dL)" />
          <VitalsChart title="Glycated Hemoglobin (HbA1C)" data={pivot} keys={["hba1c"]} yLabel="HbA1C (%)" />
          <VitalsChart title="Vitamin D, 25-Hydroxy" data={pivot} keys={["vitamin_d"]} yLabel="Vitamin D (ng/mL)" />
          <VitalsChart title="Albumin/Globulin (A/G) Ratio" data={pivot} keys={["ag_ratio"]} yLabel="A/G (Ratio)" />
          <VitalsChart title="Triiodothyronine (T3), Total" data={pivot} keys={["t3_total"]} yLabel="T3 Total (ng/mL)" />
          <VitalsChart title="Thyroxine (T4), Total" data={pivot} keys={["t4_total"]} yLabel="T4 Total (µg/dL)" />
        </div>
      ) : (
        <LabsDataTable rows={rows} />
      )}
    </div>
  );
}
