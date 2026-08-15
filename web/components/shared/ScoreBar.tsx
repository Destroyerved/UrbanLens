"use client";

import { motion } from "framer-motion";
import type { FactorScore } from "@/types";
import { cn, scoreTone, toneBg, toneText } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Signature explainability component: each suitability factor occupies a
 * segment proportional to its WEIGHT; the fill inside each segment shows the
 * factor's SCORE with its semantic tone. Used everywhere a composite score
 * appears — parcels, candidates, simulator — to reinforce "explainable,
 * not black-box".
 */

export function SegmentedScoreBar({
  factors,
  className,
  animate = true,
}: {
  factors: FactorScore[];
  className?: string;
  animate?: boolean;
}) {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  return (
    <div className={cn("flex h-2 w-full gap-[3px]", className)}>
      {factors.map((f, i) => (
        <Tooltip key={f.key}>
          <TooltipTrigger asChild>
            <div
              className="relative h-full overflow-hidden rounded-full bg-surface-3"
              style={{ width: `${(f.weight / totalWeight) * 100}%` }}
            >
              <motion.div
                className={cn("h-full rounded-full", toneBg[scoreTone(f.score)])}
                initial={animate ? { width: 0 } : false}
                animate={{ width: `${f.score}%` }}
                transition={{ duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="text-[11px] font-semibold">
              {f.label} · <span className={cn("num", toneText[scoreTone(f.score)])}>{f.score}</span>
              <span className="text-muted-foreground"> / 100 · weight {f.weight}%</span>
            </div>
            <div className="text-[10.5px] text-muted-foreground">{f.detail}</div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Detailed factor rows (label, mini bar, score). */
export function FactorRows({ factors }: { factors: FactorScore[] }) {
  return (
    <div className="space-y-1.5">
      {factors.map((f, i) => (
        <div key={f.key} className="grid grid-cols-[112px_1fr_34px] items-center gap-2">
          <div className="truncate text-[11px] text-muted-foreground">{f.label}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className={cn("h-full rounded-full", toneBg[scoreTone(f.score)])}
              initial={{ width: 0 }}
              animate={{ width: `${f.score}%` }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className={cn("num text-right text-[11px] font-semibold", toneText[scoreTone(f.score)])}>
            {f.score}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Simple labelled score bar (0–100) with semantic tone. */
export function MiniScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className={cn("h-full rounded-full", toneBg[scoreTone(score)])}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
      <span className={cn("num text-xs font-semibold", toneText[scoreTone(score)])}>{score}</span>
    </div>
  );
}
