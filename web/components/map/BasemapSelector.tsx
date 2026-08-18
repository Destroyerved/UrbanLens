"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe2, Layers, Map as MapIcon, Mountain, Moon, Sun, X, ChevronUp, type LucideIcon } from "lucide-react";
import { BASEMAPS, type BasemapType } from "@/config/layers";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const ICONS: Record<BasemapType, LucideIcon> = {
  satellite: Globe2,
  hybrid: Layers,
  streets: MapIcon,
  terrain: Mountain,
  dark: Moon,
  light: Sun,
};

const ICON_COLORS: Record<BasemapType, string> = {
  satellite: "text-emerald-400",
  hybrid: "text-cyan-400",
  streets: "text-amber-400",
  terrain: "text-lime-400",
  dark: "text-indigo-400",
  light: "text-orange-400",
};

export default function BasemapSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);

  const currentDef = BASEMAPS.find((b) => b.id === basemap);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative z-[45]">
      <motion.div
        layout
        initial={false}
        animate={{
          width: isOpen ? 340 : 180,
          height: isOpen ? 280 : 42,
          borderRadius: isOpen ? 24 : 21,
          x: isOpen ? 80 : 0,
        }}
        transition={{ type: "spring", damping: 28, stiffness: 420, mass: 0.6 }}
        data-glow
        style={{
          "--base": 220,
          "--spread": 200,
          "--radius": isOpen ? 24 : 21,
          "--border-size": "2px",
          "--spotlight-size": "340px",
          "--hue": "calc(var(--base) + (var(--xp, 0.5) * var(--spread, 0)))",
        } as React.CSSProperties}
        className={cn(
          "glass-strong transform-gpu will-change-transform relative shadow-elev-3 origin-bottom-left transition-all duration-300",
          isOpen
            ? "bg-white/20 dark:bg-black/40 backdrop-blur-2xl"
            : "cursor-pointer hover:scale-[1.02] active:scale-95"
        )}
        onClick={() => !isOpen && setIsOpen(true)}
      >
        <AnimatePresence mode="wait">
          {!isOpen ? (
            /* ─── Collapsed: Compact Pill ─── */
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="absolute inset-0 flex items-center gap-2.5 px-3.5 overflow-hidden rounded-[inherit]"
            >
              <span className="text-base shrink-0 leading-none">{currentDef?.icon ?? "🛰️"}</span>
              <span className="text-[12px] font-bold text-foreground truncate leading-none flex-1">
                {currentDef?.label ?? "Satellite"}
              </span>
              <ChevronUp size={13} className="text-muted-foreground shrink-0" />
            </motion.div>
          ) : (
            /* ─── Expanded: Full Gallery with ModeRail-style Animations ─── */
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex h-full flex-col p-3.5 overflow-hidden rounded-[inherit]"
            >
              {/* Header */}
              <div className="mb-2.5 flex items-center justify-between">
                <div className="text-[13px] font-bold tracking-tight text-foreground">
                  Basemap Gallery
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                  className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-white/20 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>

              {/* 2×3 Grid — ModeRail-style Dock Animation */}
              <div
                  className="grid grid-cols-2 gap-2 flex-1"
                  onMouseLeave={() => setHovered(null)}
                >
                  {BASEMAPS.map((bm, i) => {
                    const active = basemap === bm.id;
                    const isHovered = hovered === i;
                    const Icon = ICONS[bm.id];
                    const hues: Record<BasemapType, number> = {
                      satellite: 145,
                      hybrid: 195,
                      streets: 40,
                      terrain: 90,
                      dark: 260,
                      light: 25,
                    };

                    return (
                      <motion.div
                        key={bm.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: isHovered ? 1.05 : 1,
                          rotate: isHovered && !active ? -1 : 0,
                        }}
                        transition={{
                          opacity: { delay: i * 0.015, duration: 0.12 },
                          y: { delay: i * 0.015, duration: 0.12 },
                          scale: { type: "spring", stiffness: 350, damping: 20 },
                          rotate: { type: "spring", stiffness: 350, damping: 20 },
                        }}
                        onMouseEnter={() => setHovered(i)}
                        className="relative"
                      >
                        <button
                          type="button"
                          data-glow
                          style={{ "--hue": hues[bm.id], "--radius": 16 } as React.CSSProperties}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBasemap(bm.id);
                            setIsOpen(false);
                          }}
                          className={cn(
                            "glass-glow-card relative flex w-full flex-col items-start rounded-2xl p-2.5 text-left transition-all active:scale-[0.97] cursor-pointer",
                            active
                              ? "text-accent-foreground font-bold"
                              : "text-foreground/80 hover:text-foreground bg-white/10 dark:bg-white/[0.04]"
                          )}
                        >
                          {/* 1. Active Mode Pill Indicator */}
                          {active && (
                            <motion.span
                              layoutId="basemap-active-pill"
                              className="pointer-events-none absolute inset-0 rounded-2xl bg-accent/25 border border-accent/80 shadow-[0_0_18px_rgba(56,189,248,0.4)] ring-1 ring-accent/60"
                              transition={{ type: "spring", stiffness: 450, damping: 32 }}
                            />
                          )}

                          {/* 2. Hover Glowing Ring Effect (Exact ModeRail style) */}
                          <AnimatePresence>
                            {isHovered && !active && (
                              <motion.span
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.94 }}
                                transition={{ duration: 0.15 }}
                                className="pointer-events-none absolute inset-0 rounded-2xl border border-accent/50 bg-accent/15 shadow-[0_0_14px_rgba(56,189,248,0.3)]"
                              />
                            )}
                          </AnimatePresence>

                          {/* Content */}
                          <div className="relative z-10 flex w-full items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Icon size={15} className={cn("shrink-0 transition-colors", ICON_COLORS[bm.id])} />
                              <span className="text-[11.5px] font-bold truncate">
                                {bm.label}
                              </span>
                            </div>
                            {active && <Check size={12} className="text-accent shrink-0 font-bold ml-1" />}
                          </div>
                          <div className="relative z-10 mt-1 text-[9px] font-medium leading-tight text-muted-foreground line-clamp-2">
                            {bm.description}
                          </div>

                          {/* Active Dot on right edge */}
                          {active && (
                            <span className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent ring-2 ring-white dark:ring-slate-900 shadow-[0_0_10px_rgba(56,189,248,1)] z-20" />
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
