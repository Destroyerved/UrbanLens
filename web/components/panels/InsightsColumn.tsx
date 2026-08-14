"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp, HeartPulse, LandPlot, AlertTriangle, ArrowRight } from "lucide-react";
import { api } from "@/lib/client";
import { fmtCompact, fmtInt, scoreColor } from "@/lib/ui";
import { Spinner } from "@/components/ui/kit";
import type { CityOverview } from "@/lib/gis/overview";

interface Growth {
  corridors: { name: string; risk: string; predicted_growth_pct: number; population: number }[];
}
interface Gaps {
  wards: { name: string; ward_code: string; overall: number; population: number }[];
}

export function InsightsColumn({ overview }: { overview: CityOverview | null }) {
  const [growth, setGrowth] = React.useState<Growth | null>(null);
  const [gaps, setGaps] = React.useState<Gaps | null>(null);

  React.useEffect(() => {
    api<Growth>("/api/growth").then(setGrowth).catch(() => {});
    api<Gaps>("/api/infrastructure/gaps").then(setGaps).catch(() => {});
  }, []);

  return (
    <div className="w-[360px] shrink-0 h-full overflow-y-auto border-l border-[var(--line)] bg-[var(--bg-elev)] p-3 space-y-3">
      <Card
        icon={<TrendingUp className="h-4 w-4 text-[var(--warning)]" />}
        title="Growth Hotspots"
        href="/growth"
      >
        {!growth ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {growth.corridors.map((c) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] text-ink truncate">{c.name}</div>
                  <div className="text-[11px] text-dim">{fmtCompact(c.population)} residents</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="tnum text-sm font-semibold" style={{ color: c.predicted_growth_pct > 55 ? "var(--critical)" : "var(--warning)" }}>
                    {c.predicted_growth_pct}%
                  </div>
                  <div className="text-[10px] text-dim">{c.risk}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        icon={<HeartPulse className="h-4 w-4 text-[var(--critical)]" />}
        title="Infrastructure Gaps"
        href="/infrastructure"
      >
        {!gaps ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {gaps.wards.slice(0, 4).map((w) => (
              <div key={w.ward_code} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] text-ink truncate">{w.name}</div>
                  <div className="text-[11px] text-dim">{fmtCompact(w.population)} residents</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <div className="w-14 h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w.overall}%`, background: scoreColor(w.overall) }} />
                  </div>
                  <span className="tnum text-xs w-6 text-right" style={{ color: scoreColor(w.overall) }}>
                    {w.overall}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        icon={<LandPlot className="h-4 w-4 text-[var(--accent)]" />}
        title="Opportunity Land"
        href="/land"
      >
        {!overview ? (
          <Spinner />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-semibold tnum text-ink">{overview.vacant_government_parcels}</div>
              <div className="text-[11px] text-dim">vacant govt parcels · {fmtInt(overview.vacant_government_area_ha)} ha</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tnum text-[var(--good)]">{overview.high_potential_parcels}</div>
              <div className="text-[11px] text-dim">high potential</div>
            </div>
          </div>
        )}
      </Card>

      <Card
        icon={<AlertTriangle className="h-4 w-4 text-[var(--moderate)]" />}
        title="Planning Alerts"
        href="/land"
      >
        {!overview ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Alert value={overview.zoning_conflicts} label="Zoning conflicts" tone="var(--warning)" />
            <Alert value={overview.environmentally_sensitive_parcels} label="Env. sensitive" tone="var(--good)" />
          </div>
        )}
      </Card>

      <div className="text-[11px] text-dim px-1 leading-relaxed">
        Click any parcel on the map to open its full intelligence profile.
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-semibold text-ink">{title}</span>
        </div>
        {href && (
          <Link href={href} className="text-dim hover:text-[var(--accent)]">
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Alert({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tnum" style={{ color: tone }}>
        {value}
      </div>
      <div className="text-[11px] text-dim">{label}</div>
    </div>
  );
}
