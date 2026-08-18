"use client";

import { motion } from "framer-motion";
import { X, Check, MapPin, FlaskConical, Scale, Trophy } from "lucide-react";
import { GlowCard } from "@/components/ui/spotlight-card";
import { SegmentedScoreBar } from "@/components/shared/ScoreBar";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { WARD_BY_ID } from "@/data/wards";
import { useApp } from "@/lib/store";
import { cn, scoreTone, toneText } from "@/lib/utils";

export default function CompareCandidatesPanel() {
  const setCompareOpen = useApp((s) => s.setCompareOpen);
  const candidates = useApp((s) => s.candidates);
  const siteProject = useApp((s) => s.siteProject);
  const selectParcel = useApp((s) => s.selectParcel);
  const flyTo = useApp((s) => s.flyTo);
  const setSimProject = useApp((s) => s.setSimProject);
  const setSimTarget = useApp((s) => s.setSimTarget);
  const setMode = useApp((s) => s.setMode);

  if (!candidates || candidates.length === 0) return null;

  const topCandidates = candidates.slice(0, 3);

  return (
    <motion.aside
      key="compare-candidates-panel"
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong pointer-events-auto absolute bottom-5 right-[384px] top-[76px] z-[30] flex w-[530px] max-w-[calc(100vw-420px)] flex-col max-h-[calc(100vh-96px)] overflow-hidden rounded-[26px] shadow-elev-3 backdrop-blur-2xl border border-white/25 dark:border-white/12"
    >
      {/* Header with generous padding and glass effect */}
      <div className="flex items-center justify-between border-b border-white/20 dark:border-white/10 bg-white/15 dark:bg-white/[0.05] px-5 py-4 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-8.5 w-8.5 place-items-center rounded-xl bg-accent/20 text-accent ring-1 ring-accent/50 shadow-sm shrink-0">
            <Scale size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-foreground truncate leading-tight">Candidate Sites Comparison</div>
            <div className="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5">
              Side-by-side evaluation for <span className="capitalize font-semibold text-foreground">{siteProject}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          aria-label="Close comparison"
          className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-surface-3 hover:text-foreground active:scale-95 cursor-pointer shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="panel-scroll flex-1 overflow-y-auto p-5 space-y-4">
        {/* Candidate Cards Grid */}
        <div className={cn("grid gap-3", topCandidates.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {topCandidates.map((c) => (
            <GlowCard
              key={c.parcelId}
              glowColor={c.rank === 1 ? "rgba(56, 189, 248, 0.08)" : "rgba(168, 85, 247, 0.05)"}
              borderGlowColor={c.rank === 1 ? "rgba(56, 189, 248, 0.6)" : "rgba(168, 85, 247, 0.35)"}
              className={cn(
                "p-3.5 rounded-2xl relative flex flex-col justify-between",
                c.rank === 1 && "ring-1 ring-accent/60 bg-accent/10"
              )}
              interactive={false}
            >
              <div>
                {/* Clean Rank Badge */}
                <div className="flex items-center justify-between">
                  {c.rank === 1 ? (
                    <div className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-extrabold text-accent ring-1 ring-accent/50 shadow-xs">
                      <span>#1</span>
                      <span className="text-[9px] uppercase tracking-wider text-accent/90">TOP</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center rounded-full bg-white/10 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-foreground/80 ring-1 ring-white/15">
                      <span>#{c.rank}</span>
                    </div>
                  )}
                </div>

                <div className="mt-2 min-w-0">
                  <div className="num text-[13px] font-bold text-foreground truncate">{c.parcelId}</div>
                  <div className="text-[10.5px] text-muted-foreground truncate">
                    {WARD_BY_ID.get(c.parcel.wardId)?.name ?? "Ward"}
                  </div>
                </div>

                <div className="mt-2.5 flex items-baseline justify-between border-t border-border/50 pt-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Score</span>
                  <span className={cn("num text-[19px] font-bold leading-none", toneText[scoreTone(c.score)])}>
                    <AnimatedNumber value={c.score} duration={800} />
                    <span className="text-[10px] text-muted-foreground font-normal"> /100</span>
                  </span>
                </div>

                <SegmentedScoreBar factors={c.factors} className="mt-2" animate={c.rank === 1} />
              </div>

              <div className="mt-3.5 flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    flyTo(c.parcel.centroid, 14);
                    selectParcel(c.parcelId, true);
                  }}
                  className="glass flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-bold text-foreground/90 transition-all hover:scale-[1.02] hover:text-accent hover:border-accent/40 active:scale-95 cursor-pointer"
                >
                  <MapPin size={12} className="text-accent shrink-0" />
                  <span>Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSimProject(siteProject);
                    setSimTarget(c.parcelId);
                    setMode("simulator");
                  }}
                  className="glass flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-accent/25 text-accent font-bold ring-1 ring-accent/50 shadow-xs transition-all hover:scale-[1.02] hover:bg-accent hover:text-accent-foreground active:scale-95 cursor-pointer"
                >
                  <FlaskConical size={12} className="shrink-0" />
                  <span>Sim</span>
                </button>
              </div>
            </GlowCard>
          ))}
        </div>

        {/* Detailed Factor Comparison Table */}
        <div className="glass rounded-2xl p-4 border border-border/60">
          <div className="label-caps mb-3 font-bold text-muted-foreground text-[10px]">Detailed Metric Breakdown</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-border/70 text-muted-foreground text-[10px] uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold pr-2">Evaluation Factor</th>
                  {topCandidates.map((c) => (
                    <th key={c.parcelId} className="pb-2.5 font-bold text-foreground px-2">
                      {c.parcelId} {c.rank === 1 && "★"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Ownership</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold capitalize">
                      <span className={c.parcel.ownership === "government" ? "text-good font-bold" : "text-foreground"}>
                        {c.parcel.ownership}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Land Area</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold num whitespace-nowrap">
                      {c.parcel.areaHa} ha ({(c.parcel.areaHa * 2.471).toFixed(1)} ac)
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Current Use</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold capitalize">
                      {c.parcel.landUse}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Flood Risk</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold capitalize">
                      <span className={c.parcel.floodRisk === "low" ? "text-good" : c.parcel.floodRisk === "medium" ? "text-warning" : "text-critical"}>
                        {c.parcel.floodRisk}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">3 km Catchment</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold num whitespace-nowrap">
                      {c.parcel.population3km.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Road Distance</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold num whitespace-nowrap">
                      {c.parcel.roadDistKm} km
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Transit Distance</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold num whitespace-nowrap">
                      {c.parcel.transitDistKm} km
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Infra Readiness</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 font-semibold num text-accent">
                      {c.parcel.infraReadiness}/100
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-muted-foreground pr-2">Top Strength</td>
                  {topCandidates.map((c) => (
                    <td key={c.parcelId} className="py-2.5 px-2 text-[11px]">
                      <div className="flex items-start gap-1 text-good leading-snug">
                        <Check size={12} className="mt-0.5 shrink-0" />
                        <span>{c.strengths[0] ?? "Well connected"}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer with clean Close button and glass effect */}
      <div className="flex items-center justify-end border-t border-white/20 dark:border-white/10 bg-white/15 dark:bg-white/[0.05] px-5 py-3.5 backdrop-blur-xl shrink-0">
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          className="glass px-4 py-1.5 rounded-xl font-bold text-[11.5px] hover:bg-white/20 dark:hover:bg-white/10 text-foreground transition-all hover:scale-102 active:scale-95 cursor-pointer shadow-xs"
        >
          Close
        </button>
      </div>
    </motion.aside>
  );
}
