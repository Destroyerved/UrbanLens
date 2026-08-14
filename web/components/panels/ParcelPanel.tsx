"use client";

import * as React from "react";
import { X, Building2, User, TreePine, Droplets, Ruler, MapPin, Navigation, History, Leaf } from "lucide-react";
import { api } from "@/lib/client";
import { cn, fmtInt, LAND_USE_COLOR, titleCase } from "@/lib/ui";
import { Badge, ScoreBar, ScoreDonut, Spinner } from "@/components/ui/kit";

interface Intelligence {
  parcel_id: string;
  survey_number: string;
  area_acres: number;
  ownership: "government" | "private";
  owner_category: string;
  zoning: string;
  land_use: string;
  ward: string;
  built_up_percent: number;
  vegetation_percent: number;
  water_percent: number;
  flood_risk: "low" | "medium" | "high";
  elevation_m: number;
  distances: Record<string, number>;
  population_3km: number;
  land_use_change: {
    from_year: number;
    to_year: number;
    built_up_from: number;
    built_up_to: number;
    delta: number;
    transition: string | null;
    rapid: boolean;
    series: { year: number; built_up_percent: number }[];
  } | null;
  environment: {
    risk: "low" | "medium" | "high";
    checks: { label: string; ok: boolean; detail: string }[];
  };
  scores: {
    accessibility: number;
    infrastructure_readiness: number;
    environmental_suitability: number;
    development_potential: number;
    transit: number;
  };
  recommended_uses: { project: string; label: string; score: number }[];
}

export function ParcelPanel({
  parcelId,
  onClose,
}: {
  parcelId: string;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<Intelligence | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Intelligence>(`/api/parcels/${parcelId}`)
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [parcelId]);

  const floodColor: Record<"low" | "medium" | "high", string> = {
    low: "var(--good)",
    medium: "var(--moderate)",
    high: "var(--critical)",
  };

  return (
    <div className="w-[360px] shrink-0 h-full panel rounded-none border-y-0 border-r-0 flex flex-col animate-in overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-[var(--panel-2)] flex items-center justify-center shrink-0">
            <MapPin className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-dim">Parcel Intelligence</div>
            <div className="mono text-sm font-semibold text-ink truncate">{parcelId}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-dim hover:text-ink p-1 rounded hover:bg-[var(--panel-2)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading || !data ? (
        <div className="p-6">
          <Spinner label="Running spatial analysis…" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* ownership + zoning */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color={data.ownership === "government" ? "#3b82f6" : "#64748b"}>
              {data.ownership === "government" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {titleCase(data.ownership)}
            </Badge>
            <Badge color={LAND_USE_COLOR[data.land_use] ?? "#64748b"}>{titleCase(data.land_use)}</Badge>
            <Badge>{data.owner_category}</Badge>
          </div>

          {/* facts grid */}
          <div className="grid grid-cols-2 gap-2">
            <Fact icon={<Ruler className="h-3.5 w-3.5" />} label="Area" value={`${data.area_acres} ac`} />
            <Fact label="Zoning (official)" value={titleCase(data.zoning)} />
            <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Built-up" value={`${data.built_up_percent}%`} />
            <Fact icon={<TreePine className="h-3.5 w-3.5" />} label="Vegetation" value={`${data.vegetation_percent}%`} />
            <Fact
              icon={<Droplets className="h-3.5 w-3.5" />}
              label="Flood risk"
              value={titleCase(data.flood_risk)}
              valueColor={floodColor[data.flood_risk]}
            />
            <Fact label="Ward" value={data.ward} />
          </div>

          {/* proximity */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-dim mb-2 flex items-center gap-1.5">
              <Navigation className="h-3 w-3" /> Proximity
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <Dist label="Arterial road" v={data.distances.road_km} />
              <Dist label="Hospital" v={data.distances.hospital_km} />
              <Dist label="School" v={data.distances.school_km} />
              <Dist label="Park" v={data.distances.park_km} />
              <Dist label="Bus stop" v={data.distances.bus_stop_km} />
              <Dist label="Metro" v={data.distances.metro_km} />
            </div>
            <div className="mt-2 text-xs text-muted">
              Population within 3 km:{" "}
              <span className="text-ink font-semibold tnum">{fmtInt(data.population_3km)}</span>
            </div>
          </div>

          {/* land-use change (PRD §22) */}
          {data.land_use_change && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-dim mb-2 flex items-center gap-1.5">
                <History className="h-3 w-3" /> Land-Use Change
              </div>
              <div className="flex items-end gap-1.5 h-14 mb-2">
                {data.land_use_change.series.map((s) => (
                  <div key={s.year} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${Math.max(3, s.built_up_percent)}%`,
                          background:
                            s.year === data.land_use_change!.to_year
                              ? "var(--accent)"
                              : "var(--line-strong)",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-dim tnum">{s.year}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted">
                Built-up{" "}
                <span className="text-ink tnum font-semibold">
                  {data.land_use_change.built_up_from}%
                </span>{" "}
                →{" "}
                <span className="text-ink tnum font-semibold">
                  {data.land_use_change.built_up_to}%
                </span>{" "}
                <span
                  className="tnum"
                  style={{
                    color:
                      data.land_use_change.delta > 0 ? "var(--warning)" : "var(--text-dim)",
                  }}
                >
                  ({data.land_use_change.delta > 0 ? "+" : ""}
                  {data.land_use_change.delta} pts)
                </span>
              </div>
              {data.land_use_change.transition && (
                <div className="mt-1.5">
                  <Badge color={data.land_use_change.rapid ? "#f97316" : "#64748b"}>
                    {data.land_use_change.transition}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* environmental constraints (PRD §25) */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-dim mb-2 flex items-center gap-1.5">
              <Leaf className="h-3 w-3" /> Environmental Constraints
              <Badge color={floodColor[data.environment.risk]}>
                {titleCase(data.environment.risk)} risk
              </Badge>
            </div>
            <div className="space-y-1">
              {data.environment.checks.map((c) => (
                <div key={c.label} className="flex items-start gap-2 text-[11px]">
                  <span
                    className="mt-[3px] shrink-0"
                    style={{ color: c.ok ? "var(--good)" : "var(--warning)" }}
                  >
                    {c.ok ? "✓" : "⚠"}
                  </span>
                  <span className="text-muted leading-snug">{c.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* scores */}
          <div className="flex items-center gap-4">
            <ScoreDonut value={data.scores.development_potential} label="Dev. Potential" />
            <div className="flex-1 space-y-2.5">
              <ScoreBar label="Accessibility" value={data.scores.accessibility} />
              <ScoreBar label="Infrastructure" value={data.scores.infrastructure_readiness} />
              <ScoreBar label="Environment" value={data.scores.environmental_suitability} />
            </div>
          </div>

          {/* recommended uses */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-dim mb-2">Recommended Use</div>
            <div className="space-y-2">
              {data.recommended_uses.map((r, i) => (
                <div key={r.project} className="flex items-center gap-3">
                  <span className={cn("text-xs mono w-4", i === 0 ? "text-[var(--accent)]" : "text-dim")}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-ink flex-1">{r.label}</span>
                  <div className="w-24">
                    <ScoreBar label="" value={r.score} />
                  </div>
                  <span className="tnum text-sm font-semibold w-7 text-right text-ink">{r.score}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-dim leading-relaxed border-t border-[var(--line)] pt-3">
            Scores are computed server-side by deterministic spatial formulas. Distances and
            facility counts use real OpenStreetMap data against real ward boundaries; the parcel
            record itself is demo data, not an official GLIS record.
          </p>
        </div>
      )}
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  valueColor,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="panel-2 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-dim">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold mt-0.5" style={{ color: valueColor ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function Dist({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="tnum text-ink font-medium">{v} km</span>
    </div>
  );
}
