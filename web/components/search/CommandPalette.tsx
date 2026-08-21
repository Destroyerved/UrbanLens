"use client";

import { useEffect } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  TrendingUp,
  Hospital,
  Landmark,
  Target,
  FlaskConical,
  Grid2x2,
  MapPin,
  Sparkles,
  Moon,
  Leaf,
  Route,
  Scale,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useApp } from "@/lib/store";
import { PARCELS } from "@/data/parcels";
import { WARDS } from "@/data/wards";
import { FACILITIES } from "@/data/facilities";
import { MODE_META } from "@/config/layers";
import type { Mode } from "@/types";

const MODE_ICONS: Record<Mode, React.ReactNode> = {
  overview: <LayoutDashboard size={14} />,
  growth: <TrendingUp size={14} />,
  infrastructure: <Hospital size={14} />,
  land: <Landmark size={14} />,
  sites: <Target size={14} />,
  simulator: <FlaskConical size={14} />,
  equity: <Scale size={14} />,
  conservation: <Leaf size={14} />,
  corridor: <Route size={14} />,
};

export default function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPaletteOpen);
  const applyAction = useApp((s) => s.applyAction);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useApp.getState().paletteOpen);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/45 dark:bg-black/60 pt-[14vh] backdrop-blur-md"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.2, ease: [0.175, 0.885, 0.32, 1.2] }}
            className="glass-strong w-[560px] overflow-hidden rounded-2xl shadow-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Global search" loop>
              <Command.Input
                autoFocus
                placeholder="Search parcels, wards, facilities, actions…"
                className="h-12 w-full border-b border-border/80 bg-transparent px-4 text-[13.5px] font-medium outline-none placeholder:text-muted-foreground"
              />
              <Command.List className="panel-scroll max-h-[46vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-[12.5px] font-medium text-muted-foreground">
                  No results. Try a parcel ID like “GJ-AHD-1028”.
                </Command.Empty>

                <Command.Group
                  heading="Modes"
                  className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-bold"
                >
                  {(Object.keys(MODE_META) as Mode[]).map((m) => (
                    <Command.Item
                      key={m}
                      value={`mode ${MODE_META[m].label}`}
                      onSelect={() => run(() => applyAction({ type: "setMode", mode: m }))}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                    >
                      {MODE_ICONS[m]}
                      {MODE_META[m].label}
                      <span className="ml-auto text-[10.5px] text-muted-foreground">
                        {MODE_META[m].caption}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Actions"
                  className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-bold"
                >
                  <Command.Item
                    value="enable 2030 growth prediction"
                    onSelect={() => run(() => applyAction({ type: "enablePrediction" }))}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                  >
                    <TrendingUp size={14} /> Enable 2030 growth prediction
                  </Command.Item>
                  <Command.Item
                    value="run hospital site analysis"
                    onSelect={() => run(() => applyAction({ type: "runSiteAnalysis" }))}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                  >
                    <Target size={14} /> Run hospital site analysis
                  </Command.Item>
                  <Command.Item
                    value="ask copilot"
                    onSelect={() => run(() => setCopilotOpen(true))}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                  >
                    <Sparkles size={14} /> Ask the AI Copilot
                  </Command.Item>
                  <Command.Item
                    value="toggle theme dark light"
                    onSelect={() =>
                      run(() => setTheme(resolvedTheme === "light" ? "dark" : "light"))
                    }
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                  >
                    <Moon size={14} /> Toggle dark / light theme
                  </Command.Item>
                </Command.Group>

                <Command.Group
                  heading="Wards"
                  className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-bold"
                >
                  {WARDS.map((w) => (
                    <Command.Item
                      key={w.id}
                      value={`ward ${w.name}`}
                      onSelect={() =>
                        run(() => {
                          applyAction({ type: "highlightWards", wardIds: [w.id] });
                          applyAction({ type: "flyTo", center: w.centroid, zoom: 12.3 });
                        })
                      }
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                    >
                      <MapPin size={14} />
                      {w.name}
                      <span className="num ml-auto text-[10.5px] text-muted-foreground">
                        {(w.population[2026] / 1000).toFixed(0)}K residents
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Parcels"
                  className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-bold"
                >
                  {PARCELS.slice(0, 400).map((p) => (
                    <Command.Item
                      key={p.id}
                      value={`parcel ${p.id}`}
                      onSelect={() =>
                        run(() => applyAction({ type: "selectParcel", parcelId: p.id }))
                      }
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                    >
                      <Grid2x2 size={14} />
                      <span className="num font-semibold">{p.id}</span>
                      <span className="ml-auto text-[10.5px] capitalize text-muted-foreground">
                        {p.landUse} · {p.areaHa} ha
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Facilities"
                  className="[&_[cmdk-group-heading]]:label-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-bold"
                >
                  {FACILITIES.map((f) => (
                    <Command.Item
                      key={f.id}
                      value={`facility ${f.name}`}
                      onSelect={() =>
                        run(() => applyAction({ type: "flyTo", center: f.coord, zoom: 13.8 }))
                      }
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors aria-selected:bg-accent/15 aria-selected:text-accent"
                    >
                      <Hospital size={14} />
                      {f.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
