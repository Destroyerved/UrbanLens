"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, MoveRight, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PanelShell, Section } from "./PanelShell";
import { Switch } from "@/components/ui/switch";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { fetchGrowthSummary, fetchTransitions } from "@/services/growth";
import { LANDUSE_COLORS } from "@/lib/mapdata";
import type { LandUse, Year } from "@/types";
import { YEARS } from "@/types";
import { cn } from "@/lib/utils";

const LIKELIHOOD_FACTORS = [
  "Observed built-up change between 2018 and 2024 (Esri land cover)",
  "Recent 2022–2024 expansion momentum",
  "Road, population and urban-frontier development pressure",
  "Lower likelihood where land was already built-up in 2024",
];

export default function GrowthPanel() {
  const year = useApp((s) => s.year);
  const setYear = useApp((s) => s.setYear);
  const predictionOn = useApp((s) => s.predictionOn);
  const setPrediction = useApp((s) => s.setPrediction);
  const setMode = useApp((s) => s.setMode);
  const cityId = useApp((s) => s.city.id);
  const datasetVersion = useApp((s) => s.datasetVersion);

  const [summary, setSummary] = useState<{ builtUpKm2: Record<Year, number>; growthPct: number } | null>(null);
  const [transitions, setTransitions] = useState<{ from: LandUse; to: LandUse; areaHa: number }[]>([]);

  useEffect(() => {
    let current = true;
    setSummary(null);
    void fetchGrowthSummary().then((nextSummary) => {
      if (!current) return;
      setSummary(nextSummary);
    }).catch(() => {
      // The map remains usable from its bootstrap payload if an optional
      // explanatory request is unavailable.
      if (!current) return;
      setSummary(null);
    });
    return () => {
      current = false;
    };
  }, [cityId, datasetVersion]);

  useEffect(() => {
    const from: Year = year === 2018 ? 2018 : year === 2022 ? 2018 : 2022;
    if (year === 2018) {
      setTransitions([]);
    } else {
      fetchTransitions(from, year).then((t) => setTransitions(t.slice(0, 5)));
    }
  }, [year]);

  const chartData = useMemo(
    () =>
      summary
        ? YEARS.map((y) => ({ year: `${y}`, km2: summary.builtUpKm2[y] }))
        : [],
    [summary]
  );

  return (
    <PanelShell
      title="Urban Time Machine"
      caption="Observed expansion · land-use change · 2030 outlook"
    >
      {/* Year scrubber */}
      <Section label="Observation Year">
        <div className="glass-card relative grid grid-cols-3 rounded-2xl p-1 shadow-sm">
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                "relative z-10 h-9 rounded-xl text-[13px] font-semibold transition-all num cursor-pointer",
                year === y ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {year === y && (
                <motion.span
                  layoutId="year-pill"
                  className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-accent shadow-md shadow-accent/30"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              {y}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-muted-foreground">Built-up extent</span>
          {summary && (
            <span className="num text-[12.5px] font-bold text-foreground">
              <AnimatedNumber value={summary.builtUpKm2[year]} format={(n) => `${Math.round(n)} km²`} />
            </span>
          )}
        </div>
      </Section>

      {/* Growth chart */}
      {summary && (
        <Section
          label="Built-Up Trajectory"
          right={
            <span className="num rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              +{summary.growthPct}% since 2018 (observed)
            </span>
          }
        >
          <GlowCard
            glowColor="rgba(56, 189, 248, 0.2)"
            borderGlowColor="rgba(56, 189, 248, 0.5)"
            className="h-[115px] p-2.5 shadow-sm"
            interactive={false}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  contentStyle={{
                    background: "var(--glass-bg-strong)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: 12,
                    fontSize: 11,
                    boxShadow: "var(--shadow-2)",
                  }}
                  formatter={(v) => [`${v} km²`, "Built-up"]}
                />
                <Area
                  type="monotone"
                  dataKey="km2"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2.5}
                  fill="url(#growthFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </GlowCard>
        </Section>
      )}

      {/* Transitions */}
      <Section label={year === 2018 ? "Land-Use Transitions" : `Transitions → ${year}`}>
        {year === 2018 ? (
          <div className="glass-card rounded-2xl p-3.5 text-center text-[11px] text-muted-foreground">
            2018 is the baseline year — scrub forward to see change.
          </div>
        ) : (
          <div className="space-y-1.5">
            {transitions.map((t, i) => (
              <GlowCard
                key={`${t.from}-${t.to}`}
                glowColor="rgba(245, 158, 11, 0.2)"
                borderGlowColor="rgba(245, 158, 11, 0.5)"
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                interactive={true}
              >
                <span className="h-2.5 w-2.5 rounded-[4px] ring-1 ring-black/15 dark:ring-white/20" style={{ background: LANDUSE_COLORS[t.from] }} />
                <span className="text-[11.5px] font-medium capitalize">{t.from}</span>
                <MoveRight size={12} className="text-muted-foreground" />
                <span className="h-2.5 w-2.5 rounded-[4px] ring-1 ring-black/15 dark:ring-white/20" style={{ background: LANDUSE_COLORS[t.to] }} />
                <span className="text-[11.5px] font-medium capitalize">{t.to}</span>
                <span className="num ml-auto text-[11.5px] font-bold text-warning">
                  +{t.areaHa} ha
                </span>
              </GlowCard>
            ))}
          </div>
        )}
      </Section>

      {/* 2030 outlook */}
      <Section label="2030 Expansion Likelihood">
        <GlowCard
          glowColor="rgba(56, 189, 248, 0.2)"
          borderGlowColor="rgba(56, 189, 248, 0.5)"
          className="p-3.5 shadow-sm"
          interactive={false}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12.5px] font-semibold text-foreground">Likelihood overlay</div>
              <div className="text-[10.5px] text-muted-foreground">
                Esri 2018–2024 growth + network pressure
              </div>
            </div>
            <Switch checked={predictionOn} onCheckedChange={setPrediction} />
          </div>
          {predictionOn && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="overflow-hidden"
            >
              <div className="mt-3 border-t border-border/70 pt-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-accent">
                  <TrendingUp size={12} /> Why are these areas more likely to expand?
                </div>
                <ul className="space-y-1">
                  {LIKELIHOOD_FACTORS.map((w) => (
                    <li key={w} className="flex gap-1.5 text-[11px] text-muted-foreground">
                      <span className="mt-0.5 text-accent font-bold">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </GlowCard>
      </Section>

      <button
        type="button"
        onClick={() => setMode("infrastructure")}
        className="group flex w-full items-center justify-center gap-1.5 rounded-2xl bg-accent/15 py-2.5 text-[12px] font-semibold text-accent ring-1 ring-accent/30 shadow-sm transition-all hover:bg-accent/25 hover:scale-[1.01] active:scale-95 cursor-pointer"
      >
        Next: find the infrastructure gap
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </PanelShell>
  );
}
