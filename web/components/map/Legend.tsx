"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, Layers, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { LANDUSE_COLORS, FACILITY_COLORS, FACILITY_LABELS } from "@/lib/mapdata";
import { useThermalStatus } from "@/data/thermal";
import { MODE_META } from "@/config/layers";
import { cn } from "@/lib/utils";

function Row({ color, label }: { color: string; label: string }) {
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

function HeatmapBar({
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
    <div className="mb-2.5 last:mb-0">
      <div className="label-caps mb-1 font-bold">{title}</div>
      <div className="h-2 w-full rounded-full ring-1 ring-black/10 dark:ring-white/20 shadow-xs" style={{ background: gradient }} />
      <div className="mt-1 flex items-center justify-between text-[9.5px] font-semibold text-foreground/80">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function LegendButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-glow
      style={{
        "--base": 195,
        "--spread": 100,
        "--radius": 21,
        "--border-size": "1.5px",
        "--spotlight-size": "200px",
      } as React.CSSProperties}
      className={cn(
        "glass-strong flex h-[42px] w-[180px] shrink-0 items-center gap-2.5 px-3.5 rounded-[21px] shadow-elev-3 transition-colors duration-150 cursor-pointer select-none outline-none border border-white/25 dark:border-white/15",
        isOpen
          ? "ring-2 ring-accent shadow-[0_0_12px_rgba(56,189,248,0.4)]"
          : "hover:border-white/40"
      )}
    >
      <div className="grid h-5 w-5 place-items-center rounded-md bg-accent/20 text-accent ring-1 ring-accent/40 shadow-[0_0_8px_rgba(56,189,248,0.3)] shrink-0">
        <Layers size={11} />
      </div>
      <span className="text-[12px] font-bold text-foreground truncate leading-none flex-1 text-left">
        Overview
      </span>
      <ChevronUp
        size={13}
        className={cn(
          "text-muted-foreground transition-transform duration-200 shrink-0",
          isOpen && "rotate-180 text-accent"
        )}
      />
    </button>
  );
}

export function LegendPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const activeLayers = useApp((s) => s.activeLayers);
  const mode = useApp((s) => s.mode);
  const thermal = useThermalStatus();

  const showPrediction = !!activeLayers["prediction"] || mode === "growth";
  const showFacilities = (!!activeLayers["facilities"] && mode === "infrastructure") || mode === "overview";
  const showParcels = (!!activeLayers["parcels"] && (mode === "overview" || mode === "land")) || mode === "overview" || mode === "land";
  const showGap = !!activeLayers["gap"] || mode === "infrastructure";
  const showPopHeat = !!activeLayers["population"];
  const showGrowthHeat = !!activeLayers["growth-heat"] || mode === "growth";
  const showGapHeat = !!activeLayers["gap-heat"];
  const showNdviHeat = !!activeLayers["ndvi-heat"] || mode === "conservation";
  const showGreenspace = !!activeLayers["greenspace"] || mode === "conservation";
  const showThermalHeat = !!activeLayers["thermal-heat"];
  const showFloodRisk = !!activeLayers["flood-risk"];
  const showBuiltup = !!activeLayers["builtup"];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.96 }}
      transition={{ type: "spring", damping: 28, stiffness: 420, mass: 0.6 }}
      data-glow
      style={{
        "--base": 195,
        "--spread": 100,
        "--radius": 24,
        "--border-size": "1.5px",
        "--spotlight-size": "300px",
      } as React.CSSProperties}
      className="glass-strong pointer-events-auto w-[310px] rounded-3xl p-3.5 shadow-elev-3 backdrop-blur-2xl border border-white/25 dark:border-white/15 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/15 dark:border-white/10 pb-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent/25 text-accent ring-1 ring-accent/50 shadow-[0_0_10px_rgba(56,189,248,0.35)] shrink-0">
            <Layers size={13} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-extrabold tracking-tight text-foreground truncate">
              {MODE_META[mode]?.label ?? "Overview"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-white/20 dark:hover:bg-white/10 hover:text-foreground active:scale-95 transition-all cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="space-y-2.5 max-h-[250px] overflow-y-auto panel-scroll pr-1 text-foreground pb-1">
        {mode === "sites" && (
          <div className="space-y-2">
            <div className="label-caps font-bold">Candidate Site Rank</div>
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-400 text-slate-950 text-[10px] font-black shadow-[0_0_8px_rgba(56,189,248,0.8)]">
                1
              </span>
              <span className="text-[11px] font-bold text-foreground">Rank #1 Optimal Site</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">
                2-5
              </span>
              <span className="text-[11px] font-semibold text-foreground">Top-5 Alternate Sites</span>
            </div>
          </div>
        )}

        {mode === "simulator" && (
          <div className="space-y-2">
            <div className="label-caps font-bold">Intervention Simulation</div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-md bg-gov ring-2 ring-white/70 shadow-[0_0_6px_rgba(37,99,235,0.8)]" />
              <span className="text-[11px] font-semibold text-foreground">Proposed Site</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-1 ring-emerald-300" />
              <span className="text-[11px] font-semibold text-foreground">15-min Catchment Reach</span>
            </div>
          </div>
        )}

        {mode === "equity" && (
          <div className="space-y-1.5">
            <div className="label-caps font-bold">Social Equity Tiers</div>
            <Row color="#ef4444" label="Tier 1: Critical Gap Area" />
            <Row color="#f59e0b" label="Tier 2: Moderate Need" />
            <Row color="#22c55e" label="Tier 3: Well-Covered Catchment" />
          </div>
        )}

        {mode === "corridor" && (
          <div className="space-y-1.5">
            <div className="label-caps font-bold">Transit Corridor Influence</div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
              <span className="text-[11px] font-semibold text-foreground">Transit Alignment Line</span>
            </div>
            <Row color="rgba(56, 189, 248, 0.4)" label="250m Primary Walkable Buffer" />
            <Row color="rgba(168, 85, 247, 0.25)" label="500m Secondary Catchment" />
          </div>
        )}

        {showPopHeat && (
          <HeatmapBar
            title="Population Density Heatmap"
            minLabel="500 / cell"
            maxLabel="30,000+ / cell"
            gradient="linear-gradient(90deg, #38bdf8, #facc15, #f97316, #dc2626)"
          />
        )}

        {showGrowthHeat && (
          <HeatmapBar
            title="2030 Growth Pressure"
            minLabel="Low (0%)"
            maxLabel="Extreme (100%)"
            gradient="linear-gradient(90deg, #a855f7, #fb923c, #ef4444, #ffffff)"
          />
        )}

        {showGapHeat && (
          <HeatmapBar
            title="Healthcare Deficit Intensity"
            minLabel="Low Gap"
            maxLabel="Critical Deficit"
            gradient="linear-gradient(90deg, #fdba74, #f97316, #dc2626, #7f1d1d)"
          />
        )}

        {showNdviHeat && (
          <HeatmapBar
            title="Vegetation & NDVI (Sentinel-2)"
            minLabel="Sparse (low NDVI)"
            maxLabel="Dense Canopy"
            gradient="linear-gradient(90deg, #a16207, #d9f99d, #84cc16, #22c55e, #14532d)"
          />
        )}

        {showGreenspace && (
          <div className="mb-1.5">
            <div className="label-caps mb-1 font-bold">Green Space</div>
            <Row color="#16a34a" label="Parks & Protected Green Land" />
          </div>
        )}

        {showThermalHeat &&
          (thermal.date ? (
            <HeatmapBar
              title={`Urban Heat Island — LST ${thermal.ok ? "" : `(stale since ${thermal.date})`}`}
              minLabel="Relative low"
              maxLabel="Relative high"
              gradient="linear-gradient(90deg, #3b82f6, #eab308, #f97316, #b91c1c)"
            />
          ) : (
            <div className="mb-1.5">
              <div className="label-caps mb-1 font-bold">Urban Heat Island</div>
              <span className="text-[10.5px] font-semibold text-foreground/70">
                Raster compiling…
              </span>
            </div>
          ))}

        {showFloodRisk && (
          <div className="mb-1.5">
            <div className="label-caps mb-1 font-bold">Flood Risk</div>
            <div className="space-y-1">
              <Row color="#22c55e" label="Low" />
              <Row color="#f59e0b" label="Moderate" />
              <Row color="#ef4444" label="High" />
            </div>
          </div>
        )}

        {showBuiltup && (
          <HeatmapBar
            title="Observed Built-Up History"
            minLabel="Low built-up"
            maxLabel="Dense Built-Up"
            gradient="linear-gradient(90deg, rgba(251,191,36,.15), rgba(245,158,11,.5), rgba(234,88,12,.75), rgba(154,52,18,.96))"
          />
        )}

        {showPrediction && (
          <HeatmapBar
            title="2030 Expansion Likelihood"
            minLabel="Lower"
            maxLabel="Higher"
            gradient="linear-gradient(90deg, rgba(250,204,21,.18), rgba(251,146,60,.5), rgba(248,113,113,.78), rgba(220,38,38,.96))"
          />
        )}

        {showGap && (
          <HeatmapBar
            title="Hospital Access Deficit"
            minLabel="< 1 km (Served)"
            maxLabel="3+ km (Deficit)"
            gradient="linear-gradient(90deg, rgba(251,146,60,.22), rgba(239,68,68,.58), rgba(185,28,28,.82), rgba(127,29,29,.98))"
          />
        )}

        {showParcels && (
          <div>
            <div className="label-caps mb-1 font-bold">Land Use</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <Row color={LANDUSE_COLORS.residential} label="Residential" />
              <Row color={LANDUSE_COLORS.commercial} label="Commercial" />
              <Row color={LANDUSE_COLORS.industrial} label="Industrial" />
              <Row color={LANDUSE_COLORS.agriculture} label="Agriculture" />
              <Row color={LANDUSE_COLORS.vacant} label="Vacant" />
              <Row color={LANDUSE_COLORS.vegetation} label="Vegetation" />
            </div>
          </div>
        )}

        {showFacilities && (
          <div>
            <div className="label-caps mb-1 font-bold">Municipal Facilities</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {Object.entries(FACILITY_COLORS).map(([t, color]) => (
                <Row key={t} color={color} label={FACILITY_LABELS[t] ?? t} />
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Legend() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <LegendButton isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} />
    </>
  );
}
