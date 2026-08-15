"use client";

import { useApp } from "@/lib/store";
import { LANDUSE_COLORS, FACILITY_COLORS, FACILITY_LABELS } from "@/lib/mapdata";

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

const PREDICTION_STEPS = [
  { color: "#64748b", label: "Very Low" },
  { color: "#fbbf24", label: "Low" },
  { color: "#fb923c", label: "Med" },
  { color: "#f87171", label: "High" },
  { color: "#dc2626", label: "V. High" },
];

export default function Legend() {
  const activeLayers = useApp((s) => s.activeLayers);
  const mode = useApp((s) => s.mode);

  const showPrediction = !!activeLayers["prediction"];
  const showFacilities = !!activeLayers["facilities"] && mode === "infrastructure";
  const showParcels = !!activeLayers["parcels"] && (mode === "overview" || mode === "growth" || mode === "land");
  const showGap = !!activeLayers["gap"];
  const showPopHeat = !!activeLayers["population"];
  const showGrowthHeat = !!activeLayers["growth-heat"];
  const showGapHeat = !!activeLayers["gap-heat"];
  const showNdviHeat = !!activeLayers["ndvi-heat"];
  const showThermalHeat = !!activeLayers["thermal-heat"];

  if (
    !showPrediction &&
    !showFacilities &&
    !showParcels &&
    !showGap &&
    !showPopHeat &&
    !showGrowthHeat &&
    !showGapHeat &&
    !showNdviHeat &&
    !showThermalHeat
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
          title="Vegetation & NDVI Canopy"
          minLabel="Sparse"
          maxLabel="Dense Canopy"
          gradient="linear-gradient(90deg, #d9f99d, #84cc16, #22c55e, #14532d)"
        />
      )}

      {showThermalHeat && (
        <HeatmapLegendBar
          title="Urban Heat Island (UHI)"
          minLabel="Cool Buffer"
          maxLabel="Extreme Thermal Stress"
          gradient="linear-gradient(90deg, #3b82f6, #eab308, #f97316, #b91c1c)"
        />
      )}

      {showPrediction && (
        <div className="mb-2.5">
          <div className="label-caps mb-1.5 font-bold">2030 Growth Probability</div>
          <div className="flex gap-1">
            {PREDICTION_STEPS.map((s) => (
              <div key={s.label} className="flex-1">
                <div
                  className="h-2 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                  style={{ background: s.color }}
                />
                <div className="mt-1 text-center text-[8.5px] font-bold leading-tight text-foreground/80">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showGap && (
        <div className="mb-2.5">
          <div className="label-caps mb-1 font-bold">Infrastructure Gap Grid</div>
          <Row color="#ef4444" label="Pop >3.5km from hospital" />
        </div>
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
