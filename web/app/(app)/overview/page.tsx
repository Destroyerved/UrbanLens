"use client";

import * as React from "react";
import { Users, Building2, TrendingUp, HeartPulse, Map as MapIcon, Sprout, Flame, ShieldAlert } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { Cesium3DView } from "@/components/map/Cesium3DView";
import type { LayerKey, ParcelColorMode } from "@/components/map/CityMap";
import { MapControls } from "@/components/map/MapControls";
import { ParcelPanel } from "@/components/panels/ParcelPanel";
import { InsightsColumn } from "@/components/panels/InsightsColumn";
import { StatTile, Segmented } from "@/components/ui/kit";
import { Box } from "lucide-react";
import { api } from "@/lib/client";
import { fmtCompact, fmtInt } from "@/lib/ui";
import type { CityOverview } from "@/lib/gis/overview";

const AVAILABLE: LayerKey[] = [
  "boundary",
  "wards",
  "population",
  "prediction",
  "parcels",
  "conflicts",
  "roads",
  "facilities",
];

export default function OverviewPage() {
  const [overview, setOverview] = React.useState<CityOverview | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState<Set<LayerKey>>(
    new Set(["boundary", "parcels", "roads", "facilities"])
  );
  const [colorMode, setColorMode] = React.useState<ParcelColorMode>("ownership");
  const [view3d, setView3d] = React.useState(false);

  React.useEffect(() => {
    api<CityOverview>("/api/overview").then(setOverview).catch(() => {});
  }, []);

  const toggle = (k: LayerKey) =>
    setVisible((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <div className="h-full flex flex-col">
      {/* KPI strip */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="grid grid-cols-4 xl:grid-cols-8 gap-2.5">
          <StatTile
            label="Population"
            tone="accent"
            icon={<Users className="h-4 w-4" />}
            value={overview ? fmtCompact(overview.population) : "—"}
            sub={overview ? `${overview.ward_count} wards · ${overview.area_km2} km²` : ""}
          />
          <StatTile label="Govt Parcels" tone="gov" icon={<Building2 className="h-4 w-4" />} value={overview ? fmtInt(overview.government_parcels) : "—"} sub={overview ? `${fmtInt(overview.total_parcels)} total` : ""} />
          <StatTile label="Urban Growth" tone="warning" icon={<TrendingUp className="h-4 w-4" />} value={overview ? `+${overview.urban_growth_pct}%` : "—"} sub="2018 → 2026" />
          <StatTile label="Deficit Wards" tone="critical" icon={<HeartPulse className="h-4 w-4" />} value={overview ? overview.infrastructure_deficit_wards : "—"} sub="infra score < 50" />
          <StatTile label="Built-up Area" tone="neutral" icon={<MapIcon className="h-4 w-4" />} value={overview ? `${overview.built_up_area_km2}` : "—"} sub="km² (2026)" />
          <StatTile label="Vacant Govt Land" tone="good" icon={<Sprout className="h-4 w-4" />} value={overview ? fmtInt(overview.vacant_government_area_ha) : "—"} sub="ha available" />
          <StatTile label="High-Growth Zones" tone="warning" icon={<Flame className="h-4 w-4" />} value={overview ? overview.high_growth_zones : "—"} sub="predicted 2030" />
          <StatTile label="Zoning Conflicts" tone="critical" icon={<ShieldAlert className="h-4 w-4" />} value={overview ? overview.zoning_conflicts : "—"} sub="detected" />
        </div>
      </div>

      {/* map + right column */}
      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0">
          {view3d ? (
            <>
              <Cesium3DView
                parcelColorMode={colorMode}
                showFacilities={visible.has("facilities")}
                selectedParcelId={selected}
                onSelectParcel={setSelected}
              />
              <div className="absolute top-3 left-3 panel p-3 w-[210px]">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-2">
                  <Box className="h-3.5 w-3.5" /> 3D Built-up Massing
                </div>
                <p className="text-[11px] text-dim mb-2">Parcels extruded by built-up %. Drag to orbit, scroll to zoom.</p>
                <div className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Colour by</div>
                <Segmented
                  size="sm"
                  value={colorMode}
                  onChange={setColorMode}
                  options={[
                    { value: "ownership", label: "Owner" },
                    { value: "development", label: "Potential" },
                    { value: "landuse", label: "Use" },
                    { value: "flood", label: "Flood" },
                  ]}
                />
              </div>
            </>
          ) : (
            <>
              <MapView
                layers={AVAILABLE.filter((l) => visible.has(l))}
                parcelColorMode={colorMode}
                wardMetric={visible.has("wards") ? "infrastructure" : "none"}
                selectedParcelId={selected}
                onSelectParcel={setSelected}
              />
              <MapControls
                availableLayers={AVAILABLE}
                visible={visible}
                onToggle={toggle}
                parcelColorMode={colorMode}
                onParcelColorMode={setColorMode}
                wardMetric={visible.has("wards") ? "infrastructure" : "none"}
              />
            </>
          )}
          <div className="absolute top-3 right-3 z-10">
            <Segmented
              value={view3d ? "3d" : "2d"}
              onChange={(v) => setView3d(v === "3d")}
              options={[
                { value: "2d", label: "2D" },
                { value: "3d", label: "3D" },
              ]}
            />
          </div>
        </div>

        {selected ? (
          <ParcelPanel parcelId={selected} onClose={() => setSelected(null)} />
        ) : (
          <InsightsColumn overview={overview} />
        )}
      </div>
    </div>
  );
}
