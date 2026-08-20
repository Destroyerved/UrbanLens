"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Locate, Layers, Compass } from "lucide-react";
import { getMapInstance } from "@/lib/mapref";
import { ACTIVE_CITY } from "@/config/city";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function MapControls({
  onToggleLayers,
  layersOpen,
}: {
  onToggleLayers: () => void;
  layersOpen: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const activeLayers = useApp((s) => s.activeLayers);
  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  const items = [
    {
      id: "zoom-in",
      label: "Zoom In",
      icon: <Plus size={17} />,
      onClick: () => getMapInstance()?.zoomIn({ duration: 200 }),
      active: false,
    },
    {
      id: "zoom-out",
      label: "Zoom Out",
      icon: <Minus size={17} />,
      onClick: () => getMapInstance()?.zoomOut({ duration: 200 }),
      active: false,
    },
    {
      id: "reset-view",
      label: "Reset View",
      icon: <Locate size={17} />,
      onClick: () => {
        const c = useApp.getState().city;
        getMapInstance()?.flyTo({
          center: c.growthCenter ?? c.center,
          zoom: 12.4,
          bearing: 0,
          pitch: 0,
          duration: 900,
        });
      },
      active: false,
    },
    {
      id: "layers",
      label: `Layers & Heatmaps`,
      icon: <Layers size={17} />,
      onClick: onToggleLayers,
      active: layersOpen,
      badge: activeCount,
    },
  ];

  return (
    <TooltipProvider delayDuration={120}>
      <motion.div
        data-glow
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 300, delay: 0.2 }}
        className="glass-strong rounded-3xl p-1.5 shadow-elev-3 flex flex-col items-center gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {items.map((item, i) => {
          const isHovered = hovered === i;
          const isActive = item.active;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <motion.div
                  animate={{
                    scale: isHovered ? 1.08 : 1,
                    rotate: isHovered && !isActive ? -1.5 : 0,
                  }}
                  transition={{
                    scale: { type: "spring", stiffness: 350, damping: 20 },
                    rotate: { type: "spring", stiffness: 350, damping: 20 },
                  }}
                  className="relative"
                >
                  <button
                    type="button"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                    onClick={item.onClick}
                    className={cn(
                      "relative grid h-10 w-10 place-items-center rounded-2xl cursor-pointer select-none outline-none active:scale-95",
                      isActive
                        ? "text-accent"
                        : "text-foreground/75 hover:text-foreground"
                    )}
                    aria-label={item.label}
                  >
                    {/* Active pill */}
                    {isActive && (
                      <motion.span
                        layoutId="ctrl-pill"
                        className="pointer-events-none absolute inset-0 rounded-2xl bg-accent/20 ring-1 ring-accent/50 shadow-[0_0_10px_rgba(56,189,248,0.25)]"
                        transition={{ type: "spring", stiffness: 450, damping: 30 }}
                      />
                    )}

                    {/* Hover glow (Exact Basemap style) */}
                    <AnimatePresence>
                      {isHovered && !isActive && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.94 }}
                          transition={{ duration: 0.15 }}
                          className="pointer-events-none absolute inset-0 rounded-2xl border border-accent/50 bg-accent/15 shadow-[0_0_14px_rgba(56,189,248,0.3)]"
                        />
                      )}
                    </AnimatePresence>

                    <span className="pointer-events-none relative z-10">{item.icon}</span>

                    {/* Badge for layer count */}
                    {"badge" in item && (item as any).badge > 0 && (
                      <span className="pointer-events-none absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground shadow-sm ring-1 ring-white dark:ring-slate-900 z-20">
                        {(item as any).badge}
                      </span>
                    )}
                  </button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="left" className="shadow-elev-2 pointer-events-none" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </motion.div>
    </TooltipProvider>
  );
}
