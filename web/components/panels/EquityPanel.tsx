"use client";

import { useEffect, useState } from "react";
import { Users, FileSpreadsheet } from "lucide-react";
import { PanelShell, Section, LoadingBlock } from "./PanelShell";
import { GlowCard } from "@/components/ui/spotlight-card";
import { useApp } from "@/lib/store";
import { withRetry } from "@/lib/api";
import { fetchEquity, SERVICE_LABEL, type EquityReport } from "@/services/equity";
import { cn, formatCompact } from "@/lib/utils";
import { downloadEquityExport } from "@/lib/export";

/** Gini bands, phrased for a planner rather than an economist. */
function giniLabel(g: number): { text: string; tone: string } {
  if (g < 0.10) return { text: "Fairly even", tone: "text-emerald-500" };
  if (g < 0.20) return { text: "Moderate spread", tone: "text-amber-500" };
  if (g < 0.30) return { text: "Wide spread", tone: "text-orange-500" };
  return { text: "Severe spread", tone: "text-red-500" };
}

export default function EquityPanel() {
  const [data, setData] = useState<EquityReport | null>(null);
  const [failed, setFailed] = useState(false);
  const flyTo = useApp((s) => s.flyTo);
  const highlightWards = useApp((s) => s.highlightWards);
  const datasetVersion = useApp((s) => s.datasetVersion);
  const cityId = useApp((s) => s.city.id);

  useEffect(() => {
    setFailed(false);
    withRetry(fetchEquity).then(setData).catch(() => setFailed(true));
  }, [cityId, datasetVersion]);

  if (failed)
    return (
      <PanelShell title="Service Equity" caption="Distribution of provision across residents">
        <div className="py-6 text-center text-[12px] text-muted-foreground">
          The engine could not return an equity report for this study area.
        </div>
      </PanelShell>
    );

  if (!data)
    return (
      <PanelShell title="Service Equity" caption="Distribution of provision across residents">
        <LoadingBlock label="Measuring distribution across wards…" />
      </PanelShell>
    );

  const composite = data.inequality.composite;
  const gini = giniLabel(composite.gini);
  const dep = data.deprivation;
  // Rank services by how unequally they are spread — the top row is the
  // systematic shortfall, which is what an equity intervention should target.
  const services = Object.entries(data.inequality)
    .filter(([k]) => k !== "composite")
    .sort((a, b) => b[1].gini - a[1].gini);

  return (
    <PanelShell
      title="Service Equity"
      caption="Distribution of provision across residents"
      footer={
        <div className="text-[10.5px] leading-relaxed text-muted-foreground">
          Population-weighted across {dep.ward_count} wards. Derived from the same
          engine components as Infrastructure, so ward readings always agree.
        </div>
      }
    >
      <Section
        label="Headline"
        right={
          <button
            type="button"
            onClick={() => void downloadEquityExport(cityId)}
            className="glass flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-semibold text-muted-foreground hover:text-foreground transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
            title="Download equity report as CSV"
          >
            <FileSpreadsheet size={11} className="text-good" />
            <span>Export CSV</span>
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <GlowCard className="rounded-2xl p-3">
            <div
              className={cn(
                "num text-[22px] font-bold leading-none",
                dep.population_share_pct > 0 ? "text-foreground" : "text-emerald-500"
              )}
            >
              {dep.population_share_pct}%
            </div>
            <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
              of residents below this city&rsquo;s floor of {data.floor}
            </div>
            <div className="num mt-1 text-[11px] font-semibold text-foreground">
              {dep.population_share_pct > 0
                ? `${formatCompact(dep.population_below_floor)} people`
                : "no ward falls below it"}
            </div>
          </GlowCard>
          <GlowCard className="rounded-2xl p-3">
            <div className={cn("num text-[22px] font-bold leading-none", gini.tone)}>
              {composite.gini.toFixed(3)}
            </div>
            <div className="mt-1 text-[10.5px] leading-tight text-muted-foreground">
              Gini across people — {gini.text}
            </div>
            <div className="num mt-1 text-[11px] font-semibold text-foreground">
              {dep.wards_below_floor} of {dep.ward_count} wards
            </div>
          </GlowCard>
        </div>

        <div className="mt-2 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Floor is city-relative: {data.floor_detail}. A fixed mark would read as
          &ldquo;badly underserved&rdquo; in one district and &ldquo;slightly below par&rdquo;
          in another.
        </div>

        {/* A relative floor measures inequality within a district and cannot
            see one that is uniformly badly served, so the fixed floor is shown
            next to it whenever the two disagree. */}
        {dep.absolute_share_pct !== dep.population_share_pct && (
          <div className="mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-1.5 text-[10px] leading-relaxed text-foreground">
            Against the fixed floor of {dep.absolute_floor},{" "}
            <span className="num font-bold">{dep.absolute_share_pct}%</span> of residents
            ({formatCompact(dep.population_below_absolute)}) are below —{" "}
            {dep.absolute_share_pct > dep.population_share_pct
              ? "provision here is evenly spread but low overall."
              : "provision is high overall but unevenly spread."}
          </div>
        )}

        {composite.p90_p10_ratio && (
          <div className="mt-2 rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-2">
            <div className="text-[11px] leading-relaxed text-foreground">
              The best-served tenth of residents has{" "}
              <span className="num font-bold">{composite.p90_p10_ratio}×</span> the
              service level of the worst-served tenth
              <span className="text-muted-foreground">
                {" "}
                ({composite.p10} vs {composite.p90} out of 100).
              </span>
            </div>
          </div>
        )}
      </Section>

      <Section label="Which service is spread most unequally">
        <div className="space-y-1">
          {services.map(([key, d], i) => (
            <div
              key={key}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2.5 py-1.5",
                i === 0 ? "bg-amber-500/10 ring-1 ring-amber-500/30" : "bg-surface-2/40"
              )}
            >
              <div className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-foreground">
                {SERVICE_LABEL[key] ?? key}
              </div>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn("h-full rounded-full", i === 0 ? "bg-amber-500" : "bg-sky-500/70")}
                  // Gini above 0.4 is already extreme; scaling to that keeps
                  // small real differences visible instead of all-tiny bars.
                  style={{ width: `${Math.min(100, (d.gini / 0.4) * 100)}%` }}
                />
              </div>
              <div className="num w-10 text-right text-[11px] font-bold text-muted-foreground">
                {d.gini.toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Where a fix reaches the most people">
        <div className="space-y-1.5">
          {data.priorities.slice(0, 6).map((w, i) => (
            <button
              key={w.ward_code}
              onClick={() => {
                highlightWards([w.ward_code]);
                flyTo(w.centroid, 12.5);
              }}
              className="flex w-full items-center gap-2 rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-2 text-left transition-all hover:bg-surface-3 active:scale-[0.99]"
            >
              <div className="num grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-bold text-foreground">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold text-foreground">{w.name}</div>
                <div className="text-[10.5px] text-muted-foreground">
                  <span className="num">{formatCompact(w.population)}</span> residents · weakest:{" "}
                  {w.weakest_component ? SERVICE_LABEL[w.weakest_component] ?? w.weakest_component : "—"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    "num text-[15px] font-bold leading-none",
                    w.score < data.floor ? "text-red-500" : "text-foreground"
                  )}
                >
                  {w.score}
                </div>
                <div className="text-[9.5px] text-muted-foreground">
                  target {data.target_score}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <div className="flex items-start gap-1.5 rounded-xl border border-border/50 bg-surface-2/30 px-2.5 py-2">
        <Users size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-[10px] leading-relaxed text-muted-foreground">
          Ranked by the gap to {data.target_score} — what this city already achieves for
          its best-served tenth — weighted by residents, so a small ward with an extreme
          score does not outrank a large ward with a moderate one. Red marks wards under
          the floor.
        </div>
      </div>
    </PanelShell>
  );
}
