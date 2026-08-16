"use client";

import { useMemo, useState } from "react";
import { Landmark, MoveRight, ShieldAlert } from "lucide-react";
import { PanelShell, Section, EmptyBlock } from "./PanelShell";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { PARCELS, PARCEL_BY_ID } from "@/data/parcels";
import { WARD_BY_ID } from "@/data/wards";
import { computeSuitability, detectZoningConflicts } from "@/lib/analysis";
import { DEFAULT_WEIGHTS } from "@/types";
import { cn, scoreTone, toneText } from "@/lib/utils";

/**
 * Land Intelligence: vacant-government-land finder with an Opportunity Score
 * (same explainable engine, mixed-use profile) + zoning conflict detection.
 */
export default function LandPanel() {
  const selectParcel = useApp((s) => s.selectParcel);
  const datasetVersion = useApp((s) => s.datasetVersion);
  const [govtOnly, setGovtOnly] = useState(true);
  const [lowRisk, setLowRisk] = useState(true);
  const [developableOnly, setDevelopableOnly] = useState(true);

  const opportunities = useMemo(() => {
    return PARCELS.filter((p) => {
      if (govtOnly && p.ownership !== "government") return false;
      if (lowRisk && (p.floodRisk === "high" || p.envSensitivity > 55)) return false;
      if (developableOnly && p.builtUpPct > 25) return false;
      if (p.landUse === "water") return false;
      return true;
    })
      .map((p) => ({
        parcel: p,
        score: computeSuitability(p, "mixed", DEFAULT_WEIGHTS).score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [govtOnly, lowRisk, developableOnly, datasetVersion]);

  const conflicts = useMemo(() => detectZoningConflicts().slice(0, 6), [datasetVersion]);

  return (
    <PanelShell
      title="Land Intelligence"
      caption="GLIS registry · opportunities · zoning compliance"
    >
      <Section label="Opportunity Filters">
        <GlowCard
          glowColor="purple"
          className="space-y-1.5 p-3.5 shadow-sm"
          interactive={false}
        >
          {[
            { label: "Government-owned only", value: govtOnly, set: setGovtOnly },
            { label: "Low environmental risk", value: lowRisk, set: setLowRisk },
            { label: "Low built-up (developable)", value: developableOnly, set: setDevelopableOnly },
          ].map((f) => (
            <div key={f.label} className="flex items-center justify-between py-1">
              <span className="text-[12px] font-medium text-foreground">{f.label}</span>
              <Switch checked={f.value} onCheckedChange={f.set} />
            </div>
          ))}
        </GlowCard>
      </Section>

      <Section
        label="Opportunity Parcels"
        right={
          <span className="num text-[10.5px] font-semibold text-muted-foreground">
            {opportunities.length} shown
          </span>
        }
      >
        {opportunities.length === 0 ? (
          <EmptyBlock title="No parcels match" hint="Relax a filter to see more land." />
        ) : (
          <div className="space-y-1.5">
            {opportunities.map(({ parcel, score }) => (
              <GlowCard
                key={parcel.id}
                onClick={() => selectParcel(parcel.id, true)}
                glowColor="purple"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <Landmark size={15} className="shrink-0 text-gov" />
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-[12px] font-bold">{parcel.id}</div>
                  <div className="truncate text-[10.5px] capitalize text-muted-foreground">
                    {parcel.areaHa} ha · {parcel.landUse} ·{" "}
                    {WARD_BY_ID.get(parcel.wardId)?.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("num text-[15px] font-bold", toneText[scoreTone(score)])}>
                    {score}
                  </div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Opportunity
                  </div>
                </div>
              </GlowCard>
            ))}
          </div>
        )}
      </Section>

      <Section
        label="Zoning Conflicts"
        right={<ShieldAlert size={13} className="text-critical" />}
      >
        <div className="space-y-1.5">
          {conflicts.map((c) => {
            const p = PARCEL_BY_ID.get(c.parcelId);
            return (
              <GlowCard
                key={c.parcelId}
                onClick={() => selectParcel(c.parcelId, true)}
                glowColor={c.severity === "high" ? "red" : "orange"}
                className="w-full px-3 py-2.5 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="num text-[12px] font-bold">{c.parcelId}</span>
                  <Badge tone={c.severity === "high" ? "critical" : "warning"}>
                    {c.severity === "high" ? "HIGH" : "MODERATE"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
                  <span>Official: {c.official}</span>
                  <MoveRight size={11} />
                  <span className="font-medium text-foreground">Detected: {c.detected}</span>
                </div>
                {p && (
                  <div className="mt-1 text-[10px] text-muted-foreground/80">
                    Advisory flag — verify against the official land record.
                  </div>
                )}
              </GlowCard>
            );
          })}
        </div>
      </Section>
    </PanelShell>
  );
}
