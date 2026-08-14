"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  HeartPulse,
  LandPlot,
  Target,
  FlaskConical,
  Sparkles,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, hint: "City command center" },
  { href: "/growth", label: "Urban Growth", icon: TrendingUp, hint: "History + 2030 prediction" },
  { href: "/infrastructure", label: "Infrastructure", icon: HeartPulse, hint: "Gaps & 15-min city" },
  { href: "/land", label: "Land Intelligence", icon: LandPlot, hint: "Parcels & opportunity" },
  { href: "/site-selection", label: "Site Selection", icon: Target, hint: "Rank best parcels" },
  { href: "/simulator", label: "Simulator", icon: FlaskConical, hint: "What-if impact" },
  { href: "/copilot", label: "AI Copilot", icon: Sparkles, hint: "Ask in plain English" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[224px] shrink-0 h-full flex flex-col bg-[var(--bg-elev)] border-r border-[var(--line)]">
      <div className="h-[54px] flex items-center gap-2.5 px-4 border-b border-[var(--line)]">
        <div className="relative">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[#0ea5e9] flex items-center justify-center glow-accent">
            <Layers className="h-4 w-4 text-[var(--accent-ink)]" strokeWidth={2.5} />
          </div>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-ink">UrbanLens</div>
          <div className="text-[10px] text-dim -mt-0.5">Urban Intelligence</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                active
                  ? "bg-[var(--panel-2)] text-ink"
                  : "text-muted hover:text-ink hover:bg-[var(--panel)]"
              )}
            >
              <Icon
                className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[var(--accent)]" : "text-dim group-hover:text-muted")}
                strokeWidth={2}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-medium leading-tight">{item.label}</div>
                <div className="text-[10px] text-dim leading-tight truncate">{item.hint}</div>
              </div>
              {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[var(--line)] text-[10px] text-dim leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)] pulse" />
          <span className="text-muted">Spatial engine online</span>
        </div>
        Wards: municipal ward map · Facilities & roads: OpenStreetMap · Parcels: demo
        <div className="mt-0.5">See “Data provenance” for the full breakdown.</div>
      </div>
    </aside>
  );
}
