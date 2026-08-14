"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, ArrowUpRight, Trees, Building2 } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import type { LayerKey } from "@/components/map/CityMap";
import { api } from "@/lib/client";
import { cn, fmtCompact } from "@/lib/ui";

interface Growth {
  built_up_km2: Record<string, number>;
  growth_pct_2018_2026: number;
  parcels_urbanising: number;
  agri_to_built: number;
  corridors: { name: string; risk: string; historical_growth_pts: number; predicted_growth_pct: number; population: number }[];
}

const YEARS = [2018, 2022, 2026, 2030];

export default function GrowthPage() {
  const [growth, setGrowth] = React.useState<Growth | null>(null);
  const [year, setYear] = React.useState(2026);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    api<Growth>("/api/growth").then(setGrowth);
  }, []);

  const is2030 = year === 2030;
  const layers: LayerKey[] = is2030 ? ["boundary", "roads", "prediction"] : ["boundary", "roads", "parcels"];

  const chartData =
    growth &&
    [
      { year: "2018", km2: growth.built_up_km2["2018"] },
      { year: "2022", km2: growth.built_up_km2["2022"] },
      { year: "2026", km2: growth.built_up_km2["2026"] },
      { year: "2030*", km2: Math.round(growth.built_up_km2["2026"] + (growth.built_up_km2["2026"] - growth.built_up_km2["2022"])) },
    ];

  return (
    <div className="h-full flex">
      {/* left analytics */}
      <div className="w-[320px] shrink-0 h-full overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-5">
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted mb-1">
            <TrendingUp className="h-3.5 w-3.5" /> Built-up growth
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tnum text-ink">+{growth?.growth_pct_2018_2026 ?? "—"}%</span>
            <span className="text-[11px] text-dim mb-1">2018 → 2026</span>
          </div>
          <div className="h-28 mt-2 -mx-1">
            {mounted && chartData && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e2a3a" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: "#5f7189", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#5f7189", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#141d2b", border: "1px solid #2a3a4f", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#e6edf6" }}
                    formatter={(v) => [`${v} km²`, "Built-up"] as [string, string]}
                  />
                  <Area type="monotone" dataKey="km2" stroke="#38bdf8" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="text-[10px] text-dim mt-1">* 2030 linear projection</div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="panel p-3">
            <Building2 className="h-4 w-4 text-[var(--warning)] mb-1" />
            <div className="text-xl font-bold tnum text-ink">{growth?.parcels_urbanising ?? "—"}</div>
            <div className="text-[11px] text-dim">parcels rapidly urbanising</div>
          </div>
          <div className="panel p-3">
            <Trees className="h-4 w-4 text-[var(--good)] mb-1" />
            <div className="text-xl font-bold tnum text-ink">{growth?.agri_to_built ?? "—"}</div>
            <div className="text-[11px] text-dim">agri → built conversions</div>
          </div>
        </div>

        <div className="panel p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-2">Built-up by year</div>
          {growth &&
            YEARS.filter((y) => y !== 2030).map((y) => (
              <div key={y} className="flex items-center justify-between text-[13px] py-0.5">
                <span className="text-muted">{y}</span>
                <span className="tnum text-ink font-medium">{growth.built_up_km2[String(y)]} km²</span>
              </div>
            ))}
        </div>
      </div>

      {/* map + timeline */}
      <div className="relative flex-1 min-w-0">
        <MapView
          layers={layers}
          builtYear={is2030 ? null : year}
          parcelColorMode="development"
        />
        <div className="absolute top-3 left-3 panel px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-dim mb-1.5">
            {is2030 ? "2030 growth probability" : `Built-up intensity · ${year}`}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-28 rounded"
              style={{ background: is2030 ? "linear-gradient(to right,#1d4ed8,#eab308,#ef4444)" : "linear-gradient(to right,#0b2233,#0ea5e9,#eab308,#ef4444)" }}
            />
            <span className="text-[10px] text-dim">{is2030 ? "low → high" : "vacant → built"}</span>
          </div>
        </div>

        {/* Urban Time Machine */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 panel px-5 py-3 shadow-xl">
          <div className="text-[10px] uppercase tracking-wide text-dim mb-2 text-center">Urban Time Machine</div>
          <div className="flex items-center gap-1">
            {YEARS.map((y, i) => (
              <React.Fragment key={y}>
                <button
                  onClick={() => setYear(y)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 group",
                  )}
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full border-2 transition-all",
                      year === y
                        ? "border-[var(--accent)] bg-[var(--accent)] scale-125"
                        : "border-[var(--line-strong)] bg-[var(--panel-2)] group-hover:border-[var(--muted)]"
                    )}
                  />
                  <span className={cn("text-[12px] tnum", year === y ? "text-ink font-semibold" : "text-dim", y === 2030 && "italic")}>
                    {y}
                    {y === 2030 && "*"}
                  </span>
                </button>
                {i < YEARS.length - 1 && <span className="h-0.5 w-8 bg-[var(--line-strong)]" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* corridors */}
      <div className="w-[320px] shrink-0 h-full overflow-y-auto border-l border-[var(--line)] bg-[var(--bg-elev)]">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <div className="text-sm font-semibold text-ink">Growth Corridors</div>
          <div className="text-[11px] text-dim">Directions of urban expansion</div>
        </div>
        <div className="p-3 space-y-2.5">
          {growth?.corridors.map((c) => (
            <div key={c.name} className="panel p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold text-ink">{c.name}</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    color: c.risk.includes("Very") ? "#ef4444" : "#f97316",
                    background: c.risk.includes("Very") ? "#ef444418" : "#f9731618",
                  }}
                >
                  {c.risk}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="Historical" value={`+${c.historical_growth_pts}`} />
                <Metric label="2030 prob." value={`${c.predicted_growth_pct}%`} accent />
                <Metric label="Population" value={fmtCompact(c.population)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="tnum text-sm font-semibold" style={{ color: accent ? "var(--warning)" : "var(--text)" }}>
        {value}
      </div>
      <div className="text-[10px] text-dim flex items-center justify-center gap-0.5">
        {accent && <ArrowUpRight className="h-2.5 w-2.5" />}
        {label}
      </div>
    </div>
  );
}
