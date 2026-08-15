"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  Bus,
  Check,
  FlaskConical,
  Hospital,
  Landmark,
  Play,
  RotateCcw,
  School,
  Sparkles,
  Trees,
} from "lucide-react";
import { PanelShell, Section, EmptyBlock } from "./PanelShell";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { useApp } from "@/lib/store";
import { PARCEL_BY_ID } from "@/data/parcels";
import { WARD_BY_ID } from "@/data/wards";
import type { ProjectType } from "@/types";
import { cn, formatCompact } from "@/lib/utils";

const SIM_TYPES: { id: ProjectType; label: string; icon: React.ReactNode }[] = [
  { id: "hospital", label: "Hospital", icon: <Hospital size={14} /> },
  { id: "school", label: "School", icon: <School size={14} /> },
  { id: "park", label: "Park", icon: <Trees size={14} /> },
  { id: "transit", label: "Transit Stop", icon: <Bus size={14} /> },
  { id: "govt", label: "Govt Facility", icon: <Landmark size={14} /> },
];

const STEPS = [
  "Analyzing population catchment…",
  "Evaluating current service coverage…",
  "Applying proposed intervention…",
  "Recalculating accessibility…",
];

function BeforeAfter({
  label,
  before,
  after,
  format = (n: number) => `${Math.round(n)}`,
  invert = false,
  unit,
}: {
  label: string;
  before: number;
  after: number;
  format?: (n: number) => string;
  invert?: boolean;
  unit?: string;
}) {
  // Three states, not two: an intervention that leaves a metric untouched is a
  // real and common result — a hospital does not move a ward's school access —
  // and colouring it amber would read as a regression that did not happen.
  const delta = invert ? before - after : after - before;
  const tone = delta > 0 ? "text-good" : delta < 0 ? "text-warning" : "text-muted-foreground";
  return (
    <div className="glass-card rounded-2xl p-3.5 shadow-sm">
      <div className="label-caps mb-2 font-bold">{label}</div>
      <div className="flex items-center justify-between">
        <div className="text-center">
          <div className="num text-[17px] font-bold text-muted-foreground">
            {format(before)}
            {unit}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80">Before</div>
        </div>
        <ArrowDown className={cn("-rotate-90", tone)} size={16} />
        <div className="text-center">
          <div className={cn("num text-[22px] font-bold", tone)}>
            <AnimatedNumber value={after} format={format} duration={1200} />
            {unit}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80">After</div>
        </div>
      </div>
    </div>
  );
}

export default function SimulatorPanel() {
  const simProject = useApp((s) => s.simProject);
  const setSimProject = useApp((s) => s.setSimProject);
  const simTargetId = useApp((s) => s.simTargetId);
  const setSimTarget = useApp((s) => s.setSimTarget);
  const simPhase = useApp((s) => s.simPhase);
  const simStep = useApp((s) => s.simStep);
  const simResult = useApp((s) => s.simResult);
  const runSim = useApp((s) => s.runSim);
  const resetSim = useApp((s) => s.resetSim);
  const selectedParcelId = useApp((s) => s.selectedParcelId);
  const candidates = useApp((s) => s.candidates);
  const setMode = useApp((s) => s.setMode);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);
  const flyTo = useApp((s) => s.flyTo);

  const target = simTargetId ? PARCEL_BY_ID.get(simTargetId) : null;
  const topCandidate = candidates?.[0];

  return (
    <PanelShell
      title="What-If Simulator"
      caption="Quantified impact before a single brick is laid"
    >
      <Section label="1 · Intervention">
        <div className="grid grid-cols-5 gap-1.5">
          {SIM_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSimProject(t.id)}
              className={cn(
                "glass-card flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 transition-all hover:scale-[1.02] active:scale-95",
                simProject === t.id
                  ? "border-gov/80 bg-gov/20 text-gov ring-1 ring-gov/50 font-semibold"
                  : "text-muted-foreground hover:border-gov/40 hover:text-foreground"
              )}
            >
              {t.icon}
              <span className="text-[8.5px] font-semibold leading-tight text-center">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section label="2 · Target Parcel">
        {target ? (
          <div className="glass-card flex items-center justify-between rounded-2xl border-gov/50 bg-gov/15 px-3.5 py-3 shadow-sm">
            <div>
              <div className="num text-[13px] font-bold text-foreground">{target.id}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {WARD_BY_ID.get(target.wardId)?.name} · {target.areaHa} ha ·{" "}
                {target.ownership === "government" ? "Government" : "Private"}
              </div>
            </div>
            <button
              onClick={() => flyTo(target.centroid, 13.5)}
              className="glass rounded-xl px-2.5 py-1 text-[10.5px] font-semibold transition-transform hover:scale-105 active:scale-95"
            >
              View
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <EmptyBlock
              title="No target selected"
              hint="Pick a parcel on the map, or use a site-selection result."
            />
            <div className="flex gap-1.5">
              {selectedParcelId && (
                <button
                  onClick={() => setSimTarget(selectedParcelId)}
                  className="glass h-8 flex-1 rounded-xl text-[11.5px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Use selected parcel
                </button>
              )}
              {topCandidate ? (
                <button
                  onClick={() => setSimTarget(topCandidate.parcelId)}
                  className="glass h-8 flex-1 rounded-xl bg-accent/20 text-[11.5px] font-bold text-accent ring-1 ring-accent/40 transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Use #1 site · {topCandidate.parcelId}
                </button>
              ) : (
                <button
                  onClick={() => setMode("sites")}
                  className="glass h-8 flex-1 rounded-xl text-[11.5px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Run Site Selection first
                </button>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section label="3 · Simulate">
        <button
          onClick={() => void runSim()}
          disabled={!target || simPhase === "running"}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gov text-[13px] font-bold text-white shadow-md shadow-gov/25 ring-1 ring-gov/60 transition-all hover:scale-[1.01] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {simPhase === "running" ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Simulating…
            </>
          ) : (
            <>
              <Play size={14} className="fill-current" />
              Simulate {SIM_TYPES.find((t) => t.id === simProject)?.label}
            </>
          )}
        </button>

        <AnimatePresence>
          {simPhase === "running" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-card mt-2.5 space-y-1.5 rounded-2xl p-3.5 shadow-sm">
                {STEPS.map((s, i) => (
                  <div
                    key={s}
                    className={cn(
                      "flex items-center gap-2 text-[11.5px] transition-opacity",
                      i > simStep ? "opacity-30" : "opacity-100"
                    )}
                  >
                    {i < simStep ? (
                      <Check size={12} className="text-good font-bold" />
                    ) : i === simStep ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-accent/30 border-t-accent" />
                    ) : (
                      <span className="h-3 w-3 rounded-full border border-border" />
                    )}
                    <span className="num font-medium">{s}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <AnimatePresence>
        {simPhase === "done" && simResult && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.175, 0.885, 0.32, 1.2] }}
          >
            <Section label={`Impact · ${simResult.wardName} corridor`}>
              <div className="space-y-2">
                <BeforeAfter
                  label={`${simResult.projectType} coverage · corridor`}
                  before={simResult.corridorBefore.coveragePct}
                  after={simResult.corridorAfter.coveragePct}
                  unit="%"
                />
                <div className="glass-card rounded-2xl border-good/50 bg-good/15 p-3.5 text-center shadow-sm">
                  <div className="num text-[25px] font-bold text-good">
                    +<AnimatedNumber value={simResult.newlyCovered} format={formatCompact} duration={1400} />
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Residents newly within service reach
                  </div>
                </div>
                <BeforeAfter
                  label="Avg distance to service · corridor"
                  before={simResult.corridorBefore.avgDistKm}
                  after={simResult.corridorAfter.avgDistKm}
                  format={(n) => n.toFixed(1)}
                  unit=" km"
                  invert
                />
                <div className="grid grid-cols-2 gap-2">
                  <BeforeAfter
                    label="Accessibility"
                    before={simResult.accessibilityBefore}
                    after={simResult.accessibilityAfter}
                  />
                  <BeforeAfter
                    label="Ward livability"
                    before={simResult.livabilityBefore}
                    after={simResult.livabilityAfter}
                  />
                </div>
                <div className="glass-card rounded-2xl p-3.5 text-[11px] leading-relaxed text-muted-foreground shadow-sm">
                  Citywide {simResult.projectType} coverage moves{" "}
                  <span className="num font-bold text-foreground">{simResult.before.coveragePct}% → {simResult.after.coveragePct}%</span>{" "}
                  with a {simResult.serviceRadiusKm} km service radius. All figures are recomputed
                  from the population grid — not preset numbers.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={resetSim}
                    className="glass flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-[11.5px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                  <button
                    onClick={() => setCopilotOpen(true)}
                    className="glass flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent/20 text-[11.5px] font-bold text-accent ring-1 ring-accent/40 transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    <Sparkles size={12} /> Ask why this site
                  </button>
                </div>
              </div>
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      {simPhase === "idle" && !target && (
        <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <FlaskConical size={11} />
          Tip: run Site Selection, then hit “Simulate” on the #1 candidate.
        </div>
      )}
    </PanelShell>
  );
}
