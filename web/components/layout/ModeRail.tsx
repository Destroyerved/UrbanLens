"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  TrendingUp,
  Hospital,
  Landmark,
  Target,
  FlaskConical,
  Leaf,
  Route,
  Scale,
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "@/types";
import { MODE_META } from "@/config/layers";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "growth", label: "Growth", icon: TrendingUp },
  { id: "infrastructure", label: "Infra", icon: Hospital },
  { id: "land", label: "Land", icon: Landmark },
  { id: "sites", label: "Sites", icon: Target },
  { id: "simulator", label: "Sim", icon: FlaskConical },
  { id: "equity", label: "Equity", icon: Scale },
  { id: "conservation", label: "Eco", icon: Leaf },
  { id: "corridor", label: "Route", icon: Route },
];

export default function ModeRail() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex items-center justify-center select-none">
      <div
        data-glow
        onMouseLeave={() => setHovered(null)}
        className="glass-strong pointer-events-auto relative flex w-[68px] shrink-0 flex-col gap-1 rounded-[26px] p-1.5 shadow-elev-3 backdrop-blur-2xl"
      >
        {MODES.map((m, i) => {
          const active = mode === m.id;
          const isHovered = hovered === i;
          const Icon = m.icon;

          return (
            <motion.div
              key={m.id}
              animate={{
                scale: isHovered ? 1.06 : 1,
                rotate: isHovered && !active ? -1.5 : 0,
              }}
              transition={{
                scale: { type: "spring", stiffness: 350, damping: 20 },
                rotate: { type: "spring", stiffness: 350, damping: 20 },
              }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => setMode(m.id)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                aria-label={MODE_META[m.id].label}
                className={cn(
                  "group relative flex h-[50px] w-[54px] flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 transition-colors cursor-pointer outline-none active:scale-[0.94]",
                  active
                    ? "text-accent-foreground font-bold"
                    : "text-foreground/75 hover:text-foreground"
                )}
              >
                {/* 1. Active Mode Pill Indicator */}
                {active && (
                  <motion.span
                    layoutId="mode-rail-active-pill"
                    className="pointer-events-none absolute inset-0 rounded-2xl bg-accent shadow-[0_0_18px_rgba(56,189,248,0.5)] ring-1 ring-accent/60"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}

                {/* 2. Hover Glowing Ring Effect */}
                <AnimatePresence>
                  {isHovered && !active && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.15 }}
                      className="pointer-events-none absolute inset-0 rounded-2xl border border-accent/50 bg-accent/15 shadow-[0_0_14px_rgba(56,189,248,0.3)]"
                    />
                  )}
                </AnimatePresence>

                {/* Icon */}
                <span className="pointer-events-none relative z-10">
                  <Icon
                    size={18}
                    className={cn(
                      "transition-colors",
                      active
                        ? "text-accent-foreground"
                        : isHovered
                          ? "text-accent"
                          : "text-foreground/80"
                    )}
                  />
                </span>

                {/* Label text */}
                <span
                  className={cn(
                    "pointer-events-none relative z-10 text-[8.5px] font-bold uppercase tracking-tight leading-none text-center transition-colors",
                    active
                      ? "text-accent-foreground"
                      : isHovered
                        ? "text-foreground font-bold"
                        : "text-foreground/70 font-semibold"
                  )}
                >
                  {m.label}
                </span>
              </button>

              {/* 3. Floating Quick Tooltip Pill */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: -8, scale: 0.92 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="pointer-events-none absolute left-[84px] top-1/2 -translate-y-1/2 z-[50] flex flex-col whitespace-nowrap rounded-xl bg-slate-950/90 dark:bg-slate-900/95 px-3 py-1.5 shadow-elev-3 backdrop-blur-xl border border-white/15"
                  >
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-white">
                      <span>{MODE_META[m.id].label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium leading-tight">
                      {MODE_META[m.id].caption}
                    </div>

                    {/* Left arrow nub */}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-slate-950/90 dark:bg-slate-900/95 border-l border-b border-white/15" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
