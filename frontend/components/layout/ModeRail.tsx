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
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "@/types";
import { MODE_META } from "@/config/layers";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "growth", label: "Growth", icon: TrendingUp },
  { id: "infrastructure", label: "Infra", icon: Hospital },
  { id: "land", label: "Land", icon: Landmark },
  { id: "sites", label: "Sites", icon: Target },
  { id: "simulator", label: "Sim", icon: FlaskConical },
];

export default function ModeRail() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex items-center justify-center">
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="glass pointer-events-auto flex flex-col gap-2 rounded-3xl p-2 shadow-elev-3"
        style={{
          transform: "perspective(800px) rotateY(3deg)",
        }}
      >
        <TooltipProvider delayDuration={100}>
          {MODES.map((m, i) => {
            const active = mode === m.id;
            const isHovered = hovered === i;
            const Icon = m.icon;

            return (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <motion.div
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    animate={{
                      scale: isHovered ? 1.15 : 1,
                      x: isHovered ? 3 : 0,
                      rotate: isHovered && !active ? -3 : 0,
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 20 }}
                    className="relative flex flex-col items-center"
                  >
                    <button
                      onClick={() => setMode(m.id)}
                      aria-label={MODE_META[m.id].label}
                      className={cn(
                        "relative flex h-[54px] w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-0.5 transition-all active:scale-95",
                        active
                          ? "text-accent-foreground font-bold"
                          : "text-foreground/80 hover:text-foreground",
                        isHovered && "shadow-lg shadow-accent/20"
                      )}
                    >
                      {/* Active Mode Pill Indicator */}
                      {active && (
                        <motion.span
                          layoutId="mode-pill"
                          className="absolute inset-0 rounded-2xl bg-accent shadow-md shadow-accent/40 ring-1 ring-accent/60"
                          transition={{ type: "spring", stiffness: 450, damping: 32 }}
                        />
                      )}

                      {/* Hover Glowing Ring Effect */}
                      <AnimatePresence>
                        {isHovered && !active && (
                          <motion.span
                            layoutId="rail-hover-glow"
                            className="absolute inset-0 rounded-2xl border border-accent/60 bg-accent/20 shadow-[0_0_16px_rgba(56,189,248,0.35)] -z-0"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          />
                        )}
                      </AnimatePresence>

                      <span className="relative z-10">
                        <Icon size={18} className="transition-colors" />
                      </span>
                      <span className="relative z-10 text-[8.5px] font-bold uppercase tracking-tight leading-none text-center">
                        {m.label}
                      </span>

                      {/* Active Dot indicator on the right edge */}
                      {active && (
                        <motion.div
                          layoutId="active-dot"
                          className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent ring-2 ring-white dark:ring-slate-900 shadow-[0_0_8px_rgba(56,189,248,0.9)] z-20"
                          transition={{ type: "spring", stiffness: 450, damping: 30 }}
                        />
                      )}
                    </button>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="right" className="shadow-elev-2" sideOffset={8}>
                  <div className="text-[12px] font-bold">{MODE_META[m.id].label}</div>
                  <div className="text-[10.5px] text-muted-foreground">{MODE_META[m.id].caption}</div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </motion.div>
    </div>
  );
}
