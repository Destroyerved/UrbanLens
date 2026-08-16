"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Landmark, User, X } from "lucide-react";
import { Section } from "@/components/panels/PanelShell";
import { Badge } from "@/components/ui/badge";
import { SegmentedScoreBar, FactorRows, MiniScore } from "@/components/shared/ScoreBar";
import { useApp } from "@/lib/store";
import { PARCEL_BY_ID } from "@/data/parcels";
import { WARD_BY_ID } from "@/data/wards";
import { fetchParcelIntel, type ParcelIntel } from "@/services/parcels";
import { DEFAULT_WEIGHTS, type Parcel, type ProjectType } from "@/types";
import { LANDUSE_COLORS } from "@/lib/mapdata";
import { cn, formatCompact, formatKm, scoreTone, toneText } from "@/lib/utils";

function Attr({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-[12px] font-semibold text-foreground capitalize truncate">{value}</div>
    </div>
  );
}

export default function ParcelDrawer() {
  const selectedParcelId = useApp((s) => s.selectedParcelId);
  const selectParcel = useApp((s) => s.selectParcel);
  const setSimTarget = useApp((s) => s.setSimTarget);
  const setMode = useApp((s) => s.setMode);

  const parcel = selectedParcelId ? PARCEL_BY_ID.get(selectedParcelId) : null;

  // Scores, recommended uses and 15-minute access all come from the engine's
  // parcel profile — one request rather than six client-side computations.
  const [intel, setIntel] = useState<ParcelIntel | null>(null);
  useEffect(() => {
    if (!selectedParcelId) {
      setIntel(null);
      return;
    }
    let alive = true;
    setIntel(null);
    fetchParcelIntel(selectedParcelId)
      .then((d) => alive && setIntel(d))
      .catch(() => alive && setIntel(null));
    return () => {
      alive = false;
    };
  }, [selectedParcelId]);

  return (
    <AnimatePresence>
      {parcel && intel && (
        <motion.aside
          key={parcel.id}
          initial={{ x: 400, opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 40 }}
          className="glass-strong pointer-events-auto absolute bottom-3 right-3 top-[64px] z-[40] flex w-[356px] flex-col overflow-hidden rounded-2xl shadow-elev-3 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="border-b border-border/80 bg-surface-2/40 px-4 py-3 backdrop-blur-md">
            <div className="flex items-start justify-between">
              <div>
                <div className="label-caps mb-0.5 font-bold">Parcel Intelligence</div>
                <div className="num text-[17px] font-bold tracking-tight text-foreground">{parcel.id}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {WARD_BY_ID.get(parcel.wardId)?.name} · Survey {parcel.surveyNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={() => selectParcel(null)}
                className="grid h-7 w-7 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-surface-3 hover:text-foreground active:scale-95 cursor-pointer"
                aria-label="Close parcel drawer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge tone={parcel.ownership === "government" ? "gov" : "neutral"}>
                {parcel.ownership === "government" ? (
                  <>
                    <Landmark size={10} /> GOVERNMENT
                  </>
                ) : (
                  <>
                    <User size={10} /> PRIVATE
                  </>
                )}
              </Badge>
              <Badge tone="neutral">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: LANDUSE_COLORS[parcel.landUse] }}
                />
                {parcel.landUse.toUpperCase()}
              </Badge>
              <Badge
                tone={
                  parcel.floodRisk === "low"
                    ? "good"
                    : parcel.floodRisk === "medium"
                      ? "warning"
                      : "critical"
                }
              >
                FLOOD {parcel.floodRisk.toUpperCase()}
              </Badge>
            </div>
          </div>

          <div className="panel-scroll flex-1 overflow-y-auto px-4 py-3.5">
            {/* Attributes */}
            <Section label="Registry Attributes">
              <div className="glass-card grid grid-cols-3 gap-x-2 gap-y-3 rounded-2xl p-3.5 shadow-sm">
                <Attr label="Area" value={`${parcel.areaHa} ha`} />
                <Attr label="Zoning" value={parcel.zoning} />
                <Attr label="Built-up" value={`${parcel.builtUpPct}%`} />
                <Attr label="Vegetation" value={`${parcel.vegetationPct}%`} />
                <Attr label="Road" value={formatKm(parcel.roadDistKm)} />
                <Attr label="Hospital" value={formatKm(parcel.hospitalDistKm)} />
                <Attr label="School" value={formatKm(parcel.schoolDistKm)} />
                <Attr label="Transit" value={formatKm(parcel.transitDistKm)} />
                <Attr label="Pop · 3 km" value={formatCompact(parcel.population3km)} />
              </div>
            </Section>

            {/* Land use history */}
            <Section label="Land-Use History">
              <div className="flex items-center gap-1.5">
                {([2018, 2022, 2026] as const).map((y, i) => (
                  <div key={y} className="flex flex-1 items-center gap-1.5">
                    <div className="glass-card flex-1 rounded-xl px-2 py-2 text-center shadow-xs">
                      <div className="num text-[10px] font-bold text-muted-foreground">{y}</div>
                      <div className="mt-0.5 flex items-center justify-center gap-1 text-[10.5px] font-semibold capitalize text-foreground">
                        <span
                          className="h-2 w-2 rounded-full ring-1 ring-black/10"
                          style={{ background: LANDUSE_COLORS[parcel.landUseByYear[y]] }}
                        />
                        {parcel.landUseByYear[y]}
                      </div>
                    </div>
                    {i < 2 && <span className="text-muted-foreground font-bold">→</span>}
                  </div>
                ))}
              </div>
            </Section>

            {/* Scores */}
            <Section
              label="Hospital Suitability"
              right={
                <span className={cn("num text-[15px] font-bold", toneText[scoreTone(intel.hospital.score)])}>
                  {intel.hospital.score}
                  <span className="text-[10px] font-normal text-muted-foreground"> /100</span>
                </span>
              }
            >
              <SegmentedScoreBar factors={intel.hospital.factors} className="mb-3" />
              <FactorRows factors={intel.hospital.factors} />
            </Section>

            <Section label="Location Scores">
              <div className="glass-card space-y-2 rounded-2xl p-3.5 shadow-sm">
                <MiniScore label="Accessibility (15-min)" score={intel.access.score} />
                <MiniScore label="Infrastructure readiness" score={parcel.infraReadiness} />
                <MiniScore
                  label="Environmental suitability"
                  score={Math.max(0, 100 - parcel.envSensitivity - (parcel.floodRisk === "low" ? 0 : parcel.floodRisk === "medium" ? 30 : 60))}
                />
                <MiniScore label="Development potential" score={intel.development} />
              </div>
            </Section>

            {/* Recommended uses */}
            <Section label="Recommended Uses">
              <div className="space-y-1.5">
                {intel.recs.map((r: ParcelIntel["recs"][number], i: number) => (
                  <div
                    key={r.type}
                    className="glass-card flex items-center justify-between rounded-xl px-3 py-2"
                  >
                    <span className="text-[12px] font-medium text-foreground">
                      <span className="num mr-1.5 font-bold text-muted-foreground">{i + 1}.</span>
                      {r.label}
                    </span>
                    <span className={cn("num text-[13px] font-bold", toneText[scoreTone(r.score)])}>
                      {r.score}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Actions */}
          <div className="border-t border-border/80 bg-surface-2/40 p-3 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setSimTarget(parcel.id);
                setMode("simulator");
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[13px] font-bold text-accent-foreground shadow-md shadow-accent/25 ring-1 ring-accent/60 transition-all hover:scale-[1.01] hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <FlaskConical size={16} />
              <span>Simulate intervention here</span>
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
