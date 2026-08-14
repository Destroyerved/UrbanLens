"use client";

import * as React from "react";
import { Layers, Check } from "lucide-react";
import type { LayerKey, ParcelColorMode, WardMetric } from "./CityMap";
import { cn, LAND_USE_COLOR, OWNERSHIP_COLOR, FLOOD_COLOR, titleCase } from "@/lib/ui";
import { Segmented } from "@/components/ui/kit";

const LAYER_LABELS: Record<LayerKey, string> = {
  boundary: "City boundary",
  wards: "Ward boundaries",
  prediction: "2030 growth",
  parcels: "GLIS parcels",
  roads: "Roads & river",
  facilities: "Facilities",
};

export function MapControls({
  availableLayers,
  visible,
  onToggle,
  parcelColorMode,
  onParcelColorMode,
  wardMetric,
}: {
  availableLayers: LayerKey[];
  visible: Set<LayerKey>;
  onToggle: (k: LayerKey) => void;
  parcelColorMode?: ParcelColorMode;
  onParcelColorMode?: (m: ParcelColorMode) => void;
  wardMetric?: WardMetric;
}) {
  return (
    <div className="absolute top-3 left-3 z-10 w-[210px] panel p-3 shadow-xl backdrop-blur">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-2">
        <Layers className="h-3.5 w-3.5" /> Map Layers
      </div>
      <div className="space-y-1">
        {availableLayers.map((k) => (
          <button
            key={k}
            onClick={() => onToggle(k)}
            className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--panel-2)] text-left"
          >
            <span
              className={cn(
                "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                visible.has(k) ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--line-strong)]"
              )}
            >
              {visible.has(k) && <Check className="h-2.5 w-2.5 text-[var(--accent-ink)]" strokeWidth={3} />}
            </span>
            <span className="text-[13px] text-ink">{LAYER_LABELS[k]}</span>
          </button>
        ))}
      </div>

      {parcelColorMode && onParcelColorMode && visible.has("parcels") && (
        <div className="mt-3 pt-3 border-t border-[var(--line)]">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Colour parcels by</div>
          <Segmented
            size="sm"
            value={parcelColorMode}
            onChange={onParcelColorMode}
            options={[
              { value: "ownership", label: "Owner" },
              { value: "development", label: "Potential" },
              { value: "landuse", label: "Use" },
              { value: "flood", label: "Flood" },
            ]}
          />
          <Legend mode={parcelColorMode} showFacilities={visible.has("facilities")} showPrediction={visible.has("prediction")} wardMetric={visible.has("wards") ? wardMetric : "none"} />
        </div>
      )}
    </div>
  );
}

function Swatch({ c, label }: { c: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

function Legend({
  mode,
  showFacilities,
  showPrediction,
  wardMetric,
}: {
  mode: ParcelColorMode;
  showFacilities: boolean;
  showPrediction: boolean;
  wardMetric?: WardMetric;
}) {
  return (
    <div className="mt-2.5 space-y-1">
      {mode === "ownership" && (
        <div className="grid grid-cols-2 gap-1">
          <Swatch c={OWNERSHIP_COLOR.government} label="Government" />
          <Swatch c={OWNERSHIP_COLOR.private} label="Private" />
        </div>
      )}
      {mode === "development" && (
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 flex-1 rounded" style={{ background: "linear-gradient(to right,#ef4444,#eab308,#22c55e)" }} />
          <span className="text-[10px] text-dim">low → high</span>
        </div>
      )}
      {mode === "flood" && (
        <div className="grid grid-cols-3 gap-1">
          <Swatch c={FLOOD_COLOR.low} label="Low" />
          <Swatch c={FLOOD_COLOR.medium} label="Med" />
          <Swatch c={FLOOD_COLOR.high} label="High" />
        </div>
      )}
      {mode === "landuse" && (
        <div className="grid grid-cols-2 gap-1">
          {["residential", "commercial", "industrial", "agriculture", "vacant", "green"].map((k) => (
            <Swatch key={k} c={LAND_USE_COLOR[k]} label={titleCase(k)} />
          ))}
        </div>
      )}
      {showPrediction && (
        <div className="pt-1.5 mt-1.5 border-t border-[var(--line)]">
          <div className="text-[10px] text-dim mb-1">2030 growth probability</div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 flex-1 rounded" style={{ background: "linear-gradient(to right,#1d4ed8,#eab308,#ef4444)" }} />
          </div>
        </div>
      )}
      {wardMetric && wardMetric !== "none" && (
        <div className="pt-1.5 mt-1.5 border-t border-[var(--line)]">
          <div className="text-[10px] text-dim mb-1">
            {wardMetric === "infrastructure" ? "Infrastructure score" : "Population density"}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-2.5 flex-1 rounded"
              style={{
                background:
                  wardMetric === "infrastructure"
                    ? "linear-gradient(to right,#ef4444,#eab308,#22c55e)"
                    : "linear-gradient(to right,#0b2233,#0ea5e9,#a855f7)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
