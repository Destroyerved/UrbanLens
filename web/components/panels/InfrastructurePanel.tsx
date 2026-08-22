"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Crosshair, X, FileSpreadsheet } from "lucide-react";
import { PanelShell, Section, LoadingBlock } from "./PanelShell";
import { MiniScore } from "@/components/shared/ScoreBar";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { withRetry } from "@/lib/api";
import { fetchWardGaps, analyzeAccessibility } from "@/services/infrastructure";
import { WARD_BY_ID } from "@/data/wards";
import type { AccessibilityReport, GapCategory, WardGap } from "@/types";
import { cn, formatCompact, scoreTone, toneText } from "@/lib/utils";
import { downloadInfrastructureExport } from "@/lib/export";

const CATEGORIES: { id: GapCategory; label: string }[] = [
  { id: "healthcare", label: "Health" },
  { id: "education", label: "Schools" },
  { id: "parks", label: "Parks" },
  { id: "transport", label: "Transit" },
  { id: "safety", label: "Safety" },
];

export default function InfrastructurePanel() {
  const gapCategory = useApp((s) => s.gapCategory);
  const setGapCategory = useApp((s) => s.setGapCategory);
  const highlightWards = useApp((s) => s.highlightWards);
  const highlightedWardIds = useApp((s) => s.highlightedWardIds);
  const flyTo = useApp((s) => s.flyTo);
  const setMode = useApp((s) => s.setMode);
  const mapClick = useApp((s) => s.mapClick);
  const datasetVersion = useApp((s) => s.datasetVersion);
  const cityId = useApp((s) => s.city.id);

  const [gaps, setGaps] = useState<WardGap[] | null>(null);
  const [access, setAccess] = useState<AccessibilityReport | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);

  useEffect(() => {
    void withRetry(fetchWardGaps).then(setGaps).catch(() => setGaps(null));
  }, [cityId, datasetVersion]);

  useEffect(() => {
    if (!mapClick) return;
    setAccessLoading(true);
    analyzeAccessibility(mapClick).then((r) => {
      setAccess(r);
      setAccessLoading(false);
    });
  }, [mapClick]);

  const sorted = gaps
    ? [...gaps].sort((a, b) => a.scores[gapCategory] - b.scores[gapCategory])
    : null;

  return (
    <PanelShell
      title="Infrastructure Gap Analysis"
      caption="Coverage, deficits & the 15-minute city"
    >
      <Section label="Service Category">
        <div className="glass-card grid grid-cols-5 gap-1 rounded-2xl p-1 shadow-sm">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setGapCategory(c.id)}
              className={cn(
                "relative h-7 rounded-xl text-[10.5px] font-semibold transition-all cursor-pointer",
                gapCategory === c.id
                  ? "text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {gapCategory === c.id && (
                <motion.span
                  layoutId="gap-pill"
                  className="pointer-events-none absolute inset-0 -z-0 rounded-xl bg-accent shadow-md shadow-accent/30"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative z-10">{c.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        label="Ward Ranking · Worst First"
        right={
          <button
            type="button"
            onClick={() => void downloadInfrastructureExport(cityId)}
            className="glass hover:bg-accent/15 border-white/20 dark:border-white/10 text-muted-foreground hover:text-foreground px-2.5 py-1 text-[11px] font-bold leading-none rounded-full border transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            title="Download ward gap scores as CSV"
          >
            <FileSpreadsheet size={12.5} className="text-good shrink-0" />
            <span>Export CSV</span>
          </button>
        }
      >
        {!sorted ? (
          <LoadingBlock label="Computing ward coverage…" />
        ) : (
          <div className="space-y-1.5">
            {sorted.map((g) => {
              const score = g.scores[gapCategory];
              const active = highlightedWardIds.includes(g.wardId);
              return (
                <GlowCard
                  key={g.wardId}
                  onClick={() => {
                    highlightWards([g.wardId]);
                    const w = WARD_BY_ID.get(g.wardId);
                    if (w) flyTo(w.centroid, 12.1);
                  }}
                  glowColor={score < 40 ? "rgba(239, 68, 68, 0.05)" : "rgba(56, 189, 248, 0.05)"}
                  borderGlowColor={score < 40 ? "rgba(239, 68, 68, 0.45)" : "rgba(56, 189, 248, 0.45)"}
                  className={cn(
                    "w-full px-3 py-2.5 text-left",
                    active
                      ? "border-accent/60 bg-accent/15 ring-1 ring-accent/40"
                      : ""
                  )}
                >
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[12px] font-semibold text-foreground">{g.wardName}</span>
                    <span className="num text-[10.5px] font-medium text-muted-foreground">
                      {formatCompact(g.population)} residents
                    </span>
                  </div>
                  <MiniScore label={CATEGORIES.find((c) => c.id === gapCategory)!.label + " access"} score={score} />
                  {gapCategory === "healthcare" && g.affectedPopulation > 50000 && (
                    <div className="mt-1.5 text-[10.5px] font-medium text-critical">
                      {formatCompact(g.affectedPopulation)} beyond 3.5 km of a hospital
                    </div>
                  )}
                </GlowCard>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        label="15-Minute Analyzer"
        right={<Crosshair size={12} className="text-muted-foreground" />}
      >
        {accessLoading ? (
          <LoadingBlock label="Analyzing accessibility…" />
        ) : !access ? (
          <div className="glass-card rounded-2xl p-4 text-center text-[11px] text-muted-foreground">
            Click anywhere on the map to analyze
            <br />
            15-minute accessibility at that point.
          </div>
        ) : (
          <GlowCard
            glowColor="rgba(34, 197, 94, 0.05)"
            borderGlowColor="rgba(34, 197, 94, 0.45)"
            className="p-3.5 shadow-sm"
            interactive={false}
          >
            <div className="space-y-1.5">
              {access.items.map((it) => (
                <div key={it.label} className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-muted-foreground">{it.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="num font-semibold">{it.minutes} min</span>
                    {it.ok ? (
                      <Check size={13} className="text-good" />
                    ) : (
                      <X size={13} className="text-critical" />
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border/70 pt-2.5">
              <span className="label-caps font-bold">Accessibility Score</span>
              <span className={cn("num text-[18px] font-bold", toneText[scoreTone(access.score)])}>
                {access.score}
                <span className="text-[11px] font-normal text-muted-foreground"> / 100</span>
              </span>
            </div>
          </GlowCard>
        )}
      </Section>

      <button
        type="button"
        onClick={() => setMode("sites")}
        className="group flex w-full items-center justify-center gap-1.5 rounded-2xl bg-accent/15 py-2.5 text-[12px] font-semibold text-accent ring-1 ring-accent/30 shadow-sm transition-all hover:bg-accent/25 hover:scale-[1.01] active:scale-95 cursor-pointer"
      >
        Next: find the best site to intervene
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </PanelShell>
  );
}
