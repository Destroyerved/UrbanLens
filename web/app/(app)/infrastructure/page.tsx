"use client";

import * as React from "react";
import { HeartPulse, Clock, MousePointerClick, ChevronRight, Loader2, Gauge } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { api } from "@/lib/client";
import { cn, fmtCompact, scoreColor, titleCase } from "@/lib/ui";
import { ScoreBar, ScoreDonut, Segmented } from "@/components/ui/kit";

interface Ward {
  ward_code: string;
  name: string;
  population: number;
  centroid: [number, number];
  overall: number;
  scores: { healthcare: number; education: number; parks: number; transportation: number; road_connectivity: number };
}
interface Access {
  score: number;
  items: { facility_type: string; mode: string; minutes: number; distance_km: number; reachable: boolean }[];
}
type ServiceKey = keyof Ward["scores"];
interface Coverage {
  service: ServiceKey;
  confidence: "high" | "medium" | "low";
  mapped: number;
  expected: number;
  note: string;
}

const SERVICE_LABEL: Record<ServiceKey, string> = {
  healthcare: "Healthcare",
  education: "Education",
  parks: "Parks & Green",
  transportation: "Transportation",
  road_connectivity: "Road Connectivity",
};

const CONF_COLOR = {
  high: "var(--good)",
  medium: "var(--moderate)",
  low: "var(--warning)",
} as const;

/**
 * Marks a score whose underlying facilities are thinly mapped in OSM. Without
 * this, an outer ward reads as a confident "0 — Critical" when the real finding
 * is that the map has almost no data there.
 */
function ConfidenceNote({ c }: { c: Coverage }) {
  if (c.confidence === "high") return null;
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded px-1 text-[9px] font-medium uppercase tracking-wide align-middle"
      style={{
        color: CONF_COLOR[c.confidence],
        background: `color-mix(in srgb, ${CONF_COLOR[c.confidence]} 14%, transparent)`,
      }}
      title={c.note}
    >
      {c.confidence === "low" ? "thin data" : "partial data"}
    </span>
  );
}

type LivabilityComponent =
  | "healthcare"
  | "education"
  | "green_space"
  | "transportation"
  | "public_services"
  | "road_connectivity"
  | "environmental_quality";

interface WardLivability {
  ward_code: string;
  name: string;
  population: number;
  centroid: [number, number];
  components: Record<LivabilityComponent, number>;
  score: number;
  band: "excellent" | "good" | "moderate" | "poor";
}

const LIVABILITY_LABEL: Record<LivabilityComponent, string> = {
  healthcare: "Healthcare",
  education: "Education",
  green_space: "Green Space",
  transportation: "Transportation",
  public_services: "Public Services",
  road_connectivity: "Road Connectivity",
  environmental_quality: "Environmental Quality",
};

/** Which livability components inherit a service's data-confidence caveat. */
const LIVABILITY_COVERAGE: Partial<Record<LivabilityComponent, ServiceKey>> = {
  healthcare: "healthcare",
  education: "education",
  green_space: "parks",
  transportation: "transportation",
  road_connectivity: "road_connectivity",
};

type Mode = "deficit" | "livability";

export default function InfrastructurePage() {
  const [wards, setWards] = React.useState<Ward[]>([]);
  const [coverage, setCoverage] = React.useState<Coverage[]>([]);
  const [live, setLive] = React.useState<WardLivability[]>([]);
  const [cityScore, setCityScore] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<Mode>("deficit");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [access, setAccess] = React.useState<Access | null>(null);
  const [accLoading, setAccLoading] = React.useState(false);
  const [focus, setFocus] = React.useState<{ lng: number; lat: number; zoom?: number } | null>(null);

  React.useEffect(() => {
    api<{ wards: Ward[]; coverage: Coverage[] }>("/api/infrastructure/gaps").then((d) => {
      setWards(d.wards);
      setCoverage(d.coverage);
    });
    api<{ wards: WardLivability[]; city_score: number }>("/api/livability").then((d) => {
      setLive(d.wards);
      setCityScore(d.city_score);
    });
  }, []);

  const covBy = React.useMemo(() => {
    const m = {} as Record<ServiceKey, Coverage>;
    for (const c of coverage) m[c.service] = c;
    return m;
  }, [coverage]);

  const thin = coverage.filter((c) => c.confidence === "low");

  const analyze = async (lng: number, lat: number) => {
    setAccLoading(true);
    setFocus({ lng, lat, zoom: 13 });
    try {
      setAccess(await api<Access>(`/api/accessibility?lng=${lng}&lat=${lat}`));
    } finally {
      setAccLoading(false);
    }
  };

  return (
    <div className="h-full flex">
      {/* 15-minute city */}
      <div className="w-[300px] shrink-0 h-full overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
          <Clock className="h-3.5 w-3.5" /> 15-Minute City
        </div>
        {!access && !accLoading && (
          <div className="panel p-3 text-[12px] text-muted leading-relaxed flex gap-2">
            <MousePointerClick className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
            Click anywhere on the map to check which everyday services are reachable within 15 minutes.
          </div>
        )}
        {accLoading && (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" /> Routing…
          </div>
        )}
        {access && !accLoading && (
          <div className="space-y-3 animate-in">
            <div className="flex items-center gap-3">
              <ScoreDonut value={access.score} label="15-min" size={78} />
              <div className="text-[12px] text-muted">
                <span className="text-ink font-semibold">{access.items.filter((i) => i.reachable).length}</span> of{" "}
                {access.items.length} services reachable within 15 minutes of this point.
              </div>
            </div>
            <div className="space-y-1.5">
              {access.items.map((it) => (
                <div key={it.facility_type} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted">{titleCase(it.facility_type)}</span>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-ink">{it.minutes} min</span>
                    <span className={cn("text-sm", it.reachable ? "text-[var(--good)]" : "text-[var(--critical)]")}>
                      {it.reachable ? "✓" : "✕"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* map */}
      <div className="relative flex-1 min-w-0">
        <MapView
          layers={["boundary", "wards", "roads", "facilities"]}
          wardMetric={mode === "livability" ? "livability" : "infrastructure"}
          focus={focus}
          onMapClick={analyze}
        />
        <div className="absolute top-3 left-3 panel px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-dim mb-1.5">
            {mode === "livability" ? "Livability score by ward" : "Infrastructure score by ward"}
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-24 rounded" style={{ background: "linear-gradient(to right,#ef4444,#eab308,#22c55e)" }} />
            <span className="text-[10px] text-dim">
              {mode === "livability" ? "poor → excellent" : "critical → good"}
            </span>
          </div>
        </div>
      </div>

      {/* deficit ranking */}
      <div className="w-[340px] shrink-0 h-full overflow-y-auto border-l border-[var(--line)] bg-[var(--bg-elev)]">
        <div className="px-4 py-3 border-b border-[var(--line)] sticky top-0 bg-[var(--bg-elev)] z-10 space-y-2.5">
          <div className="flex items-center gap-2">
            {mode === "deficit" ? (
              <HeartPulse className="h-4 w-4 text-[var(--critical)]" />
            ) : (
              <Gauge className="h-4 w-4 text-[var(--accent)]" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">
                {mode === "deficit" ? "Underserved Wards" : "Urban Livability"}
              </div>
              <div className="text-[11px] text-dim">
                {mode === "deficit"
                  ? "Ranked by population × unmet need"
                  : cityScore != null
                    ? `City score ${cityScore}/100 · population-weighted`
                    : "Ranked by livability score"}
              </div>
            </div>
          </div>
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "deficit", label: "Deficits" },
              { value: "livability", label: "Livability" },
            ]}
          />
        </div>
        {thin.length > 0 && (
          <div
            key="thin-data-caveat"
            className="mx-3 mt-3 rounded-lg border px-3 py-2 text-[11px] leading-snug"
            style={{
              borderColor: "color-mix(in srgb, var(--warning) 30%, transparent)",
              background: "color-mix(in srgb, var(--warning) 10%, transparent)",
              color: "var(--text-muted)",
            }}
          >
            <span className="font-medium" style={{ color: "var(--warning)" }}>
              Read {thin.map((c) => SERVICE_LABEL[c.service].toLowerCase()).join(" and ")} scores with care.
            </span>{" "}
            OpenStreetMap records{" "}
            {thin.map((c, i) => (
              <span key={c.service}>
                {i > 0 && " and "}
                <span className="tnum text-ink">{c.mapped.toLocaleString()}</span> of ~
                <span className="tnum text-ink">{c.expected.toLocaleString()}</span> expected{" "}
                {SERVICE_LABEL[c.service].toLowerCase()} facilities
              </span>
            ))}
            . Low scores there may reflect incomplete mapping rather than a genuine service gap.
          </div>
        )}
        {mode === "livability" && (
          <div className="p-3 space-y-2">
            {live.map((w, i) => (
              <div
                key={w.ward_code}
                className={cn(
                  "rounded-lg border cursor-pointer transition-colors",
                  selected === w.ward_code
                    ? "border-[var(--accent)] bg-[var(--panel)]"
                    : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-hover)]"
                )}
                onClick={() => {
                  setSelected(selected === w.ward_code ? null : w.ward_code);
                  setFocus({ lng: w.centroid[0], lat: w.centroid[1], zoom: 12.5 });
                }}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="mono text-xs text-dim w-5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink truncate">{w.name}</div>
                    <div className="text-[11px] text-dim">
                      <span className="capitalize">{w.band}</span> · {fmtCompact(w.population)}{" "}
                      residents
                    </div>
                  </div>
                  <div className="tnum text-base font-bold" style={{ color: scoreColor(w.score) }}>
                    {w.score}
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-dim transition-transform",
                      selected === w.ward_code && "rotate-90"
                    )}
                  />
                </div>
                {selected === w.ward_code && (
                  <div className="px-3 pb-3 pt-1 border-t border-[var(--line)] space-y-2 animate-in">
                    {(Object.keys(LIVABILITY_LABEL) as LivabilityComponent[]).map((k) => {
                      const cov = LIVABILITY_COVERAGE[k];
                      return (
                        <ScoreBar
                          key={k}
                          label={
                            <>
                              {LIVABILITY_LABEL[k]}
                              {cov && covBy[cov] && <ConfidenceNote c={covBy[cov]} />}
                            </>
                          }
                          value={w.components[k]}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={cn("p-3 space-y-2", mode !== "deficit" && "hidden")}>
          {wards.map((w, i) => (
            <div
              key={w.ward_code}
              className={cn(
                "rounded-lg border cursor-pointer transition-colors",
                selected === w.ward_code ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-hover)]"
              )}
              onClick={() => {
                setSelected(selected === w.ward_code ? null : w.ward_code);
                setFocus({ lng: w.centroid[0], lat: w.centroid[1], zoom: 12.5 });
              }}
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="mono text-xs text-dim w-5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink truncate">{w.name}</div>
                  <div className="text-[11px] text-dim">{fmtCompact(w.population)} residents · {w.ward_code}</div>
                </div>
                <div className="tnum text-base font-bold" style={{ color: scoreColor(w.overall) }}>
                  {w.overall}
                </div>
                <ChevronRight className={cn("h-4 w-4 text-dim transition-transform", selected === w.ward_code && "rotate-90")} />
              </div>
              {selected === w.ward_code && (
                <div className="px-3 pb-3 pt-1 border-t border-[var(--line)] space-y-2 animate-in">
                  {(Object.keys(SERVICE_LABEL) as ServiceKey[]).map((k) => (
                    <ScoreBar
                      key={k}
                      label={
                        <>
                          {SERVICE_LABEL[k]}
                          {covBy[k] && <ConfidenceNote c={covBy[k]} />}
                        </>
                      }
                      value={w.scores[k]}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
