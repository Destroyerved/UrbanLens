"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  Compass,
  TrendingUp,
  Activity,
  Layers,
  MapPin,
  FlaskConical,
  ArrowRight,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { Mode } from "@/types";

const ONBOARDING_KEY = "urbanlens_onboarding_dismissed";

const MODES: { id: Mode; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", desc: "City command center & demographics", icon: <Compass size={14} /> },
  { id: "growth", label: "Urban Growth", desc: "Time machine & 2030 forecast", icon: <TrendingUp size={14} /> },
  { id: "infrastructure", label: "Infrastructure", desc: "Gap analysis & accessibility reach", icon: <Activity size={14} /> },
  { id: "land", label: "Land Intelligence", desc: "GLIS parcels & government opportunities", icon: <Layers size={14} /> },
  { id: "sites", label: "Site Selection", desc: "Multi-criteria explainable recommendation", icon: <MapPin size={14} /> },
  { id: "simulator", label: "What-If Simulator", desc: "Quantified before/after impact modeling", icon: <FlaskConical size={14} /> },
];

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const setMode = useApp((s) => s.setMode);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(ONBOARDING_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="glass-strong relative flex flex-col w-full max-w-2xl rounded-[32px] p-6 shadow-2xl border border-white/20 dark:border-white/10 bg-background/90 backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent/20 text-accent ring-1 ring-accent/50 shadow-md shadow-accent/25">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-foreground">Welcome to UrbanLens</h2>
                <p className="text-[12px] text-muted-foreground">
                  AI-Powered Spatial Intelligence &amp; Urban Planning Platform
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  dismiss();
                }}
                className="glass flex items-start gap-2.5 rounded-2xl p-3 text-left hover:scale-[1.02] hover:border-accent/50 transition-all cursor-pointer group"
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                  {m.icon}
                </div>
                <div>
                  <div className="text-[12.5px] font-bold text-foreground group-hover:text-accent transition-colors">
                    {m.label}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground leading-snug">
                    {m.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
            <div className="text-[11.5px] text-muted-foreground">
              Tip: Press <kbd className="rounded px-1.5 py-0.5 bg-surface-3 font-mono text-[10px]">Ctrl+K</kbd> to search anywhere.
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="glass flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[12px] font-bold text-accent-foreground shadow-md shadow-accent/25 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              Get Started <ArrowRight size={13} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
