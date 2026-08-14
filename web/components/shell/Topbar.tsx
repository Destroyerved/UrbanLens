"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, MapPin } from "lucide-react";
import { DemoBadge } from "@/components/ui/kit";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/overview": { title: "City Overview", sub: "Command center — the current state of the city" },
  "/growth": { title: "Urban Growth", sub: "Historical expansion & 2030 growth prediction" },
  "/infrastructure": { title: "Infrastructure Gap Analysis", sub: "Coverage, deficits & 15-minute city" },
  "/land": { title: "Land Intelligence", sub: "Parcel profiles, government & opportunity land" },
  "/site-selection": { title: "Smart Site Selection", sub: "Multi-criteria ranking of candidate parcels" },
  "/simulator": { title: "What-If Simulator", sub: "Model the impact of a proposed intervention" },
  "/copilot": { title: "AI Planning Copilot", sub: "Natural-language control of the GIS engine" },
};

export function Topbar() {
  const pathname = usePathname();
  const key = Object.keys(TITLES).find((k) => pathname.startsWith(k)) ?? "/overview";
  const { title, sub } = TITLES[key];
  return (
    <header className="h-[54px] shrink-0 flex items-center justify-between px-5 border-b border-[var(--line)] bg-[var(--bg-elev)]">
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold text-ink leading-tight truncate">{title}</h1>
        <p className="text-[11px] text-dim leading-tight truncate">{sub}</p>
      </div>
      <div className="flex items-center gap-3">
        <DemoBadge />
        <button className="flex items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)] px-3 py-1.5 text-xs text-ink hover:bg-[var(--panel-hover)] transition-colors">
          <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="font-medium">Ahmedabad</span>
          <span className="text-dim">Gujarat</span>
          <ChevronDown className="h-3.5 w-3.5 text-dim" />
        </button>
      </div>
    </header>
  );
}
