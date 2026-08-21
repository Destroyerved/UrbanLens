"use client";

import { motion } from "framer-motion";
import { X, Sparkles, type LucideIcon } from "lucide-react";
import type { Mode } from "@/types";
import { MODE_META } from "@/config/layers";
import { LANDUSE_COLORS, FACILITY_COLORS, FACILITY_LABELS } from "@/lib/mapdata";
import { useThermalStatus } from "@/data/thermal";

interface ModeLegendCardProps {
  mode: Mode;
  index?: number;
  icon: LucideIcon;
  onClose: () => void;
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20 dark:ring-white/30 shadow-xs"
        style={{ background: color }}
      />
      <span className="text-[11px] font-semibold capitalize text-foreground/90 truncate">{label}</span>
    </div>
  );
}

function GradientBar({
  title,
  minLabel,
  maxLabel,
  gradient,
}: {
  title: string;
  minLabel: string;
  maxLabel: string;
  gradient: string;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div className="h-2 w-full rounded-full ring-1 ring-black/10 dark:ring-white/20 shadow-xs" style={{ background: gradient }} />
      <div className="mt-1 flex items-center justify-between text-[9.5px] font-semibold text-foreground/80">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function ModeLegendCard({
  mode,
  index = 0,
  icon: Icon,
  onClose,
}: ModeLegendCardProps) {
  const thermal = useThermalStatus();
  const isBottomHalf = index > 4;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 32 }}
      className={`glass-strong pointer-events-auto absolute left-[80px] z-[70] w-[285px] rounded-3xl p-4 shadow-elev-3 backdrop-blur-2xl border border-white/30 dark:border-white/20 select-none ${
        isBottomHalf ? "bottom-0" : "top-0"
      }`}
    >
      {/* Left indicator notch pointing directly to the center of the active feature icon */}
      <div
        className="absolute -left-1.5 h-3 w-3 rotate-45 bg-inherit border-l border-b border-white/30 dark:border-white/20"
        style={isBottomHalf ? { bottom: "21px" } : { top: "21px" }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/15 dark:border-white/10 pb-2.5 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-7 w-7 place-items-center rounded-xl bg-accent/25 text-accent ring-1 ring-accent/50 shadow-[0_0_12px_rgba(56,189,248,0.35)] shrink-0">
            <Icon size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-extrabold tracking-tight text-foreground truncate">
              {MODE_META[mode].label} Map Legend
            </div>
            <div className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider">
              Layer Intelligence
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close legend"
          className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-white/20 dark:hover:bg-white/10 hover:text-foreground active:scale-95 transition-all cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body per Mode */}
      <div className="relative z-10 space-y-2.5 text-foreground max-h-[280px] overflow-y-auto panel-scroll pr-1">
        {mode === "overview" && (
          <>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Land Classifications
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <Swatch color={LANDUSE_COLORS.residential} label="Residential" />
                <Swatch color={LANDUSE_COLORS.commercial} label="Commercial" />
                <Swatch color={LANDUSE_COLORS.industrial} label="Industrial" />
                <Swatch color={LANDUSE_COLORS.agriculture} label="Agriculture" />
                <Swatch color={LANDUSE_COLORS.vacant} label="Vacant Land" />
                <Swatch color={LANDUSE_COLORS.vegetation} label="Vegetation" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Key Facilities
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <Swatch color={FACILITY_COLORS.hospital} label="Hospitals" />
                <Swatch color={FACILITY_COLORS.school} label="Schools" />
                <Swatch color={FACILITY_COLORS.transit} label="Transit Hubs" />
                <Swatch color={FACILITY_COLORS.govt} label="Govt Civic" />
              </div>
            </div>
          </>
        )}

        {mode === "growth" && (
          <>
            <GradientBar
              title="2030 Growth Probability"
              minLabel="Low (0%)"
              maxLabel="High (100%)"
              gradient="linear-gradient(90deg, rgba(250,204,21,.18), rgba(251,146,60,.5), rgba(248,113,113,.78), rgba(220,38,38,.96))"
            />
            <GradientBar
              title="Observed Built-Up History"
              minLabel="Undeveloped"
              maxLabel="Dense Built-Up"
              gradient="linear-gradient(90deg, rgba(251,191,36,.15), rgba(245,158,11,.5), rgba(234,88,12,.75), rgba(154,52,18,.96))"
            />
          </>
        )}

        {mode === "infrastructure" && (
          <>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Municipal Facilities
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {Object.entries(FACILITY_COLORS).map(([t, color]) => (
                  <Swatch key={t} color={color} label={FACILITY_LABELS[t] ?? t} />
                ))}
              </div>
            </div>
            <GradientBar
              title="Healthcare Deficit Reach"
              minLabel="< 1 km (Served)"
              maxLabel="3+ km (Deficit)"
              gradient="linear-gradient(90deg, rgba(251,146,60,.22), rgba(239,68,68,.58), rgba(185,28,28,.82), rgba(127,29,29,.98))"
            />
          </>
        )}

        {mode === "land" && (
          <>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Zoning & Land Use
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <Swatch color={LANDUSE_COLORS.residential} label="Residential" />
                <Swatch color={LANDUSE_COLORS.commercial} label="Commercial" />
                <Swatch color={LANDUSE_COLORS.industrial} label="Industrial" />
                <Swatch color={LANDUSE_COLORS.agriculture} label="Agriculture" />
                <Swatch color={LANDUSE_COLORS.mixed} label="Mixed Use" />
                <Swatch color={LANDUSE_COLORS.public} label="Public / Semi" />
              </div>
            </div>
            <div className="border-t border-white/10 pt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400 ring-1 ring-cyan-300 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                <span className="text-[11px] font-semibold text-foreground/90">Government Owned Parcels</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-500 ring-1 ring-rose-300 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                <span className="text-[11px] font-semibold text-foreground/90">Zoning Non-Compliance</span>
              </div>
            </div>
          </>
        )}

        {mode === "sites" && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Candidate Site Rank
            </div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-400 text-slate-950 text-[11px] font-black shadow-[0_0_10px_rgba(56,189,248,0.8)]">
                1
              </span>
              <div className="leading-tight">
                <div className="text-[11px] font-bold text-foreground">Rank #1 Optimal Site</div>
                <div className="text-[9.5px] text-muted-foreground">Highest composite suitability</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">
                2-5
              </span>
              <div className="leading-tight">
                <div className="text-[11px] font-semibold text-foreground">Top-5 Alternate Sites</div>
                <div className="text-[9.5px] text-muted-foreground">Viable secondary candidates</div>
              </div>
            </div>
          </div>
        )}

        {mode === "simulator" && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Intervention Impact
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-md bg-gov ring-2 ring-white/70 shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
              <span className="text-[11px] font-semibold text-foreground/90">Proposed Intervention Site</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-1 ring-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span className="text-[11px] font-semibold text-foreground/90">15-min Catchment Reach (3 km)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-[11px] font-semibold text-foreground/90">Net Accessibility Shift</span>
            </div>
          </div>
        )}

        {mode === "equity" && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Social Equity Tiers
            </div>
            <div className="space-y-1.5">
              <Swatch color="#ef4444" label="Tier 1: High Service Deficit" />
              <Swatch color="#f59e0b" label="Tier 2: Moderate Gap Area" />
              <Swatch color="#22c55e" label="Tier 3: Well-Covered Catchment" />
            </div>
          </div>
        )}

        {mode === "conservation" && (
          <>
            <GradientBar
              title="Sentinel-2 NDVI Canopy Cover"
              minLabel="Sparse Vegetation"
              maxLabel="Dense Canopy"
              gradient="linear-gradient(90deg, #a16207, #d9f99d, #84cc16, #22c55e, #14532d)"
            />
            <div className="space-y-1.5 pt-1">
              <Swatch color="#16a34a" label="Parks & Green Protected Land" />
              {thermal.date && (
                <Swatch color="#f97316" label={`Urban Heat Island (LST ${thermal.date})`} />
              )}
            </div>
          </>
        )}

        {mode === "corridor" && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Transit Corridor Influence
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-6 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                <span className="text-[11px] font-semibold text-foreground/90">Transit Alignment Line</span>
              </div>
              <Swatch color="rgba(56, 189, 248, 0.4)" label="250m Primary Walkable Buffer" />
              <Swatch color="rgba(168, 85, 247, 0.25)" label="500m Secondary Influence Area" />
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="mt-3 flex items-center justify-between border-t border-white/15 dark:border-white/10 pt-2 text-[9px] font-semibold text-muted-foreground/80">
        <span className="flex items-center gap-1">
          <Sparkles size={9.5} className="text-accent" />
          Live Spatial Layers
        </span>
        <span>Click icon or ✕ to close</span>
      </div>
    </motion.div>
  );
}
