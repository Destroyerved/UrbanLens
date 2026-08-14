import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Continuous score → colour (red → amber → green), for 0..100 values. */
export function scoreColor(v: number): string {
  if (v >= 85) return "#22c55e";
  if (v >= 70) return "#84cc16";
  if (v >= 50) return "#eab308";
  if (v >= 30) return "#f97316";
  return "#ef4444";
}

export const TONE_COLOR: Record<string, string> = {
  excellent: "#22c55e",
  good: "#84cc16",
  moderate: "#eab308",
  poor: "#f97316",
  critical: "#ef4444",
};

/** Risk category → colour for growth prediction. */
export const RISK_COLOR: Record<string, string> = {
  very_low: "#1d4ed8",
  low: "#0ea5e9",
  medium: "#eab308",
  high: "#f97316",
  very_high: "#ef4444",
};

export const OWNERSHIP_COLOR: Record<string, string> = {
  government: "#3b82f6",
  private: "#64748b",
};

export const LAND_USE_COLOR: Record<string, string> = {
  residential: "#f59e0b",
  commercial: "#ef4444",
  industrial: "#a855f7",
  institutional: "#38bdf8",
  agriculture: "#84cc16",
  vacant: "#94a3b8",
  mixed: "#fb7185",
  green: "#22c55e",
  water: "#0ea5e9",
};

export const FLOOD_COLOR: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#ef4444",
};

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

/** Compact Indian-style number (K / L / Cr) for KPI tiles. */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return (n / 1e7).toFixed(2).replace(/\.00$/, "") + " Cr";
  if (abs >= 1e5) return (n / 1e5).toFixed(2).replace(/\.00$/, "") + " L";
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
