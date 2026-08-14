"use client";

import * as React from "react";
import { Database, X } from "lucide-react";
import { api } from "@/lib/client";
import { useCity } from "@/components/shell/CityProvider";
import type { DataLayerKey, LayerProvenance, LayerSource } from "@/lib/types";

/**
 * Data provenance disclosure.
 *
 * The platform mixes official boundaries, OpenStreetMap infrastructure, modelled
 * population and synthetic demo parcels. A planner acting on these outputs has to
 * be able to see which is which, so the badge summarises the weakest layer in play
 * and the panel states every layer's real source (PRD §30, §70, §80.12).
 */

const LAYER_LABELS: Record<DataLayerKey, string> = {
  wards: "Ward boundaries",
  population: "Population",
  parcels: "Land parcels",
  facilities: "Facilities",
  roads: "Road network",
  prediction: "Growth prediction",
};

const ORDER: DataLayerKey[] = ["wards", "parcels", "facilities", "roads", "population", "prediction"];

const SOURCE_STYLE: Record<LayerSource, { color: string; label: string }> = {
  official: { color: "var(--good)", label: "Official" },
  osm: { color: "var(--gov)", label: "OpenStreetMap" },
  derived: { color: "var(--moderate)", label: "Derived" },
  synthetic: { color: "var(--warning)", label: "Synthetic" },
};

interface HealthResponse {
  sources: Record<DataLayerKey, LayerProvenance>;
  counts: Record<string, number>;
}

export function DataSources() {
  const { city, epoch } = useCity();
  // The fetched payload is tagged with the epoch it belongs to, so a response
  // for the previous city is ignored rather than briefly shown.
  const [loaded, setLoaded] = React.useState<{
    epoch: number;
    sources: Record<DataLayerKey, LayerProvenance>;
    counts: Record<string, number>;
  } | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api<HealthResponse>("/api/health")
      .then((h) => {
        if (!cancelled) setLoaded({ epoch, sources: h.sources, counts: h.counts });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [epoch]);

  const fresh = loaded?.epoch === epoch ? loaded : null;
  const sources = fresh?.sources ?? null;
  const counts = fresh?.counts ?? null;

  // Dismiss on outside click / Escape.
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The badge reports the least authoritative layer present, so a synthetic
  // layer is never hidden behind an "official" headline.
  const worst: LayerSource = React.useMemo(() => {
    if (!sources) return "synthetic";
    const rank: LayerSource[] = ["official", "osm", "derived", "synthetic"];
    let w = 0;
    for (const k of ORDER) {
      const s = sources[k];
      if (s) w = Math.max(w, rank.indexOf(s.source));
    }
    return rank[w];
  }, [sources]);

  const style = SOURCE_STYLE[worst];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium transition-colors hover:brightness-125"
        style={{
          color: style.color,
          background: `color-mix(in srgb, ${style.color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${style.color} 32%, transparent)`,
        }}
        title="Where this data comes from"
      >
        <Database className="h-3 w-3" />
        MIXED SOURCES
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[420px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <h3 className="text-[13px] font-semibold text-ink">Data provenance</h3>
              <p className="text-[11px] text-muted mt-0.5">
                {city.name}, {city.state} — what is real and what is modelled
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-dim hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-3">
            {!sources && <p className="text-xs text-dim py-2">Loading…</p>}
            {sources &&
              ORDER.map((key) => {
                const s = sources[key];
                if (!s) return null;
                const st = SOURCE_STYLE[s.source];
                const count =
                  counts?.[key] ??
                  (key === "population" ? counts?.population_cells : undefined);
                return (
                  <div key={key} className="flex gap-2.5">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: st.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-medium text-ink">{LAYER_LABELS[key]}</span>
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: st.color }}>
                          {st.label}
                        </span>
                        {count != null && (
                          <span className="text-[10px] text-dim tnum">{count.toLocaleString()}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted leading-snug mt-0.5">{s.detail}</p>
                    </div>
                  </div>
                );
              })}
          </div>

          <p className="border-t border-[var(--line)] px-4 py-2.5 text-[10px] leading-snug text-dim">
            Synthetic and derived layers are realistic in structure and behaviour but are not
            official records. Scores are computed from these inputs by deterministic formulas —
            never invented.
          </p>
        </div>
      )}
    </div>
  );
}
