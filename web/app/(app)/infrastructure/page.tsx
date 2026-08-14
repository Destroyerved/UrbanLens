"use client";

import * as React from "react";
import { HeartPulse, Clock, MousePointerClick, ChevronRight, Loader2 } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { api } from "@/lib/client";
import { cn, fmtCompact, scoreColor, titleCase } from "@/lib/ui";
import { ScoreBar, ScoreDonut } from "@/components/ui/kit";

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

export default function InfrastructurePage() {
  const [wards, setWards] = React.useState<Ward[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [access, setAccess] = React.useState<Access | null>(null);
  const [accLoading, setAccLoading] = React.useState(false);
  const [focus, setFocus] = React.useState<{ lng: number; lat: number; zoom?: number } | null>(null);

  React.useEffect(() => {
    api<{ wards: Ward[] }>("/api/infrastructure/gaps").then((d) => setWards(d.wards));
  }, []);

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
          wardMetric="infrastructure"
          focus={focus}
          onMapClick={analyze}
        />
        <div className="absolute top-3 left-3 panel px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-dim mb-1.5">Infrastructure score by ward</div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-24 rounded" style={{ background: "linear-gradient(to right,#ef4444,#eab308,#22c55e)" }} />
            <span className="text-[10px] text-dim">critical → good</span>
          </div>
        </div>
      </div>

      {/* deficit ranking */}
      <div className="w-[340px] shrink-0 h-full overflow-y-auto border-l border-[var(--line)] bg-[var(--bg-elev)]">
        <div className="px-4 py-3 border-b border-[var(--line)] sticky top-0 bg-[var(--bg-elev)] z-10 flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-[var(--critical)]" />
          <div>
            <div className="text-sm font-semibold text-ink">Underserved Wards</div>
            <div className="text-[11px] text-dim">Ranked by population × unmet need</div>
          </div>
        </div>
        <div className="p-3 space-y-2">
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
                  <ScoreBar label="Healthcare" value={w.scores.healthcare} />
                  <ScoreBar label="Education" value={w.scores.education} />
                  <ScoreBar label="Parks & Green" value={w.scores.parks} />
                  <ScoreBar label="Transportation" value={w.scores.transportation} />
                  <ScoreBar label="Road Connectivity" value={w.scores.road_connectivity} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
