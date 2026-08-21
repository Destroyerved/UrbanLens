"use client";

import { motion } from "framer-motion";
import { ChevronUp, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { LANDUSE_COLORS, FACILITY_COLORS, FACILITY_LABELS } from "@/lib/mapdata";
import { THERMAL_STATUS, useThermalStatus } from "@/data/thermal";
import { cn } from "@/lib/utils";

function Row({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/25 shadow-xs"
        style={{ background: color }}
      />
      <span className="text-[11px] font-semibold capitalize text-foreground/90 truncate">{label}</span>
    </div>
  );
}

function HeatmapLegendBar({
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
    <div className="mb-2.5">
      <div className="label-caps mb-1 font-bold">{title}</div>
      <div className="h-2 w-full rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ background: gradient }} />
      <div className="mt-1 flex items-center justify-between text-[9.5px] font-semibold text-foreground/80">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export default function Legend() {
  const activeLayers = useApp((s) => s.activeLayers);
  const mode = useApp((s) => s.mode);
  const thermal = useThermalStatus();

  const showPrediction = !!activeLayers["prediction"];
  const showFacilities = !!activeLayers["facilities"] && mode === "infrastructure";
  const showParcels = !!activeLayers["parcels"] && (mode === "overview" || mode === "growth" || mode === "land");
  const showGap = !!activeLayers["gap"];
  const showPopHeat = !!activeLayers["population"];
  const showGrowthHeat = !!activeLayers["growth-heat"];
  const showGapHeat = !!activeLayers["gap-heat"];
  const showNdviHeat = !!activeLayers["ndvi-heat"];
  const showGreenspace = !!activeLayers["greenspace"];
  const showThermalHeat = !!activeLayers["thermal-heat"];
  const showFloodRisk = !!activeLayers["flood-risk"];
  const showBuiltup = !!activeLayers["builtup"];

  if (
    !showPrediction &&
    !showFacilities &&
    !showParcels &&
    !showGap &&
    !showPopHeat &&
    !showGrowthHeat &&
    !showGapHeat &&
    !showNdviHeat &&
    !showGreenspace &&
    !showThermalHeat &&
    !showFloodRisk &&
    !showBuiltup
  )
    return null;

  return (
    <div data-glow className="glass max-w-[270px] rounded-3xl p-3.5 shadow-elev-2">
      {showPopHeat && (
        <HeatmapLegendBar
          title="Population Density Heatmap"
          minLabel="500 / cell"
          maxLabel="30,000+ / cell"
          gradient="linear-gradient(90deg, #38bdf8, #facc15, #f97316, #dc2626)"
        />
      )}

      {showGrowthHeat && (
        <HeatmapLegendBar
          title="2030 Growth Pressure Heatmap"
          minLabel="Low (0%)"
          maxLabel="Extreme (100%)"
          gradient="linear-gradient(90deg, #a855f7, #fb923c, #ef4444, #ffffff)"
        />
      )}

      {showGapHeat && (
        <HeatmapLegendBar
          title="Healthcare Deficit Intensity"
          minLabel="Low Gap"
          maxLabel="Critical Deficit"
          gradient="linear-gradient(90deg, #fdba74, #f97316, #dc2626, #7f1d1d)"
        />
      )}

      {showNdviHeat && (
        <HeatmapLegendBar
          title="Vegetation & NDVI (Sentinel-2)"
          minLabel="Sparse (low NDVI)"
          maxLabel="Dense Canopy (high NDVI)"
          gradient="linear-gradient(90deg, #a16207, #d9f99d, #84cc16, #22c55e, #14532d)"
        />
      )}

      {showGreenspace && (
        <div className="mb-2.5">
          <div className="label-caps mb-1 font-bold">Green Space</div>
          <Row color="#16a34a" label="Parks & green land parcels" />
        </div>
      )}

      {showThermalHeat &&
        (thermal.date ? (
          <HeatmapLegendBar
            title={`Urban Heat Island — LST ${thermal.ok ? "" : `(stale since ${thermal.date}) `}${
              thermal.scope === "district" && typeof thermal.coverage === "number"
                ? `· ${Math.round(thermal.coverage * 100)}% clear-sky `
                : ""
            }${thermal.note ? `· ${thermal.note}` : ""}`}
            minLabel="Relative low"
            maxLabel="Relative high"
            gradient="linear-gradient(90deg, #8c0000, #ff0000, #ff6100, #ff9d00, #ffc200, #f8ff00)"
          />
        ) : (
          <div className="mb-2.5">
            <div className="label-caps mb-1 font-bold">Urban Heat Island</div>
            <span className="text-[10.5px] font-semibold text-foreground/70">
              Not yet available — raster not published
            </span>
          </div>
        ))}

      {showFloodRisk && (
        <div className="mb-2.5">
          <div className="label-caps mb-1 font-bold">Flood Risk</div>
          <div className="space-y-1">
            <Row color="#22c55e" label="Low" />
            <Row color="#f59e0b" label="Moderate" />
            <Row color="#ef4444" label="High" />
          </div>
        </div>
      )}

      {showBuiltup && (
        <HeatmapLegendBar
          title="Observed Built-Up Intensity (Esri)"
          minLabel="Low built-up share"
          maxLabel="High built-up share"
          gradient="linear-gradient(90deg, rgba(251,191,36,.15), rgba(245,158,11,.5), rgba(234,88,12,.75), rgba(154,52,18,.96))"
        />
      )}

      {showPrediction && (
        <HeatmapLegendBar
          title="2030 Expansion Likelihood"
          minLabel="Lower likelihood"
          maxLabel="Higher likelihood"
          gradient="linear-gradient(90deg, rgba(250,204,21,.18), rgba(251,146,60,.5), rgba(248,113,113,.78), rgba(220,38,38,.96))"
        />
      )}

      {showGap && (
        <HeatmapLegendBar
          title="Hospital Access Deficit"
          minLabel="Lower unmet need"
          maxLabel="Higher unmet need"
          gradient="linear-gradient(90deg, rgba(251,146,60,.22), rgba(239,68,68,.58), rgba(185,28,28,.82), rgba(127,29,29,.98))"
        />
      )}

      {showParcels && (
        <div className="mb-1">
          <div className="label-caps mb-1.5 font-bold">Land Use</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {Object.entries(LANDUSE_COLORS)
              .filter(([u]) => u !== "water" && u !== "public")
              .map(([use, color]) => (
                <Row key={use} color={color} label={use} />
              ))}
          </div>
        </div>
      )}

      {showFacilities && (
        <div>
          <div className="label-caps mb-1.5 font-bold">Facilities</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {Object.entries(FACILITY_COLORS).map(([t, color]) => (
              <Row key={t} color={color} label={FACILITY_LABELS[t]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------------------------------------------------------------------------
 * Bottom-left control pair.
 *
 * `Legend` above is pure content — it renders rows for whatever layers are on
 * and owns no open/closed state. AppShell drives the bottom-left controls
 * itself so the legend and the basemap gallery can close each other, which
 * means it needs the same two-part shape BasemapSelector exposes: a button
 * that reflects `isOpen`, and a dismissible panel. These wrap the content in
 * that chrome rather than duplicating it.
 * ------------------------------------------------------------------------- */

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
        "--base": 220,
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
      aria-label={isOpen ? "Hide map legend" : "Show map legend"}
    >
      <span className="text-base shrink-0 leading-none">🗺️</span>
      <span className="text-[12px] font-bold text-foreground truncate leading-none flex-1 text-left">
        Legend
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

export function LegendPanel({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.96 }}
      transition={{ type: "spring", damping: 28, stiffness: 420, mass: 0.6 }}
      data-glow
      style={{
        "--base": 220,
        "--spread": 200,
        "--radius": 24,
        "--border-size": "1.5px",
        "--spotlight-size": "340px",
      } as React.CSSProperties}
      className="glass-strong pointer-events-auto max-h-[60vh] w-[300px] overflow-y-auto rounded-3xl p-3.5 shadow-elev-3 backdrop-blur-2xl border border-white/25 dark:border-white/15 select-none"
    >
      <div className="mb-2.5 flex items-center justify-between border-b border-white/15 dark:border-white/10 pb-2">
        <div className="text-[13px] font-extrabold tracking-tight text-foreground">
          Map Legend
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label="Close legend"
        >
          <X size={13} />
        </button>
      </div>
      <Legend />
    </motion.div>
  );
}
