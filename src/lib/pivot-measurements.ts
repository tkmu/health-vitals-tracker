export type MeasurementRow = {
  parameterKey: string;
  value: number;
  unit: string;
  measuredAt: string;
  reportFileId: string;
};

export type PivotRow = Record<string, string | number | undefined> & { t: number; dateLabel: string };

export function pivotByDate(rows: MeasurementRow[]): PivotRow[] {
  const byDate = new Map<number, Record<string, number>>();
  const labels = new Map<number, string>();

  for (const r of rows) {
    const d = new Date(r.measuredAt);
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (!byDate.has(day)) {
      byDate.set(day, {});
      labels.set(day, d.toISOString().slice(0, 10));
    }
    const bucket = byDate.get(day)!;
    bucket[r.parameterKey] = r.value;
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, vals]) => ({
      t,
      dateLabel: labels.get(t)!,
      ...vals,
    }));
}

export function uniqueSortedDates(rows: MeasurementRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    set.add(new Date(r.measuredAt).toISOString().slice(0, 10));
  }
  return [...set].sort();
}
