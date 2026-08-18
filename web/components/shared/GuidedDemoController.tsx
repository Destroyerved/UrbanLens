"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  CheckCircle2,
  Navigation,
  Layers,
  FlaskConical,
  RotateCcw,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DemoBeat {
  step: number;
  title: string;
  subtitle: string;
  actionLabel: string;
  run: (store: ReturnType<typeof useApp.getState>) => void;
}

const DEMO_BEATS: DemoBeat[] = [
  {
    step: 1,
    title: "1 · City Command Center",
    subtitle: "Ahmedabad — 48 wards, 7.2M population, 3,980 GLIS parcels.",
    actionLabel: "Load City Overview",
    run: (s) => {
      s.setMode("overview");
      s.setPanelOpen(true);
      s.setCopilotOpen(false);
      s.flyTo([72.5714, 23.0225], 11.8);
    },
  },
  {
    step: 2,
    title: "2 · Growth Time Machine",
    subtitle: "Historical expansion 2018 → 2026 (+23.7% built-up extent).",
    actionLabel: "Show Historical Growth",
    run: (s) => {
      s.setMode("growth");
      s.setYear(2026);
      s.setPrediction(false);
      s.setPanelOpen(true);
    },
  },
  {
    step: 3,
    title: "3 · 2030 Growth Prediction",
    subtitle: "Machine learning urbanization probability grid.",
    actionLabel: "Activate 2030 Forecast",
    run: (s) => {
      s.setMode("growth");
      s.setPrediction(true);
      s.setPanelOpen(true);
    },
  },
  {
    step: 4,
    title: "4 · Infrastructure Gap Analysis",
    subtitle: "48 units ranked by population deficit (Sarkhej, Gota).",
    actionLabel: "Inspect Healthcare Gaps",
    run: (s) => {
      s.setMode("infrastructure");
      s.setGapCategory("healthcare");
      s.setPanelOpen(true);
      s.highlightWards(["w-sarkhej", "w-gota"]);
    },
  },
  {
    step: 5,
    title: "5 · Population Beyond Service Reach",
    subtitle: "7,000+ population cells mapped against hospital coverage.",
    actionLabel: "Toggle Deficit Grid",
    run: (s) => {
      s.setMode("infrastructure");
      s.toggleLayer("gap");
      s.toggleLayer("gap-heat");
      s.setPanelOpen(true);
    },
  },
  {
    step: 6,
    title: "6 · Site Selection Request",
    subtitle: "Evaluating eligible parcels with constraint filtering.",
    actionLabel: "Open Site Selection",
    run: (s) => {
      s.setMode("sites");
      s.setSiteProject("hospital");
      s.setPanelOpen(true);
    },
  },
  {
    step: 7,
    title: "7 · Multi-Criteria Suitability Scoring",
    subtitle: "Accessibility, road connectivity, transit, flood risk.",
    actionLabel: "Run Site Scoring",
    run: (s) => {
      s.setMode("sites");
      void s.runAnalysis();
    },
  },
  {
    step: 8,
    title: "8 · Top Ranked Site: GJ-AHM-00957",
    subtitle: "5.52 acres, government-owned, low flood risk, 666K catchment.",
    actionLabel: "Inspect Candidate #1",
    run: (s) => {
      s.setMode("sites");
      const cand = s.candidates?.[0];
      if (cand) {
        s.selectParcel(cand.parcelId, true);
        s.flyTo(cand.parcel.centroid, 14.5);
      }
    },
  },
  {
    step: 9,
    title: "9 · Explainable Evidence",
    subtitle: "No acquisition required, 0.1km arterial road, 27K unserved reach.",
    actionLabel: "View Evidence Factors",
    run: (s) => {
      s.setMode("sites");
      s.setPanelOpen(true);
    },
  },
  {
    step: 10,
    title: "10 · What-If Simulator",
    subtitle: "Simulating a public hospital on the chosen site.",
    actionLabel: "Launch Simulator",
    run: (s) => {
      s.setMode("simulator");
      const cand = s.candidates?.[0];
      if (cand) {
        s.setSimTarget(cand.parcelId);
        s.setSimProject("hospital");
      }
      s.setPanelOpen(true);
    },
  },
  {
    step: 11,
    title: "11 · Quantified Impact Results",
    subtitle: "Coverage 98.2% → 100%, +34,214 residents newly within reach.",
    actionLabel: "Run Simulation",
    run: (s) => {
      s.setMode("simulator");
      void s.runSim();
    },
  },
  {
    step: 12,
    title: "12 · AI Copilot Reasoning",
    subtitle: "Ask: 'Why is this the best location?' with grounded GIS figures.",
    actionLabel: "Ask Copilot",
    run: (s) => {
      s.setCopilotOpen(true);
      void s.sendCopilot("Why is this the best location for a public hospital?");
    },
  },
];

export default function GuidedDemoController({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!open) return null;

  const beat = DEMO_BEATS[currentStep];
  const total = DEMO_BEATS.length;

  const executeCurrentBeat = () => {
    beat.run(useApp.getState());
    toast.success(`Demo Step ${beat.step}: ${beat.title}`);
  };

  const nextStep = () => {
    if (currentStep < total - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      DEMO_BEATS[next].run(useApp.getState());
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      DEMO_BEATS[prev].run(useApp.getState());
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex flex-col w-[480px] max-w-[92vw] rounded-3xl p-4 shadow-2xl border border-accent/40 backdrop-blur-2xl bg-background/85"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/20 text-accent ring-1 ring-accent/40 font-bold text-[11px]">
              <Sparkles size={13} />
            </span>
            <div>
              <div className="text-[12.5px] font-bold text-foreground flex items-center gap-1.5">
                PRD §74 Guided Walkthrough
                <span className="text-[10px] text-accent font-semibold px-2 py-0.5 rounded-full bg-accent/15">
                  Beat {currentStep + 1} of {total}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Current Beat Info */}
        <div className="py-3">
          <h3 className="text-[14px] font-bold text-foreground">{beat.title}</h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{beat.subtitle}</p>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-accent transition-all duration-300 rounded-full"
            style={{ width: `${((currentStep + 1) / total) * 100}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="glass flex h-8 items-center gap-1 px-3 rounded-xl text-[11.5px] font-semibold hover:bg-surface-3 disabled:opacity-30 transition-all cursor-pointer"
          >
            <ChevronLeft size={13} /> Back
          </button>

          <button
            type="button"
            onClick={executeCurrentBeat}
            className="glass flex-1 flex h-8 items-center justify-center gap-1.5 px-3 rounded-xl bg-accent/20 text-accent font-bold ring-1 ring-accent/40 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
          >
            <Play size={12} className="fill-current" /> {beat.actionLabel}
          </button>

          <button
            type="button"
            onClick={nextStep}
            disabled={currentStep === total - 1}
            className="glass flex h-8 items-center gap-1 px-3 rounded-xl text-[11.5px] font-semibold bg-surface-2 hover:bg-surface-3 disabled:opacity-30 transition-all cursor-pointer"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
