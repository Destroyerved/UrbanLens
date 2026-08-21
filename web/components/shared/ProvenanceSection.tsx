"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ChevronDown } from "lucide-react";
import { Section } from "@/components/panels/PanelShell";
import {
  fetchProvenance,
  SOURCE_TONE,
  SOURCE_WORD,
  type ProvenanceReport,
} from "@/services/conservation";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { withRetry } from "@/lib/api";

/**
 * Where every layer on screen came from.
 *
 * The engine has always computed this — `_sources()` in the API returns a
 * provenance note per layer — and nothing displayed it, so a modelled figure
 * and a surveyed one arrived on screen looking identical. Stating the split is
 * not an admission; a planner deciding on this data needs to know which half
 * of it is a measurement.
 */
export function ProvenanceSection() {
  const [data, setData] = useState<ProvenanceReport | null>(null);
  const [open, setOpen] = useState(false);
  const cityId = useApp((s) => s.city.id);
  const datasetVersion = useApp((s) => s.datasetVersion);

  // Refetch per city. Fetching once on mount left the previous district's
  // provenance on screen after a switch, which is worse here than in any other
  // panel: this section exists to tell a planner which layers are measured for
  // the city in front of them, so showing another city's answer is not a stale
  // number but a wrong claim about the data's standing.
  //
  // `live` drops a response that arrives after the city moved on. The service
  // caches per city, so a slow request for the district you just left can
  // otherwise resolve last and win.
  useEffect(() => {
    let live = true;
    setData(null);
    withRetry(fetchProvenance)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData(null); });
    return () => {
      live = false;
    };
  }, [cityId, datasetVersion]);

  if (!data) return null;
  const { rollup, layers } = data;
  const entries = Object.entries(layers);
  // Modelled layers first: they are the ones a reader needs warned about, and
  // burying them under the measured ones would defeat the point of the section.
  const order = { synthetic: 0, derived: 1, satellite: 2, osm: 3, official: 4 };
  entries.sort(
    (a, b) => (order[a[1].source as keyof typeof order] ?? 9) - (order[b[1].source as keyof typeof order] ?? 9)
  );

  return (
    <Section
      label="Data Provenance"
      right={
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? "Hide" : "Details"}
          <ChevronDown size={10} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      }
    >
      <div className="rounded-2xl border border-border/60 bg-surface-2/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-bold text-foreground">
              <span className="num">{rollup.measured}</span> of{" "}
              <span className="num">{rollup.total}</span> layers are measured
            </div>
            <div className="text-[10px] text-muted-foreground">
              {rollup.derived} derived · {rollup.modelled} modelled
            </div>
          </div>
          <div className="num shrink-0 text-[15px] font-bold text-emerald-500">
            {rollup.measured_pct}%
          </div>
        </div>

        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="bg-emerald-500"
            style={{ width: `${(rollup.measured / rollup.total) * 100}%` }}
          />
          <div
            className="bg-amber-500"
            style={{ width: `${(rollup.derived / rollup.total) * 100}%` }}
          />
          <div
            className="bg-red-500"
            style={{ width: `${(rollup.modelled / rollup.total) * 100}%` }}
          />
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-1">
          {entries.map(([name, meta]) => (
            <div key={name} className="rounded-xl bg-surface-2/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[11.5px] font-bold capitalize text-foreground">
                  {name}
                </div>
                <div
                  className={cn(
                    "shrink-0 text-[9.5px] font-bold uppercase tracking-wide",
                    SOURCE_TONE[meta.source] ?? "text-muted-foreground"
                  )}
                >
                  {SOURCE_WORD[meta.source] ?? meta.source}
                </div>
              </div>
              <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                {meta.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
