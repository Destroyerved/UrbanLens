"use client";

import * as React from "react";
import { FlaskConical, MousePointerClick, ArrowRight, Users, Navigation, Activity, Loader2 } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import type { MapMarker } from "@/components/map/CityMap";
import { postJSON } from "@/lib/client";
import { cn, fmtInt, scoreColor } from "@/lib/ui";
import { PROJECTS, ProjectType } from "@/lib/scoring";

const INTERVENTIONS: ProjectType[] = ["hospital", "school", "park", "fire_station", "government_office"];

interface SimResult {
  applicable: boolean;
  label: string;
  service_radius_km: number;
  window_population: number;
  residents_newly_covered: number;
  coverage_before_pct: number;
  coverage_after_pct: number;
  avg_distance_before_km: number;
  avg_distance_after_km: number;
}

export default function SimulatorPage() {
  const [intervention, setIntervention] = React.useState<ProjectType>("hospital");
  const [site, setSite] = React.useState<[number, number] | null>(null);
  const [result, setResult] = React.useState<SimResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  const runSim = React.useCallback(
    async (lng: number, lat: number, type: ProjectType) => {
      setLoading(true);
      try {
        const res = await postJSON<SimResult>("/api/scenarios/simulate", { project_type: type, lng, lat });
        setResult(res);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onMapClick = (lng: number, lat: number) => {
    setSite([lng, lat]);
    runSim(lng, lat, intervention);
  };

  React.useEffect(() => {
    if (site) runSim(site[0], site[1], intervention);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervention]);

  const facilityType = PROJECTS[intervention].addsFacility;
  const markers: MapMarker[] = site
    ? [{ id: "proposed", lng: site[0], lat: site[1], color: "#22d3ee", pulse: true, label: `Proposed ${PROJECTS[intervention].label}` }]
    : [];

  return (
    <div className="h-full flex">
      {/* controls */}
      <div className="w-[280px] shrink-0 h-full overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted mb-2">
            <FlaskConical className="h-3.5 w-3.5" /> Intervention
          </div>
          <div className="space-y-1.5">
            {INTERVENTIONS.map((k) => (
              <button
                key={k}
                onClick={() => setIntervention(k)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 text-[13px] border transition-colors",
                  intervention === k
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-ink"
                    : "border-[var(--line)] text-muted hover:text-ink hover:bg-[var(--panel)]"
                )}
              >
                {PROJECTS[k].label}
                <span className="block text-[10px] text-dim">Service radius {PROJECTS[k].serviceRadiusKm} km</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-3 text-[12px] text-muted leading-relaxed flex gap-2">
          <MousePointerClick className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
          Click anywhere on the map to place the proposed facility. UrbanLens recomputes real
          coverage from existing facilities and population.
        </div>

        {site && (
          <div className="text-[11px] text-dim">
            Placed at{" "}
            <span className="mono text-muted">
              {site[1].toFixed(4)}, {site[0].toFixed(4)}
            </span>
          </div>
        )}
      </div>

      {/* map */}
      <div className="relative flex-1 min-w-0">
        <MapView
          layers={["boundary", "roads", "parcels", "facilities"]}
          parcelColorMode="landuse"
          facilityTypes={facilityType ? [facilityType] : undefined}
          markers={markers}
          onMapClick={onMapClick}
        />
        {!site && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="panel px-5 py-3 flex items-center gap-2.5 text-sm text-ink shadow-xl">
              <MousePointerClick className="h-4 w-4 text-[var(--accent)]" />
              Click the map to place a {PROJECTS[intervention].label.toLowerCase()}
            </div>
          </div>
        )}
        <div className="absolute top-3 left-3 panel px-3 py-2 text-[11px] text-muted">
          Showing existing <span className="text-ink font-medium">{PROJECTS[intervention].label.toLowerCase()}s</span> ·{" "}
          {PROJECTS[intervention].serviceRadiusKm} km service radius
        </div>
      </div>

      {/* impact */}
      <div className="w-[360px] shrink-0 h-full overflow-y-auto border-l border-[var(--line)] bg-[var(--bg-elev)] p-4">
        <div className="text-[11px] uppercase tracking-wide text-dim mb-1">Simulated Impact</div>
        <div className="text-sm font-semibold text-ink mb-4">Before vs After</div>

        {!result && !loading && (
          <div className="text-sm text-dim text-center py-12">Place a facility on the map to model its impact.</div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" /> Computing catchment…
          </div>
        )}

        {result && !loading && result.applicable && (
          <div className="space-y-4 animate-in">
            <BigDelta
              icon={<Activity className="h-4 w-4" />}
              label="Healthcare / service coverage"
              before={`${result.coverage_before_pct}%`}
              after={`${result.coverage_after_pct}%`}
              beforeVal={result.coverage_before_pct}
              afterVal={result.coverage_after_pct}
              good="up"
            />
            <div className="panel p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-[var(--good)]">
                <Users className="h-5 w-5" />
                <span className="text-3xl font-bold tnum">{fmtInt(result.residents_newly_covered)}</span>
              </div>
              <div className="text-xs text-muted mt-1">residents newly within service range</div>
            </div>
            <BigDelta
              icon={<Navigation className="h-4 w-4" />}
              label="Average distance to facility"
              before={`${result.avg_distance_before_km} km`}
              after={`${result.avg_distance_after_km} km`}
              beforeVal={100 - result.avg_distance_before_km * 10}
              afterVal={100 - result.avg_distance_after_km * 10}
              good="down"
            />
            <div className="text-[11px] text-dim leading-relaxed border-t border-[var(--line)] pt-3">
              Coverage measured over a {(result.service_radius_km * 1.8).toFixed(1)} km analysis window around the
              site ({fmtInt(result.window_population)} residents), weighted by population density. All figures are
              computed server-side from existing facilities — no fabricated results.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BigDelta({
  icon,
  label,
  before,
  after,
  beforeVal,
  afterVal,
  good,
}: {
  icon: React.ReactNode;
  label: string;
  before: string;
  after: string;
  beforeVal: number;
  afterVal: number;
  good: "up" | "down";
}) {
  const improved = good === "up" ? afterVal > beforeVal : afterVal > beforeVal;
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted mb-3">
        {icon}
        {label}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-center">
          <div className="text-[10px] text-dim uppercase mb-1">Before</div>
          <div className="text-2xl font-bold tnum text-muted">{before}</div>
        </div>
        <ArrowRight className={cn("h-5 w-5", improved ? "text-[var(--good)]" : "text-dim")} />
        <div className="text-center">
          <div className="text-[10px] text-dim uppercase mb-1">After</div>
          <div className="text-2xl font-bold tnum" style={{ color: scoreColor(good === "up" ? afterVal : afterVal) }}>
            {after}
          </div>
        </div>
      </div>
    </div>
  );
}
