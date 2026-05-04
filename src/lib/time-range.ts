export type RangePresetId =
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "18m"
  | "2y"
  | "3y"
  | "5y"
  | "8y"
  | "10y";

export const RANGE_PRESETS: { id: RangePresetId; label: string; days: number }[] = [
  { id: "1m", label: "1 month", days: 30 },
  { id: "3m", label: "3 months", days: 91 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "18m", label: "18 months", days: 548 },
  { id: "2y", label: "2 years", days: 730 },
  { id: "3y", label: "3 years", days: 1095 },
  { id: "5y", label: "5 years", days: 1826 },
  { id: "8y", label: "8 years", days: 2922 },
  { id: "10y", label: "10 years", days: 3652 },
];

export const DEFAULT_RANGE_ID: RangePresetId = "3y";

export function rangeFromPreset(id: RangePresetId, end = new Date()): { from: Date; to: Date } {
  const preset = RANGE_PRESETS.find((p) => p.id === id) ?? RANGE_PRESETS.find((p) => p.id === DEFAULT_RANGE_ID)!;
  const to = new Date(end);
  const from = new Date(to);
  from.setDate(from.getDate() - preset.days);
  return { from, to };
}
