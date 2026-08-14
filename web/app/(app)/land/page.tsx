"use client";

import * as React from "react";
import { Search, LandPlot, Building2 } from "lucide-react";
import { MapView } from "@/components/map/MapView";
import { ParcelPanel } from "@/components/panels/ParcelPanel";
import { api } from "@/lib/client";
import { cn, scoreColor, titleCase } from "@/lib/ui";
import { Segmented } from "@/components/ui/kit";
import type { Feature, Polygon } from "geojson";

interface PProps {
  id: string;
  parcel_id: string;
  ownership: "government" | "private";
  land_use: string;
  area_acres: number;
  built_up_percent: number;
  development_potential: number;
  ward: string;
}

export default function LandPage() {
  const [parcels, setParcels] = React.useState<Feature<Polygon, PProps>[]>([]);
  const [ownership, setOwnership] = React.useState<"all" | "government" | "private">("all");
  const [vacantOnly, setVacantOnly] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState<{ lng: number; lat: number; zoom?: number } | null>(null);

  React.useEffect(() => {
    api<{ features: Feature<Polygon, PProps>[] }>("/api/parcels").then((d) => setParcels(d.features));
  }, []);

  const filtered = React.useMemo(() => {
    return parcels
      .filter((p) => (ownership === "all" ? true : p.properties.ownership === ownership))
      .filter((p) => (vacantOnly ? (p.properties.land_use === "vacant" || p.properties.land_use === "agriculture") && p.properties.built_up_percent < 25 : true))
      .filter((p) => (q ? p.properties.parcel_id.toLowerCase().includes(q.toLowerCase()) : true))
      .sort((a, b) => b.properties.development_potential - a.properties.development_potential);
  }, [parcels, ownership, vacantOnly, q]);

  const centroidOf = (p: Feature<Polygon, PProps>): [number, number] => {
    const ring = p.geometry.coordinates[0];
    let x = 0, y = 0;
    for (const c of ring) { x += c[0]; y += c[1]; }
    return [x / ring.length, y / ring.length];
  };

  return (
    <div className="h-full flex">
      {/* list */}
      <div className="w-[330px] shrink-0 h-full flex flex-col border-r border-[var(--line)] bg-[var(--bg-elev)]">
        <div className="p-3 space-y-3 border-b border-[var(--line)]">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search parcel ID…"
              className="w-full bg-[var(--panel-2)] border border-[var(--line)] rounded-lg pl-8 pr-3 py-2 text-[13px] text-ink placeholder:text-dim outline-none focus:border-[var(--accent)]"
            />
          </div>
          <Segmented
            size="sm"
            value={ownership}
            onChange={setOwnership}
            options={[
              { value: "all", label: "All" },
              { value: "government", label: "Government" },
              { value: "private", label: "Private" },
            ]}
          />
          <button
            onClick={() => setVacantOnly((v) => !v)}
            className={cn(
              "w-full flex items-center justify-between rounded-lg px-3 py-2 text-[12px] border transition-colors",
              vacantOnly ? "border-[var(--accent)] bg-[var(--accent)]/10 text-ink" : "border-[var(--line)] text-muted hover:text-ink"
            )}
          >
            <span className="flex items-center gap-1.5">
              <LandPlot className="h-3.5 w-3.5" /> Vacant / developable only
            </span>
            <span className={cn("h-4 w-7 rounded-full relative", vacantOnly ? "bg-[var(--accent)]" : "bg-[var(--panel-2)]")}>
              <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", vacantOnly ? "left-3.5" : "left-0.5")} />
            </span>
          </button>
          <div className="text-[11px] text-dim">
            {filtered.length} parcels · ranked by development potential
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.slice(0, 60).map((p) => (
            <button
              key={p.properties.id}
              onClick={() => {
                setSelected(p.properties.id);
                setFocus({ ...focusFrom(centroidOf(p)) });
              }}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left border transition-colors",
                selected === p.properties.id ? "border-[var(--accent)] bg-[var(--panel)]" : "border-transparent hover:bg-[var(--panel)]"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="mono text-[12px] text-ink truncate">{p.properties.parcel_id}</div>
                <div className="text-[11px] text-dim flex items-center gap-1">
                  {p.properties.ownership === "government" && <Building2 className="h-3 w-3 text-[var(--gov)]" />}
                  {titleCase(p.properties.land_use)} · {p.properties.area_acres} ac
                </div>
              </div>
              <div className="tnum text-sm font-bold" style={{ color: scoreColor(p.properties.development_potential) }}>
                {p.properties.development_potential}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* map */}
      <div className="relative flex-1 min-w-0">
        <MapView
          layers={["boundary", "roads", "parcels", "facilities"]}
          parcelColorMode="development"
          parcelFilter={{ ownership: ownership === "all" ? undefined : ownership, vacantOnly }}
          selectedParcelId={selected}
          onSelectParcel={setSelected}
          focus={focus}
        />
        <div className="absolute top-3 left-3 panel px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-dim mb-1.5">Development potential</div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-24 rounded" style={{ background: "linear-gradient(to right,#ef4444,#eab308,#22c55e)" }} />
            <span className="text-[10px] text-dim">low → high</span>
          </div>
        </div>
      </div>

      {selected && <ParcelPanel parcelId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function focusFrom(c: [number, number]) {
  return { lng: c[0], lat: c[1], zoom: 14 };
}
