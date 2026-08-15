"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Locate, Layers, Compass } from "lucide-react";
import { getMapInstance } from "@/lib/mapref";

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
  const city = useApp((s) => s.city);
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
      onClick: () =>
        getMapInstance()?.flyTo({
          center: city.center,
          zoom: city.zoom,
          bearing: 0,
          pitch: 0,
          duration: 900,
        }),
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
                <motion.button
                  onMouseEnter={() => setHovered(i)}
                  animate={{
                    scale: isHovered ? 1.12 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  onClick={item.onClick}
                  className={cn(
                    "relative grid h-10 w-10 place-items-center rounded-2xl active:scale-95",
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
                      className="absolute inset-0 rounded-2xl bg-accent/20 ring-1 ring-accent/50 shadow-[0_0_10px_rgba(56,189,248,0.25)]"
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    />
                  )}

                  {/* Hover glow */}
                  <AnimatePresence>
                    {isHovered && !isActive && (
                      <motion.span
                        layoutId="ctrl-hover"
                        className="absolute inset-0 rounded-2xl border border-accent/40 bg-accent/10 shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      />
                    )}
                  </AnimatePresence>

                  <span className="relative z-10">{item.icon}</span>

                  {/* Badge for layer count */}
                  {"badge" in item && (item as any).badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground shadow-sm ring-1 ring-white dark:ring-slate-900 z-20">
                      {(item as any).badge}
                    </span>
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="left" className="shadow-elev-2" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </motion.div>
    </TooltipProvider>
  );
}
