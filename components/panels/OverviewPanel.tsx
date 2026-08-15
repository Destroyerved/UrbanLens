"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Landmark, TrendingUp } from "lucide-react";
import { PanelShell, Section, LoadingBlock } from "./PanelShell";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { fetchCityKpis } from "@/services/infrastructure";
import { useApp } from "@/lib/store";
import { formatCompact } from "@/lib/utils";
import { ACTIVE_CITY } from "@/config/city";

type Kpis = Awaited<ReturnType<typeof fetchCityKpis>>;

function Kpi({
  label,
  value,
  format,
  accent,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  accent?: "good" | "warning" | "critical" | "gov" | "accent";
}) {
  const color =
    accent === "good"
      ? "text-good"
      : accent === "warning"
        ? "text-warning"
        : accent === "critical"
          ? "text-critical"
          : accent === "gov"
            ? "text-gov"
            : accent === "accent"
              ? "text-accent"
              : "text-foreground";
  return (
    <div className="glass-card rounded-2xl p-3">
      <div className={`num text-[20px] font-bold leading-none ${color}`}>
        <AnimatedNumber value={value} format={format ?? ((n) => `${Math.round(n)}`)} />
      </div>
      <div className="mt-1.5 text-[10.5px] font-medium leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

export default function OverviewPanel() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState(false);
  const setMode = useApp((s) => s.setMode);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);

  useEffect(() => {
    fetchCityKpis()
      .then(setKpis)
      .catch(() => setError(true));
  }, []);

  return (
    <PanelShell
      title={`${ACTIVE_CITY.name} Command Center`}
      caption="City-wide planning intelligence at a glance"
    >
      {error ? (
        <div className="text-[12px] text-critical">Failed to load city metrics.</div>
      ) : !kpis ? (
        <LoadingBlock label="Computing city intelligence…" />
      ) : (
        <>
          <Section label="City Pulse">
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Population (2026)" value={kpis.population} format={formatCompact} />
              <Kpi
                label="Built-up growth since 2018"
                value={kpis.growthPct}
                format={(n) => `+${Math.round(n)}%`}
                accent="accent"
              />
              <Kpi
                label="Healthcare coverage"
                value={kpis.healthcareCoveragePct}
                format={(n) => `${Math.round(n)}%`}
                accent="warning"
              />
              <Kpi
                label="Residents beyond hospital reach"
                value={kpis.underservedPop}
                format={formatCompact}
                accent="critical"
              />
              <Kpi label="GLIS parcels tracked" value={kpis.totalParcels} />
              <Kpi
                label="Vacant government land"
                value={kpis.vacantGovtHa}
                format={(n) => `${Math.round(n)} ha`}
                accent="gov"
              />
            </div>
          </Section>

          <Section label="Planning Signals">
            <div className="space-y-2">
              <button
                onClick={() => setMode("growth")}
                className="glass-card group flex w-full items-center gap-2.5 rounded-2xl p-3 text-left transition-all hover:scale-[1.01] hover:border-accent/50"
              >
                <TrendingUp size={16} className="shrink-0 text-accent" />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-foreground">NW corridor expanding rapidly</div>
                  <div className="text-[10.5px] text-muted-foreground">
                    Gota &amp; Chandkheda population up ~2.5× since 2018
                  </div>
                </div>
                <ArrowRight size={13} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => setMode("infrastructure")}
                className="glass-card group flex w-full items-center gap-2.5 rounded-2xl p-3 text-left transition-all hover:scale-[1.01] hover:border-warning/50"
              >
                <AlertTriangle size={16} className="shrink-0 text-warning" />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-foreground">
                    {kpis.deficitWards} wards below infrastructure baseline
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {formatCompact(kpis.underservedPop)} residents beyond 3.5 km of a hospital
                  </div>
                </div>
                <ArrowRight size={13} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => setMode("land")}
                className="glass-card group flex w-full items-center gap-2.5 rounded-2xl p-3 text-left transition-all hover:scale-[1.01] hover:border-gov/50"
              >
                <Landmark size={16} className="shrink-0 text-gov" />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-foreground">
                    {kpis.govtParcels} government parcels · {kpis.zoningConflicts} zoning conflicts
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    Development opportunities &amp; compliance flags
                  </div>
                </div>
                <ArrowRight size={13} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </Section>

          <Section label="Start the Planning Journey">
            <div className="glass-card rounded-2xl p-3.5 border-accent/30 bg-accent/10 shadow-sm">
              <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Detect growth</span> → find the
                infrastructure gap → identify land → recommend a site → simulate impact →
                explain the decision.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setMode("growth")}
                  className="h-8 rounded-xl bg-accent px-3 text-[11.5px] font-semibold text-accent-foreground shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                >
                  Begin with Urban Growth
                </button>
                <button
                  onClick={() => setCopilotOpen(true)}
                  className="glass h-8 rounded-xl px-3 text-[11.5px] font-semibold text-foreground transition-all hover:scale-[1.02] active:scale-95"
                >
                  Ask Copilot
                </button>
              </div>
            </div>
          </Section>
        </>
      )}
    </PanelShell>
  );
}
