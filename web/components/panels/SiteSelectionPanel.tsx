"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Building,
  Check,
  Factory,
  FlaskConical,
  Home,
  Hospital,
  Landmark,
  MapPin,
  Play,
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
            className="text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
          >
            {configOpen ? "Collapse" : "Expand"}
          </button>
        }
      >
        <AnimatePresence initial={false}>
          {configOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="glass-card space-y-3 rounded-2xl p-3.5 shadow-sm">
                <div>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">Minimum land area</span>
                    <span className="num font-semibold">{constraints.minAreaHa} ha</span>
                  </div>
                  <Slider
                    value={[constraints.minAreaHa]}
                    min={0.5}
                    max={15}
                    step={0.5}
                    onValueChange={([v]) => setConstraints({ minAreaHa: v })}
                  />
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="font-medium text-muted-foreground">Max existing built-up</span>
                    <span className="num font-semibold">{constraints.maxBuiltUpPct ?? 40}%</span>
                  </div>
                  <Slider
                    value={[constraints.maxBuiltUpPct ?? 40]}
                    min={0}
                    max={80}
                    step={5}
                    onValueChange={([v]) => setConstraints({ maxBuiltUpPct: v })}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11.5px] font-medium text-foreground">Exclude flood hazard zones</span>
                  <Switch
                    checked={constraints.excludeFloodHazard ?? false}
                    onCheckedChange={(v) => setConstraints({ excludeFloodHazard: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-medium text-foreground">Government-owned only</span>
                  <Switch
                    checked={constraints.governmentOnly}
                    onCheckedChange={(v) => setConstraints({ governmentOnly: v })}
                  />
                </div>

                <div className="border-t border-border/70 pt-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="label-caps font-bold">Scoring Weights</span>
                    <span className="num text-[10px] text-muted-foreground">
                      Total: {totalWeight}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {WEIGHT_LABELS.map(({ key, label }) => (
                      <div key={key}>
                        <div className="mb-1 flex justify-between text-[10.5px]">
                          <span className="font-medium text-muted-foreground">{label}</span>
                          <span className="num font-semibold">{weights[key]}%</span>
                        </div>
                        <Slider
                          value={[weights[key]]}
                          min={0}
                          max={50}
                          step={5}
                          onValueChange={([v]) => setWeights({ [key]: v })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <button
        onClick={runAnalysis}
        disabled={analysisRunning}
        className="group flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[13px] font-bold text-accent-foreground shadow-md shadow-accent/25 ring-1 ring-accent/60 transition-all hover:scale-[1.01] hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
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
        <Section label={`Best Sites · ${candidates.length} candidates`}>
          <div className="space-y-2">
            {candidates.map((c) => (
              <GlowCard
                key={c.parcelId}
                glowColor={c.rank === 1 ? "rgba(56, 189, 248, 0.06)" : "rgba(56, 189, 248, 0.03)"}
                borderGlowColor={c.rank === 1 ? "rgba(56, 189, 248, 0.5)" : "rgba(56, 189, 248, 0.35)"}
                className={cn(
                  "p-3.5 shadow-sm",
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

                <div className="mt-2.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => flyTo(c.parcel.centroid, 13.8)}
                    className="glass flex h-7 flex-1 items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    <MapPin size={11} /> Show on map
                  </button>
                  <button
                    type="button"
                    onClick={() => selectParcel(c.parcelId, true)}
                    className="glass flex h-7 flex-1 items-center justify-center rounded-xl text-[11px] font-semibold transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    Open parcel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSimProject(siteProject);
                      setSimTarget(c.parcelId);
                      setMode("simulator");
                    }}
                    className="glass flex h-7 flex-1 items-center justify-center gap-1 rounded-xl bg-accent/20 text-[11px] font-bold text-accent ring-1 ring-accent/40 transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    <FlaskConical size={11} /> Simulate
                  </button>
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
