"use client";

import { useEffect, useState } from "react";
import { Leaf, ShieldAlert } from "lucide-react";
import { PanelShell, Section, LoadingBlock } from "./PanelShell";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { withRetry } from "@/lib/api";
import {
  fetchConservation,
  fetchEncroachment,
  type ConservationReport,
  type EncroachmentReport,
} from "@/services/conservation";
import { cn, formatCompact } from "@/lib/utils";

type Tab = "priority" | "encroachment";

export default function ConservationPanel() {
  const [tab, setTab] = useState<Tab>("priority");
  const [cons, setCons] = useState<ConservationReport | null>(null);
  const [enc, setEnc] = useState<EncroachmentReport | null>(null);
  const [failed, setFailed] = useState(false);
  const flyTo = useApp((s) => s.flyTo);

  useEffect(() => {
    withRetry(fetchConservation).then(setCons).catch(() => setFailed(true));
    withRetry(fetchEncroachment).then(setEnc).catch(() => setFailed(true));
  }, []);

  const loading = tab === "priority" ? !cons : !enc;

  return (
    <PanelShell
      title="Conservation & Encroachment"
      caption="Ecological value under development pressure"
      footer={
        <div className="text-[10.5px] leading-relaxed text-muted-foreground">
          Built only from measured layers — OSM water and green space, Sentinel-2 NDVI,
          DEM flood. Ownership and zoning are modelled here and are deliberately not used.
        </div>
      }
    >
      <div className="mb-3 flex gap-1 rounded-xl bg-surface-2/50 p-1">
        {([
          ["priority", "Priority"],
          ["encroachment", "Encroachment"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-bold transition-all",
              tab === id
                ? "bg-white/15 text-foreground shadow-elev-1"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {failed && (
        <div className="py-6 text-center text-[12px] text-muted-foreground">
          The engine could not return this analysis for the current study area.
        </div>
      )}

      {!failed && loading && <LoadingBlock label="Intersecting ecology with growth pressure…" />}

      {!failed && tab === "priority" && cons && (
        <>
          <Section label="Sensitive land under pressure">
            <div className="grid grid-cols-2 gap-2">
              <GlowCard className="rounded-2xl p-3">
                <div className="num text-[22px] font-bold leading-none text-amber-500">
                  {cons.summary.cells_at_risk}
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
                  cells where ecology meets high growth pressure
                </div>
                <div className="num mt-1 text-[11px] font-semibold text-foreground">
                  {cons.summary.share_at_risk_pct}% of {cons.cell_count}
                </div>
              </GlowCard>
              <GlowCard className="rounded-2xl p-3">
                <div className="num text-[22px] font-bold leading-none text-foreground">
                  {cons.summary.mean_sensitivity}
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
                  mean ecological sensitivity / 100
                </div>
                <div className="num mt-1 text-[11px] font-semibold text-foreground">
                  peak priority {cons.summary.peak_priority}
                </div>
              </GlowCard>
            </div>
            <div className="mt-2 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Priority is sensitivity <span className="font-bold">×</span> pressure, not their
              sum. Untouched land with no pressure on it needs no conservation plan; the
              product only rises where ecological value and development pressure coincide.
            </div>
          </Section>

          <Section label="Highest-priority cells">
            <div className="space-y-1.5">
              {cons.priorities.slice(0, 6).map((c, i) => (
                <button
                  key={`${c.centroid[0]},${c.centroid[1]}`}
                  onClick={() => flyTo(c.centroid, 13)}
                  className="flex w-full items-center gap-2 rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-2 text-left transition-all hover:bg-surface-3 active:scale-[0.99]"
                >
                  <div className="num grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-bold text-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="num text-[11.5px] font-bold text-foreground">
                      {c.centroid[1].toFixed(3)}°N {c.centroid[0].toFixed(3)}°E
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      sensitivity <span className="num">{c.sensitivity}</span> · pressure{" "}
                      <span className="num">{Math.round(c.pressure * 100)}%</span>
                    </div>
                  </div>
                  <div className="num shrink-0 text-[15px] font-bold text-amber-500">
                    {c.priority}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <div className="flex items-start gap-1.5 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-2">
            <Leaf size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              Sensitivity weights green cover {Math.round((cons.weights.green ?? 0) * 100)}%,
              water {Math.round((cons.weights.water ?? 0) * 100)}%, NDVI{" "}
              {Math.round((cons.weights.ndvi ?? 0) * 100)}%, flood{" "}
              {Math.round((cons.weights.flood ?? 0) * 100)}%.
            </div>
          </div>
        </>
      )}

      {!failed && tab === "encroachment" && enc && (
        <>
          <Section label="Built land inside protected polygons">
            <div className="grid grid-cols-2 gap-2">
              <GlowCard className="rounded-2xl p-3">
                <div className="num text-[22px] font-bold leading-none text-red-500">
                  {enc.summary.total_overlap_ha}
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
                  hectares of overlap detected
                </div>
                <div className="num mt-1 text-[11px] font-semibold text-foreground">
                  {enc.summary.candidates} candidates
                </div>
              </GlowCard>
              <GlowCard className="rounded-2xl p-3">
                <div className="num text-[22px] font-bold leading-none text-foreground">
                  {enc.summary.water_overlap_ha}
                </div>
                <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
                  hectares on water bodies
                </div>
                <div className="num mt-1 text-[11px] font-semibold text-foreground">
                  {enc.summary.green_overlap_ha} ha on green space
                </div>
              </GlowCard>
            </div>
            <div className="mt-2 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
              Screening, not a finding. {enc.summary.likely} show partial overlap — the
              signature of an actual intrusion — and {enc.summary.needs_review} sit wholly
              inside their target, which is as often one feature mapped in two layers as it
              is occupation. Every case needs verification on the ground.
            </div>
          </Section>

          <Section label="Largest candidates">
            <div className="space-y-1.5">
              {enc.candidates.slice(0, 8).map((c) => (
                <button
                  key={`${c.parcel_id}-${c.target_name}`}
                  onClick={() => flyTo(c.centroid, 15)}
                  className="flex w-full items-center gap-2 rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-2 text-left transition-all hover:bg-surface-3 active:scale-[0.99]"
                >
                  <div
                    className={cn(
                      "h-8 w-1 shrink-0 rounded-full",
                      c.intrudes_on === "water" ? "bg-sky-500" : "bg-emerald-500"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] font-bold text-foreground">
                      {c.target_name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {c.land_use} · <span className="num">{c.overlap_pct}%</span> of{" "}
                      {c.parcel_id}
                      {c.confidence === "review" && " · needs review"}
                    </div>
                  </div>
                  <div className="num shrink-0 text-right text-[11.5px] font-bold text-foreground">
                    {formatCompact(c.overlap_sqm)}
                    <span className="text-[9px] font-normal text-muted-foreground"> m²</span>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <div className="flex items-start gap-1.5 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-2">
            <ShieldAlert size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              Only parcels traced from a mapped boundary are tested — never the modelled
              gap-fill grid, and never against ownership, which is modelled for all but a
              handful of records.
            </div>
          </div>
        </>
      )}
    </PanelShell>
  );
}
