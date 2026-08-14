"use client";

import * as React from "react";
import { cn, scoreColor } from "@/lib/ui";

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[13px] font-semibold tracking-wide text-ink uppercase">{title}</h3>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "accent" | "good" | "warning" | "critical" | "gov" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneColor =
    tone === "good"
      ? "var(--good)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "critical"
          ? "var(--critical)"
          : tone === "gov"
            ? "var(--gov)"
            : tone === "accent"
              ? "var(--accent)"
              : "var(--text-muted)";
  return (
    <div className="panel px-4 py-3.5 relative overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: toneColor, opacity: 0.9 }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
        {icon && <span className="text-dim">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tnum text-ink leading-none">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function ScoreBar({
  label,
  value,
  max = 100,
  hint,
  color,
}: {
  /** Node rather than string so callers can append badges (e.g. data-confidence). */
  label: React.ReactNode;
  value: number;
  max?: number;
  hint?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color ?? scoreColor(value);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="tnum font-medium text-ink">
          {Math.round(value)}
          {hint && <span className="text-dim ml-1">{hint}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: c }}
        />
      </div>
    </div>
  );
}

export function ScoreDonut({
  value,
  size = 92,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = scoreColor(value);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--panel-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tnum" style={{ color }}>
          {Math.round(value)}
        </span>
        {label && <span className="text-[10px] text-dim uppercase tracking-wide">{label}</span>}
      </div>
    </div>
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
        className
      )}
      style={
        color
          ? { color, borderColor: `${color}55`, background: `${color}18` }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg bg-[var(--panel-2)] p-0.5 border border-[var(--line)]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
            value === o.value
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  accent = "var(--accent)",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accent?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 appearance-none rounded-full cursor-pointer outline-none"
      style={{
        background: `linear-gradient(to right, ${accent} ${pct}%, var(--panel-2) ${pct}%)`,
      }}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted text-xs">
      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)] animate-spin" />
      {label}
    </div>
  );
}

export function DemoBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: "var(--moderate)", background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)" }}
      title="Facilities & roads: real OpenStreetMap data. Parcels, wards & population: synthetic demo data (not official GLIS records)."
    >
      OSM + DEMO
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-dim py-8 text-center">{children}</div>;
}
