"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Building,
  Check,
  Factory,
  FileText,
  FlaskConical,
  Home,
  Hospital,
  Landmark,
  MapPin,
  Play,
  Scale,
  School,
  Store,
  Trees,
} from "lucide-react";
import { PanelShell, Section, EmptyBlock } from "./PanelShell";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SegmentedScoreBar } from "@/components/shared/ScoreBar";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { WARD_BY_ID } from "@/data/wards";
import { downloadRecommendationPdf } from "@/lib/export";
import type { ProjectType, SuitabilityWeights } from "@/types";
import { cn, scoreTone, toneText } from "@/lib/utils";

const PROJECTS: { id: ProjectType; label: string; icon: React.ReactNode }[] = [
  { id: "hospital", label: "Hospital", icon: <Hospital size={14} /> },
  { id: "school", label: "School", icon: <School size={14} /> },
  { id: "park", label: "Park", icon: <Trees size={14} /> },
  { id: "fire", label: "Fire Station", icon: <AlertTriangle size={14} /> },
  { id: "govt", label: "Govt Office", icon: <Landmark size={14} /> },
  { id: "residential", label: "Residential", icon: <Home size={14} /> },
  { id: "affordable", label: "Affordable Housing", icon: <Building size={14} /> },
  { id: "commercial", label: "Commercial", icon: <Store size={14} /> },
  { id: "industrial", label: "Industrial", icon: <Factory size={14} /> },
];

const WEIGHT_LABELS: { key: keyof SuitabilityWeights; label: string }[] = [
  { key: "accessibility", label: "Accessibility Need" },
  { key: "populationNeed", label: "Population Need" },
  { key: "transit", label: "Transit" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "environment", label: "Environment" },
  { key: "landCompatibility", label: "Land Compatibility" },
];

export default function SiteSelectionPanel() {
  const siteProject = useApp((s) => s.siteProject);
  const setSiteProject = useApp((s) => s.setSiteProject);
  const constraints = useApp((s) => s.siteConstraints);
  const setConstraints = useApp((s) => s.setSiteConstraints);
  const weights = useApp((s) => s.siteWeights);
  const setWeights = useApp((s) => s.setSiteWeights);
  const candidates = useApp((s) => s.candidates);
  const compareOpen = useApp((s) => s.compareOpen);
  const setCompareOpen = useApp((s) => s.setCompareOpen);
  const analysisRunning = useApp((s) => s.analysisRunning);
  const analysisError = useApp((s) => s.analysisError);
  const runAnalysis = useApp((s) => s.runAnalysis);
  const selectParcel = useApp((s) => s.selectParcel);
  const setSimTarget = useApp((s) => s.setSimTarget);
  const setSimProject = useApp((s) => s.setSimProject);
  const setMode = useApp((s) => s.setMode);
  const flyTo = useApp((s) => s.flyTo);
  const [configOpen, setConfigOpen] = useState(true);

  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);

  return (
    <PanelShell
      title="Smart Site Selection"
      caption="Constraint filtering + explainable weighted scoring"
    >
      <Section label="1 · Project Type">
        <div className="grid grid-cols-3 gap-1.5">
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSiteProject(p.id)}
              className={cn(
                "glass-card flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center transition-all hover:scale-[1.02] active:scale-95 cursor-pointer",
                siteProject === p.id
                  ? "border-accent/80 bg-accent/20 text-accent ring-1 ring-accent/50 font-semibold"
                  : "text-muted-foreground hover:border-accent/40 hover:text-foreground"
              )}
            >
              {p.icon}
              <span className="text-[9.5px] font-semibold leading-tight">{p.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        label="2 · Constraints & Weights"
        right={
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
          >
            {configOpen ? "Collapse" : "Expand"}
          </button>
        }
      >
        {configOpen && (
          <div className="space-y-3.5">
            <div className="space-y-2">
              <div className="label-caps">Hard Constraints</div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px]">Govt Land Only</span>
                <Switch
                  checked={constraints.governmentOnly}
                  onCheckedChange={(governmentOnly) => setConstraints({ governmentOnly })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px]">Exclude High Flood</span>
                <Switch
                  checked={constraints.lowFloodOnly}
                  onCheckedChange={(lowFloodOnly) => setConstraints({ lowFloodOnly })}
                />
              </div>
              <div>
                <div className="flex justify-between text-[11.5px]">
                  <span>Min Parcel Size</span>
                  <span className="num font-semibold text-accent">{constraints.minAreaHa} ha</span>
                </div>
                <Slider
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={[constraints.minAreaHa]}
                  onValueChange={([minAreaHa]) => setConstraints({ minAreaHa })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="space-y-2.5 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="label-caps">Scoring Weights</span>
                <span
                  className={cn(
                    "num text-[10px] font-semibold",
                    totalWeight === 100 ? "text-good" : "text-warning"
                  )}
                >
                  {totalWeight}% total
                </span>
              </div>
              {WEIGHT_LABELS.map(({ key, label }) => (
                <div key={key}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="num font-semibold">{weights[key]}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={50}
                    step={5}
                    value={[weights[key]]}
                    onValueChange={([v]) => setWeights({ [key]: v })}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <button
        type="button"
        disabled={analysisRunning}
        onClick={runAnalysis}
        className={cn(
          "flex h-9 w-full items-center justify-center gap-1.5 rounded-2xl text-[12px] font-bold shadow-elev-2 transition-all active:scale-95 cursor-pointer",
          analysisRunning
            ? "bg-accent/40 text-accent-foreground cursor-wait"
            : "bg-accent text-accent-foreground hover:opacity-90"
        )}
      >
        <Play size={14} className={cn("fill-current", analysisRunning && "animate-spin")} />
        {analysisRunning ? "Evaluating parcels…" : "Run Multi-Criteria Site Search"}
      </button>

      {analysisError && (
        <div className="text-[11.5px] font-medium text-critical">
          Could not run analysis — please relax constraints.
        </div>
      )}

      {candidates && candidates.length === 0 ? (
        <EmptyBlock
          title="0 sites found"
          hint="Constraints are too strict — lower the minimum area or allow private land."
        />
      ) : candidates ? (
        <Section
          label={`Best Sites · ${candidates.length} candidates`}
          className="mt-4"
          right={
            candidates.length >= 2 ? (
              <button
                type="button"
                onClick={() => setCompareOpen(!compareOpen)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-full border transition-all flex items-center gap-1.5 shadow-sm cursor-pointer",
                  compareOpen
                    ? "bg-accent text-accent-foreground border-accent shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                    : "glass hover:bg-accent/15 border-white/20 dark:border-white/10 text-muted-foreground hover:text-foreground"
                )}
              >
                <Scale size={13} />
                <span>Compare</span>
              </button>
            ) : undefined
          }
        >
          <div className="space-y-3">
            {candidates.map((c) => (
              <GlowCard
                key={c.parcelId}
                glowColor={c.rank === 1 ? "rgba(56, 189, 248, 0.08)" : "rgba(56, 189, 248, 0.04)"}
                borderGlowColor={c.rank === 1 ? "rgba(56, 189, 248, 0.6)" : "rgba(56, 189, 248, 0.4)"}
                className={cn(
                  "p-4 shadow-md rounded-2xl",
                  c.rank === 1
                    ? "border-accent/80 bg-accent/15 ring-1 ring-accent/50"
                    : ""
                )}
                interactive={false}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "num grid h-5 w-5 place-items-center rounded-md text-[11px] font-bold",
                          c.rank === 1 ? "bg-accent text-accent-foreground" : "bg-surface-3 text-muted-foreground"
                        )}
                      >
                        {c.rank}
                      </span>
                      <span className="num text-[13.5px] font-bold">{c.parcelId}</span>
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {WARD_BY_ID.get(c.parcel.wardId)?.name} · {c.parcel.areaHa} ha ·{" "}
                      {c.parcel.ownership === "government" ? "Government" : "Private"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("num text-[20px] font-bold leading-none", toneText[scoreTone(c.score)])}>
                      <AnimatedNumber value={c.score} duration={600} />
                    </div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">/100</div>
                  </div>
                </div>

                <SegmentedScoreBar factors={c.factors} className="mt-2.5" animate={c.rank === 1} />

                {c.rank === 1 && (
                  <div className="glass mt-3 rounded-xl p-2.5">
                    <div className="label-caps mb-1.5 font-bold">Why this site ranked #1</div>
                    <div className="space-y-1">
                      {c.strengths.slice(0, 6).map((s) => (
                        <div key={s} className="flex gap-1.5 text-[11px]">
                          <Check size={12} className="mt-px shrink-0 text-good font-bold" />
                          <span>{s}</span>
                        </div>
                      ))}
                      {c.concerns.map((s) => (
                        <div key={s} className="flex gap-1.5 text-[11px]">
                          <AlertTriangle size={12} className="mt-px shrink-0 text-warning" />
                          <span className="text-muted-foreground">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Candidate Action Buttons */}
                <div className="mt-3 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSimProject(siteProject);
                      setSimTarget(c.parcelId);
                      setMode("simulator");
                    }}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-accent-foreground text-[12px] font-bold shadow-[0_0_14px_rgba(56,189,248,0.3)] transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
                  >
                    <FlaskConical size={13} />
                    <span>🧪 Simulate on this Site</span>
                  </button>

                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => flyTo(c.parcel.centroid, 13.8)}
                      className="glass flex h-7 items-center justify-center gap-1 rounded-lg text-[10.5px] font-semibold text-muted-foreground hover:text-foreground transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <MapPin size={10} /> Locate
                    </button>
                    <button
                      type="button"
                      onClick={() => selectParcel(c.parcelId, true)}
                      // "Parcel" alone says nothing about what the control
                      // does, to a screen reader or to verify-ui.mjs, which
                      // looks for this affordance by accessible name.
                      aria-label={`Open parcel ${c.parcelId}`}
                      className="glass flex h-7 items-center justify-center rounded-lg text-[10.5px] font-semibold text-muted-foreground hover:text-foreground transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      Parcel
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadRecommendationPdf(c.parcelId, siteProject)}
                      className="glass flex h-7 items-center justify-center gap-1 rounded-lg text-[10.5px] font-semibold text-muted-foreground hover:text-foreground transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <FileText size={10} /> PDF
                    </button>
                  </div>
                </div>
              </GlowCard>
            ))}
          </div>
          {candidates[0] && (
            <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <Badge tone="accent">EXPLAINABLE</Badge>
              Hover any score bar segment to see the factor, weight and evidence.
            </div>
          )}
        </Section>
      ) : null}
    </PanelShell>
  );
}
