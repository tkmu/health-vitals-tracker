"use client";

import type { ParameterCatalogEntry } from "@/lib/parameter-catalog";
import { PARAMETER_BY_KEY } from "@/lib/parameter-catalog";
import type { PivotRow } from "@/lib/pivot-measurements";
import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#38bdf8"];

function shortLabel(p: ParameterCatalogEntry): string {
  const t = p.label.split("(")[0]?.trim() ?? p.key;
  return t.length > 18 ? `${t.slice(0, 16)}…` : t;
}

function normalOverlay(p: ParameterCatalogEntry | undefined, multi: boolean): React.ReactNode[] {
  if (!p) return [];
  const nodes: React.ReactNode[] = [];

  if (!multi) {
    if (p.bounds === "between" && p.lower != null && p.upper != null) {
      nodes.push(
        <ReferenceArea
          key="band"
          y1={p.lower}
          y2={p.upper}
          strokeOpacity={0}
          fill="#34d399"
          fillOpacity={0.14}
          ifOverflow="extendDomain"
        />,
      );
    } else if (p.bounds === "lte" && p.upper != null) {
      nodes.push(
        <ReferenceArea
          key="lte"
          y1={0}
          y2={p.upper}
          strokeOpacity={0}
          fill="#34d399"
          fillOpacity={0.12}
          ifOverflow="extendDomain"
        />,
      );
    } else if (p.bounds === "gte" && p.lower != null) {
      nodes.push(
        <ReferenceLine
          key="gte-line"
          y={p.lower}
          stroke="#34d399"
          strokeDasharray="5 5"
          strokeOpacity={0.9}
          label={{ value: `Normal ≥ ${p.lower} ${p.unit}`, fill: "#6ee7b7", fontSize: 10 }}
        />,
      );
    }
    return nodes;
  }

  if (p.bounds === "between" && p.lower != null && p.upper != null) {
    nodes.push(
      <ReferenceLine
        key={`${p.key}-lo`}
        y={p.lower}
        stroke="#52525b"
        strokeDasharray="4 4"
        label={{ value: `${shortLabel(p)} min`, fill: "#a1a1aa", fontSize: 9 }}
      />,
      <ReferenceLine
        key={`${p.key}-hi`}
        y={p.upper}
        stroke="#52525b"
        strokeDasharray="4 4"
        label={{ value: `${shortLabel(p)} max`, fill: "#a1a1aa", fontSize: 9 }}
      />,
    );
  } else if (p.bounds === "lte" && p.upper != null) {
    nodes.push(
      <ReferenceLine
        key={`${p.key}-u`}
        y={p.upper}
        stroke="#52525b"
        strokeDasharray="4 4"
        label={{
          value: `${shortLabel(p)} ≤ ${p.upper}`,
          fill: "#a1a1aa",
          fontSize: 9,
        }}
      />,
    );
  } else if (p.bounds === "gte" && p.lower != null) {
    nodes.push(
      <ReferenceLine
        key={`${p.key}-l`}
        y={p.lower}
        stroke="#52525b"
        strokeDasharray="4 4"
        label={{
          value: `${shortLabel(p)} ≥ ${p.lower}`,
          fill: "#a1a1aa",
          fontSize: 9,
        }}
      />,
    );
  }
  return nodes;
}

export function VitalsChart({
  title,
  data,
  keys,
  yLabel,
}: {
  title: string;
  data: PivotRow[];
  keys: string[];
  yLabel: string;
}) {
  const multi = keys.length > 1;
  const defs = keys.map((k) => PARAMETER_BY_KEY.get(k)).filter(Boolean) as ParameterCatalogEntry[];

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-950/90 to-zinc-900/40 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h3>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300/90">
          Normal range
        </span>
      </div>
      <div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={data} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              label={{
                value: yLabel,
                angle: -90,
                position: "insideLeft",
                fill: "#71717a",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #27272a",
                borderRadius: 12,
                color: "#e4e4e7",
              }}
              labelStyle={{ color: "#a1a1aa" }}
            />
            <Legend wrapperStyle={{ color: "#d4d4d8", fontSize: 12 }} />
            {!multi && defs[0] ? normalOverlay(defs[0], false) : null}
            {multi ? defs.flatMap((d) => normalOverlay(d, true)) : null}
            {keys.map((k, i) => {
              const p = PARAMETER_BY_KEY.get(k);
              const name = p?.label ?? k;
              return (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={name}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2.2}
                  dot={{ r: 3.5, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                >
                  <LabelList
                    dataKey={k}
                    position="top"
                    formatter={(v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v.toFixed(1)) : "")}
                    fill="#e4e4e7"
                    fontSize={10}
                  />
                </Line>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
