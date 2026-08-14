"use client";

import * as React from "react";
import { Target, Check, ChevronRight, Sliders, Building2, MapPin, Loader2 } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import type { MapMarker } from "@/components/map/CityMap";
import { postJSON } from "@/lib/client";
import { cn, scoreColor, fmtInt } from "@/lib/ui";
import { Segmented, Slider, ScoreBar, Badge } from "@/components/ui/kit";
import { PROJECTS, DEFAULT_WEIGHTS, WEIGHT_LABELS, ProjectType, Weights } from "@/lib/scoring";

interface Result {
  parcel_id: string;
  final: number;
  pop: number;
  centroid: [number, number];
  breakdown: Record<keyof Weights, number>;
  metrics: { roadKm: number; floodRisk: string; ownership: string; areaAcres: number };
  explanation: { pros: string[]; cons: string[] };
}

const PROJECT_KEYS = Object.keys(PROJECTS) as ProjectType[];

export default function SiteSelectionPage() {
  const [project, setProject] = React.useState<ProjectType>("hospital");
  const [minHa, setMinHa] = React.useState(2);
  const [govOnly, setGovOnly] = React.useState(true);
  const [lowFlood, setLowFlood] = React.useState(true);
  const [maxRoad, setMaxRoad] = React.useState(3);
  const [weights, setWeights] = React.useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [results, setResults] = React.useState<Result[]>([]);
  const [eligible, setEligible] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await postJSON<{ results: Result[]; eligible: number }>("/api/suitability/search", {
        project_type: project,
        minimum_area_hectares: minHa,
        government_land: govOnly,
        low_flood_risk: lowFlood,
        max_road_distance_km: maxRoad,
        weights,
        limit: 10,
      });
      setResults(res.results);
      setEligible(res.eligible);
      setSelected(res.results[0]?.parcel_id ?? null);
    } finally {
      setLoading(false);
    }
  }, [project, minHa, govOnly, lowFlood, maxRoad, weights]);

  // Auto-run (debounced) whenever any input changes — live "adjust & re-rank".
  React.useEffect(() => {
    const t = setTimeout(run, 350);
    return () => clearTimeout(t);
  }, [run]);

  const markers: MapMarker[] = results.slice(0, 5).map((r, i) => ({
    id: r.parcel_id,
    lng: r.centroid[0],
    lat: r.centroid[1],
    color: i === 0 ? "#22d3ee" : "#38bdf8",
    text: String(i + 1),
    label: `#${i + 1} ${r.parcel_id} · ${r.final}/100`,
  }));
  const selectedResult = results.find((r) => r.parcel_id === selected) ?? null;
  const focus = selectedResult
    ? { lng: selectedResult.centroid[0], lat: selectedResult.centroid[1], zoom: 13.5 }
    : results[0]
      ? { lng: results[0].centroid[0], lat: results[0].centroid[1], zoom: 12 }
      : null;

  const setWeight = (k: keyof Weights, v: number) => setWeights((w) => ({ ...w, [k]: v / 100 }));
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <div className="h-full flex">
      {/* controls */}
      <div className="w-[310px] shrink-0 h-full overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted mb-2">
            <Target className="h-3.5 w-3.5" /> Project Type
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PROJECT_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setProject(k)}
                className={cn(
                  "text-left rounded-lg px-2.5 py-2 text-[12px] border transition-colors",
                  project === k
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-ink"
                    : "border-[var(--line)] text-muted hover:text-ink hover:bg-[var(--panel)]"
                )}
              >
                {PROJECTS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Constraints</div>
          <RangeRow label="Minimum area" value={`${minHa} ha`}>
            <Slider value={minHa} onChange={setMinHa} min={0.5} max={20} step={0.5} />
          </RangeRow>
          <RangeRow label="Max road distance" value={`${maxRoad} km`}>
            <Slider value={maxRoad} onChange={setMaxRoad} min={0.5} max={8} step={0.5} />
          </RangeRow>
          <Toggle label="Government land only" on={govOnly} onToggle={() => setGovOnly((v) => !v)} />
          <Toggle label="Exclude high flood risk" on={lowFlood} onToggle={() => setLowFlood((v) => !v)} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
            <Sliders className="h-3.5 w-3.5" /> Planning Weights
          </div>
          <p className="text-[11px] text-dim -mt-1">Adjust priorities — results re-rank live.</p>
          {(Object.keys(WEIGHT_LABELS) as (keyof Weights)[]).map((k) => (
            <div key={k}>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-muted">{WEIGHT_LABELS[k]}</span>
                <span className="tnum text-ink">{Math.round((weights[k] / weightTotal) * 100)}%</span>
              </div>
              <Slider value={Math.round(weights[k] * 100)} onChange={(v) => setWeight(k, v)} min={0} max={40} />
            </div>
          ))}
        </div>
      </div>

      {/* map */}
      <div className="relative flex-1 min-w-0">
        <MapView
          layers={["boundary", "roads", "parcels", "facilities"]}
          parcelColorMode="development"
          facilityTypes={PROJECTS[project].needFacility ? [PROJECTS[project].needFacility!] : undefined}
          highlightParcelIds={results.map((r) => r.parcel_id)}
          selectedParcelId={selected}
          onSelectParcel={setSelected}
          markers={markers}
          focus={focus}
        />
        <div className="absolute top-3 left-3 panel px-3 py-2 text-xs flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-[var(--good)]" />
          )}
          <span className="text-muted">
            {eligible != null ? (
              <>
                <span className="text-ink font-semibold">{eligible}</span> eligible parcels evaluated
              </>
            ) : (
              "Evaluating…"
            )}
          </span>
        </div>
      </div>

      {/* results */}
      <div className="w-[340px] shrink-0 h-full overflow-y-auto border-l border-[var(--line)] bg-[var(--bg-elev)]">
        <div className="px-4 py-3 border-b border-[var(--line)] sticky top-0 bg-[var(--bg-elev)] z-10">
          <div className="text-[11px] uppercase tracking-wide text-dim">Best sites for</div>
          <div className="text-sm font-semibold text-ink">{PROJECTS[project].label}</div>
        </div>
        <div className="p-3 space-y-2">
          {results.map((r, i) => (
            <ResultCard
              key={r.parcel_id}
              rank={i + 1}
              result={r}
              open={selected === r.parcel_id}
              onClick={() => setSelected(r.parcel_id)}
            />
          ))}
          {!loading && results.length === 0 && (
            <div className="text-sm text-dim text-center py-8">
              No parcels match these constraints. Try relaxing them.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RangeRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1.5">
        <span className="text-muted">{label}</span>
        <span className="tnum text-ink font-medium">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between text-[12px] py-0.5">
      <span className="text-muted">{label}</span>
      <span className={cn("h-4 w-7 rounded-full relative transition-colors", on ? "bg-[var(--accent)]" : "bg-[var(--panel-2)]")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
      </span>
    </button>
  );
}

function ResultCard({
  rank,
  result,
  open,
  onClick,
}: {
  rank: number;
  result: Result;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors cursor-pointer",
        open ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-hover)]"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
          style={{ background: rank === 1 ? "#22d3ee" : "var(--panel-2)", color: rank === 1 ? "#0b1220" : "var(--text)" }}
        >
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mono text-[13px] text-ink truncate">{result.parcel_id}</div>
          <div className="text-[11px] text-dim flex items-center gap-1.5">
            <Building2 className="h-3 w-3" /> {result.metrics.ownership} · {result.metrics.areaAcres} ac
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="tnum text-lg font-bold leading-none" style={{ color: scoreColor(result.final) }}>
            {result.final}
          </div>
          <div className="text-[10px] text-dim">/ 100</div>
        </div>
        <ChevronRight className={cn("h-4 w-4 text-dim transition-transform", open && "rotate-90")} />
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-[var(--line)] space-y-3 animate-in">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2">
            {(Object.keys(result.breakdown) as (keyof Weights)[]).map((k) => (
              <ScoreBar key={k} label={WEIGHT_LABELS[k]} value={result.breakdown[k]} />
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <MapPin className="h-3 w-3" /> Serves ~{fmtInt(result.pop)} residents · {result.metrics.roadKm.toFixed(1)} km to road
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--good)] mb-1">Why this ranked #{rank}</div>
            <ul className="space-y-1">
              {result.explanation.pros.map((p, i) => (
                <li key={i} className="text-[12px] text-muted flex gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[var(--good)] shrink-0 mt-0.5" /> {p}
                </li>
              ))}
            </ul>
          </div>
          {result.explanation.cons.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--warning)] mb-1">Potential issues</div>
              <ul className="space-y-1">
                {result.explanation.cons.map((c, i) => (
                  <li key={i} className="text-[12px] text-dim flex gap-1.5">
                    <span className="text-[var(--warning)]">⚠</span> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Badge color={result.metrics.floodRisk === "low" ? "#22c55e" : "#eab308"}>
            {result.metrics.floodRisk} flood risk
          </Badge>
        </div>
      )}
    </div>
  );
}
