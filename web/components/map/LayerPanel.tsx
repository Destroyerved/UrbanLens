"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Landmark,
  Map as MapIcon,
  Route,
  Hospital,
  Users,
  Building,
  TrendingUp,
  AlertTriangle,
  Target,
  Grid2x2,
  ShieldAlert,
  Flame,
  Leaf,
  Activity,
} from "lucide-react";
import { LAYERS, type LayerCategory, type LayerId } from "@/config/layers";
import { useApp } from "@/lib/store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const ICONS: Record<LayerId, React.ReactNode> = {
  parcels: <Grid2x2 size={14} />,
  "govt-land": <Landmark size={14} />,
  "zoning-conflicts": <ShieldAlert size={14} />,
  wards: <MapIcon size={14} />,
  roads: <Route size={14} />,
  facilities: <Hospital size={14} />,
  greenspace: <Leaf size={14} />,
  population: <Users size={14} />,
  "growth-heat": <Flame size={14} />,
  "gap-heat": <Activity size={14} />,
  "ndvi-heat": <Leaf size={14} />,
  "thermal-heat": <Flame size={14} />,
  builtup: <Building size={14} />,
  prediction: <TrendingUp size={14} />,
  gap: <AlertTriangle size={14} />,
  candidates: <Target size={14} />,
};

const CATEGORIES: LayerCategory[] = ["Heatmaps", "Land", "Infrastructure", "Intelligence"];

export default function LayerPanel({ open }: { open: boolean }) {
  const activeLayers = useApp((s) => s.activeLayers);
  const toggleLayer = useApp((s) => s.toggleLayer);
  const layerOpacity = useApp((s) => s.layerOpacity);
  const setLayerOpacity = useApp((s) => s.setLayerOpacity);

  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 12, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 12, scale: 0.96 }}
          transition={{ type: "spring", damping: 26, stiffness: 380, mass: 0.5 }}
          data-glow
          style={{
            "--base": 195,
            "--spread": 50,
            "--radius": 24,
            "--border-size": "1.5px",
            "--spotlight-size": "300px",
          } as React.CSSProperties}
          className="glass-strong relative w-[280px] rounded-3xl p-3.5 shadow-elev-3 backdrop-blur-2xl transition-all duration-300"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="label-caps font-bold">Map Layers &amp; Heatmaps</span>
            <span className="num rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
              {activeCount} active
            </span>
          </div>

          {/* Scrollable content */}
          <div className="panel-scroll max-h-[54vh] space-y-4 overflow-y-auto pr-1">
            {CATEGORIES.map((cat) => {
              const catLayers = LAYERS.filter((l) => l.category === cat);
              if (catLayers.length === 0) return null;

              return (
                <div key={cat}>
                  {/* Category heading */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {cat}
                    </span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>

                  {/* Layer rows — NO glass-card to avoid stacked backdrop-filter */}
                  <div className="space-y-1">
                    {catLayers.map((l) => {
                      const on = !!activeLayers[l.id];
                      return (
                        <div key={l.id}>
                          <button
                            type="button"
                            onClick={() => toggleLayer(l.id, !on)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left",
                              "hover:bg-white/10 dark:hover:bg-white/6 active:scale-[0.98]",
                              "transition-transform duration-100",
                              on && "bg-accent/10"
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  "shrink-0 transition-colors duration-150",
                                  on ? "text-accent" : "text-muted-foreground"
                                )}
                              >
                                {ICONS[l.id]}
                              </span>
                              <span
                                className={cn(
                                  "truncate text-[12px] font-semibold transition-colors duration-150",
                                  on ? "text-foreground" : "text-foreground/70"
                                )}
                              >
                                {l.label}
                              </span>
                            </div>
                            <Switch
                              checked={on}
                              onCheckedChange={(v) => toggleLayer(l.id, v)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </button>

                          {/* Opacity slider (animated) */}
                          <AnimatePresence>
                            {l.hasOpacity && on && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                                className="overflow-hidden"
                              >
                                <div className="flex items-center gap-2 px-2.5 pb-1.5 pl-9">
                                  <Slider
                                    value={[Math.round((layerOpacity[l.id] ?? 0.6) * 100)]}
                                    min={10}
                                    max={95}
                                    step={5}
                                    onValueChange={([v]) => setLayerOpacity(l.id, v / 100)}
                                  />
                                  <span className="num w-7 text-right text-[10px] font-bold text-muted-foreground">
                                    {Math.round((layerOpacity[l.id] ?? 0.6) * 100)}%
                                  </span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
