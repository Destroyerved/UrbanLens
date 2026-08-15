import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Semantic tone for a 0–100 score. Meaning is theme-invariant. */
export function scoreTone(score: number): "good" | "moderate" | "warning" | "critical" {
  if (score >= 75) return "good";
  if (score >= 55) return "moderate";
  if (score >= 35) return "warning";
  return "critical";
}

export const toneText: Record<string, string> = {
  good: "text-good",
  moderate: "text-moderate",
  warning: "text-warning",
  critical: "text-critical",
};

export const toneBg: Record<string, string> = {
  good: "bg-good",
  moderate: "bg-moderate",
  warning: "bg-warning",
  critical: "bg-critical",
};
