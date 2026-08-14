"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { DataSources } from "@/components/shell/DataSources";
import { useCity } from "@/components/shell/CityProvider";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/overview": { title: "City Overview", sub: "Command center — the current state of the city" },
  "/growth": { title: "Urban Growth", sub: "Historical expansion & 2030 growth prediction" },
  "/infrastructure": { title: "Infrastructure Gap Analysis", sub: "Coverage, deficits & 15-minute city" },
  "/land": { title: "Land Intelligence", sub: "Parcel profiles, government & opportunity land" },
  "/site-selection": { title: "Smart Site Selection", sub: "Multi-criteria ranking of candidate parcels" },
  "/simulator": { title: "What-If Simulator", sub: "Model the impact of a proposed intervention" },
  "/copilot": { title: "AI Planning Copilot", sub: "Natural-language control of the GIS engine" },
};

function CitySwitcher() {
  const { city, cities, setCity } = useCity();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)] px-3 py-1.5 text-xs text-ink hover:bg-[var(--panel-hover)] transition-colors"
      >
        <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span className="font-medium">{city.name}</span>
        <span className="text-dim">{city.state}</span>
        <ChevronDown className="h-3.5 w-3.5 text-dim" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl">
          <p className="px-3 py-2 text-[10px] uppercase tracking-wide text-dim border-b border-[var(--line)]">
            Demonstration city
          </p>
          {cities.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCity(c.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-[var(--panel-hover)] transition-colors"
            >
              <span>
                <span className="font-medium">{c.name}</span>
                <span className="text-dim ml-1.5">{c.state}</span>
              </span>
              {c.id === city.id && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <DataSources />
        <CitySwitcher />
      </div>
    </header>
  );
}
