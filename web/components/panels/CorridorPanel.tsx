"use client";

import { useEffect, useState } from "react";
import { Route, MapPin, RotateCcw } from "lucide-react";
import { PanelShell, Section, LoadingBlock } from "./PanelShell";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { routeCorridor, type CorridorResult } from "@/services/conservation";
import { cn, formatCompact } from "@/lib/utils";
import type { LngLat } from "@/types";

/**
 * Least-cost alignment for linear infrastructure.
 *
 * Point facilities are sited by score; a road, canal or transmission line is
 * chosen by what the alignment has to cross. The panel takes two clicks on the
 * map and asks the engine for the cheapest path between them over a cost
 * surface built from water, green space, flood plain, population and the
 * existing road network.
 */
export default function CorridorPanel() {
  const mapClick = useApp((s) => s.mapClick);
  const setCorridorPath = useApp((s) => s.setCorridorPath);

  const [start, setStart] = useState<LngLat | null>(null);
  const [end, setEnd] = useState<LngLat | null>(null);
  const [result, setResult] = useState<CorridorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two clicks define the corridor; a third starts over, so the panel never
  // reaches a state the user cannot get out of without a reset button.
  useEffect(() => {
    if (!mapClick) return;
    if (!start || (start && end)) {
      setStart(mapClick);
      setEnd(null);
      setResult(null);
      setError(null);
      setCorridorPath(null);
    } else {
      setEnd(mapClick);
    }
  }, [mapClick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!start || !end) return;
    setBusy(true);
    setError(null);
    routeCorridor(start, end)
      .then((r) => {
        if (!r.found) {
          setError(r.reason ?? "No route across the study area.");
          setResult(null);
          setCorridorPath(null);
          return;
        }
        setResult(r);
        setCorridorPath(r.path);
      })
      .catch(() => setError("The engine could not route this corridor."))
      .finally(() => setBusy(false));
  }, [start, end, setCorridorPath]);

  const reset = () => {
    setStart(null);
    setEnd(null);
    setResult(null);
    setError(null);
    setCorridorPath(null);
  };

  return (
    <PanelShell
      title="Infrastructure Corridor"
      caption="Least-cost alignment for roads, canals & lines"
      footer={
        <div className="text-[10.5px] leading-relaxed text-muted-foreground">
          Cost surface: water, green space, flood plain, population density and the
          existing road network. Ownership and zoning are excluded — both are modelled,
          and a route avoiding invented owners would be fiction.
        </div>
      }
    >
      <Section
        label="Endpoints"
        right={
          (start || end) && (
            <button
              onClick={reset}
              className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw size={10} /> Reset
            </button>
          )
        }
      >
        <div className="space-y-1.5">
          {([
            ["Start", start],
            ["End", end],
          ] as [string, LngLat | null][]).map(([label, pt]) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2",
                pt
                  ? "border-border/60 bg-surface-2/40"
                  : "border-dashed border-border/50 bg-transparent"
              )}
            >
              <MapPin size={12} className={pt ? "text-cyan-400" : "text-muted-foreground"} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <div className="num truncate text-[11.5px] font-bold text-foreground">
                  {pt ? `${pt[1].toFixed(4)}°N ${pt[0].toFixed(4)}°E` : "click the map"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {busy && <LoadingBlock label="Searching the cost surface…" />}

      {error && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500">
          {error}
        </div>
      )}

      {result && !busy && (
        <>
          <Section label="Alignment">
            <div className="grid grid-cols-2 gap-2">
              <GlowCard className="rounded-2xl p-3">
                <div className="num text-[22px] font-bold leading-none text-foreground">
                  {result.length_km}
                  <span className="text-[12px] font-semibold text-muted-foreground"> km</span>
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
                  routed length
                </div>
                <div className="num mt-1 text-[11px] font-semibold text-foreground">
                  {result.straight_km} km straight
                </div>
              </GlowCard>
              <GlowCard className="rounded-2xl p-3">
                <div
                  className={cn(
                    "num text-[22px] font-bold leading-none",
                    result.detour_pct > 60 ? "text-amber-500" : "text-emerald-500"
                  )}
                >
                  +{result.detour_pct}%
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
                  detour taken to avoid cost
                </div>
                <div className="num mt-1 text-[11px] font-semibold text-foreground">
                  {result.impact.reuse_pct}% on existing road
                </div>
              </GlowCard>
            </div>
            {result.clamped && (
              <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-500">
                An endpoint fell outside the study area and was snapped to the nearest cell.
                Length and detour are measured against the route actually attempted.
              </div>
            )}
          </Section>

          <Section label="What it crosses">
            <div className="space-y-1">
              {([
                ["Population served", formatCompact(result.impact.population_served), "text-foreground"],
                ["Water crossings", `${result.impact.water_crossings}`, result.impact.water_crossings ? "text-sky-400" : "text-muted-foreground"],
                ["Green-space cells", `${result.impact.green_cells}`, result.impact.green_cells ? "text-emerald-400" : "text-muted-foreground"],
                ["Flood-plain cells", `${result.impact.flood_cells}`, result.impact.flood_cells ? "text-amber-400" : "text-muted-foreground"],
              ] as [string, string, string][]).map(([label, value, tone]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl bg-surface-2/40 px-3 py-1.5"
                >
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className={cn("num text-[12px] font-bold", tone)}>{value}</div>
                </div>
              ))}
            </div>
          </Section>

          <div className="flex items-start gap-1.5 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-2">
            <Route size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              Cells are ~{result.cells ? "1" : "1"} km. The straight line is shown for
              comparison so the detour — and what it bought — can be argued with rather
              than taken on trust.
            </div>
          </div>
        </>
      )}

      {!start && !busy && !result && (
        <div className="py-4 text-center text-[11.5px] text-muted-foreground">
          Click two points on the map to route a corridor between them.
        </div>
      )}
    </PanelShell>
  );
}
