"use client";

import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle, Landmark, ArrowRight } from "lucide-react";
import { PanelShell, Section, LoadingBlock } from "./PanelShell";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { GlowCard } from "@/components/ui/spotlight-card";
import { fetchCityKpis } from "@/services/infrastructure";
import { useApp } from "@/lib/store";
import { formatCompact, formatNumber } from "@/lib/utils";
import { ProvenanceSection } from "@/components/shared/ProvenanceSection";

type Kpis = Awaited<ReturnType<typeof fetchCityKpis>>;

function Kpi({
  label,
  value,
  format,
  accent,
  note,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  accent?: "good" | "warning" | "critical" | "gov" | "accent";
  note?: string;
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

  const glow =
    accent === "good"
      ? "rgba(34, 197, 94, 0.05)"
      : accent === "warning"
        ? "rgba(245, 158, 11, 0.05)"
        : accent === "critical"
          ? "rgba(239, 68, 68, 0.05)"
          : accent === "gov"
            ? "rgba(168, 85, 247, 0.05)"
            : "rgba(56, 189, 248, 0.05)";

  const borderGlow =
    accent === "good"
      ? "rgba(34, 197, 94, 0.4)"
      : accent === "warning"
        ? "rgba(245, 158, 11, 0.4)"
        : accent === "critical"
          ? "rgba(239, 68, 68, 0.4)"
          : accent === "gov"
            ? "rgba(168, 85, 247, 0.4)"
            : "rgba(56, 189, 248, 0.45)";

  return (
    <GlowCard
      glowColor={glow}
      borderGlowColor={borderGlow}
      className="p-3"
      interactive={true}
    >
      <div className={`num text-[20px] font-bold leading-none ${color}`}>
        <AnimatedNumber value={value} format={format ?? ((n) => `${Math.round(n)}`)} />
      </div>
      <div className="mt-1.5 text-[10.5px] font-medium leading-tight text-muted-foreground">{label}</div>
      {note && (
        <div className="mt-0.5 text-[9.5px] leading-tight text-muted-foreground/70" title={note}>
          {note}
        </div>
      )}
    </GlowCard>
  );
}

export default function OverviewPanel() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState(false);
  const setMode = useApp((s) => s.setMode);
  const datasetVersion = useApp((s) => s.datasetVersion);
  const cityLoading = useApp((s) => s.cityLoading);
  const city = useApp((s) => s.city);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);

  useEffect(() => {
    // Clear immediately on any switch so the previous area's numbers can
    // never linger under the new district's title.
    let cancelled = false;
    setKpis(null);
    setError(false);
    // Wait out the dataset swap exactly like the map layers do: once the
    // prebuilt bootstrap has landed, KPIs resolve from its analytics cache
    // with no engine round-trip — same beat as the parcels rendering.
    if (datasetVersion === 0 || cityLoading) {
      return () => {
        cancelled = true;
      };
    }
    fetchCityKpis()
      .then((k) => {
        if (!cancelled) setKpis(k);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetVersion, city?.id, cityLoading]);

  return (
    <PanelShell
      title={`${city.name} Command Center`}
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
              <Kpi label="Est. population (2026)" value={kpis.population} format={formatCompact} note="Census 2011 × growth · model-split" />
              <Kpi
                label="Observed built-up growth since 2018"
                value={kpis.growthPct}
                format={(n) => `+${Math.round(n)}%`}
                accent="accent"
                note="Esri satellite land cover · 2018–2024"
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
              <Kpi
                label="GLIS parcels tracked"
                value={kpis.totalParcels}
                format={(n) => formatNumber(n)}
              />
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
              <GlowCard
                onClick={() => setMode("growth")}
                glowColor="rgba(56, 189, 248, 0.04)"
                borderGlowColor="rgba(56, 189, 248, 0.4)"
                className="group flex w-full items-center gap-2.5 p-3"
                interactive={true}
              >
                <TrendingUp size={16} className="shrink-0 text-accent" />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-foreground">
                    {kpis.topCorridor
                      ? `${kpis.topCorridor.name} under the strongest growth pressure`
                      : "NW corridor expanding rapidly"}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {kpis.topCorridor
                      ? `${kpis.topCorridor.growthPct}% modelled development pressure · ${formatCompact(
                          kpis.topCorridor.population,
                        )} residents`
                      : "Gota & Chandkheda population up ~2.5× since 2018"}
                  </div>
                </div>
                <ArrowRight size={13} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </GlowCard>
              <GlowCard
                onClick={() => setMode("infrastructure")}
                glowColor="rgba(245, 158, 11, 0.04)"
                borderGlowColor="rgba(245, 158, 11, 0.4)"
                className="group flex w-full items-center gap-2.5 p-3"
                interactive={true}
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
              </GlowCard>
              <GlowCard
                onClick={() => setMode("land")}
                glowColor="rgba(168, 85, 247, 0.04)"
                borderGlowColor="rgba(168, 85, 247, 0.4)"
                className="group flex w-full items-center gap-2.5 p-3"
                interactive={true}
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
              </GlowCard>
            </div>
          </Section>

          <Section label="Start the Planning Journey">
            <GlowCard
              glowColor="rgba(56, 189, 248, 0.25)"
              borderGlowColor="rgba(56, 189, 248, 0.5)"
              className="p-3.5 border-accent/30 bg-accent/10 shadow-sm"
              interactive={false}
            >
              <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Detect growth</span> → find the
                infrastructure gap → identify land → recommend a site → simulate impact →
                explain the decision.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("growth")}
                  className="h-8 rounded-xl bg-accent px-3 text-[11.5px] font-semibold text-accent-foreground shadow-sm transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  Begin with Urban Growth
                </button>
                <button
                  type="button"
                  onClick={() => setCopilotOpen(true)}
                  className="glass h-8 rounded-xl px-3 text-[11.5px] font-semibold text-foreground transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  Ask Copilot
                </button>
              </div>
            </GlowCard>
          </Section>

          <ProvenanceSection />
        </>
      )}
    </PanelShell>
  );
}
