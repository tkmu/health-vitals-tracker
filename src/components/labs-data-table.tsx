"use client";

import { PARAMETER_CATALOG, SECTION_ORDER, isValueOutOfRange } from "@/lib/parameter-catalog";
import type { MeasurementRow } from "@/lib/pivot-measurements";
import { uniqueSortedDates } from "@/lib/pivot-measurements";
import { Fragment } from "react";

function valueForCell(rows: MeasurementRow[], paramKey: string, date: string): number | null {
  const hits = rows.filter(
    (r) =>
      r.parameterKey === paramKey &&
      new Date(r.measuredAt).toISOString().slice(0, 10) === date,
  );
  if (hits.length === 0) return null;
  return hits[hits.length - 1]!.value;
}

export function LabsDataTable({ rows }: { rows: MeasurementRow[] }) {
  const dates = uniqueSortedDates(rows);

  if (dates.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-8 text-center text-sm text-zinc-500">
        No measurements in this range. Upload a report on the Upload page.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950/60 shadow-inner">
      <table className="min-w-[720px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-zinc-900/80">
            <th className="sticky left-0 z-10 min-w-[220px] bg-zinc-900/95 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Parameter
            </th>
            {dates.map((d) => (
              <th
                key={d}
                className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold text-zinc-300"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SECTION_ORDER.map((section) => {
            const params = PARAMETER_CATALOG.filter((p) => p.section === section);
            if (params.length === 0) return null;
            return (
            <Fragment key={section}>
              <tr className="bg-violet-950/40">
                <td
                  colSpan={dates.length + 1}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-violet-200/90"
                >
                  {section}
                </td>
              </tr>
              {params.map((p) => (
                <tr key={p.key} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="sticky left-0 z-10 bg-zinc-950/95 px-4 py-2.5 text-zinc-200">{p.label}</td>
                  {dates.map((d) => {
                    const v = valueForCell(rows, p.key, d);
                    const out = v != null ? isValueOutOfRange(v, p) : false;
                    return (
                      <td
                        key={d}
                        className={`px-3 py-2.5 text-center tabular-nums ${
                          v == null ? "text-zinc-600" : out ? "bg-red-950/50 font-medium text-red-200" : "text-zinc-100"
                        }`}
                      >
                        {v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
