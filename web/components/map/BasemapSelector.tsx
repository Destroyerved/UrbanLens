"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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

export function BasemapSelectorButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const basemap = useApp((s) => s.basemap);
  const currentDef = BASEMAPS.find((b) => b.id === basemap);

  return (
    <button
      type="button"
      onClick={onToggle}
      data-glow
      style={{
        "--base": 220,
        "--spread": 100,
        "--radius": 21,
        "--border-size": "1.5px",
        "--spotlight-size": "200px",
      } as React.CSSProperties}
      className={cn(
        "glass-strong flex h-[42px] w-[180px] shrink-0 items-center gap-2.5 px-3.5 rounded-[21px] shadow-elev-3 transition-colors duration-150 cursor-pointer select-none outline-none border border-white/25 dark:border-white/15",
        isOpen
          ? "ring-2 ring-accent shadow-[0_0_12px_rgba(56,189,248,0.4)]"
          : "hover:border-white/40"
      )}
    >
      <span className="text-base shrink-0 leading-none">{currentDef?.icon ?? "🛰️"}</span>
      <span className="text-[12px] font-bold text-foreground truncate leading-none flex-1 text-left">
        {currentDef?.label ?? "Satellite"}
      </span>
      <ChevronUp
        size={13}
        className={cn(
          "text-muted-foreground transition-transform duration-200 shrink-0",
          isOpen && "rotate-180 text-accent"
        )}
      />
    </button>
  );
}

export function BasemapGalleryPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.96 }}
      transition={{ type: "spring", damping: 28, stiffness: 420, mass: 0.6 }}
      data-glow
      style={{
        "--base": 220,
        "--spread": 200,
        "--radius": 24,
        "--border-size": "1.5px",
        "--spotlight-size": "340px",
      } as React.CSSProperties}
      className="glass-strong pointer-events-auto w-[340px] rounded-3xl p-3.5 shadow-elev-3 backdrop-blur-2xl border border-white/25 dark:border-white/15 select-none"
    >
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between border-b border-white/15 dark:border-white/10 pb-2">
        <div className="text-[13px] font-extrabold tracking-tight text-foreground">
          Basemap Gallery
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-white/20 dark:hover:bg-white/10 hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* 2×3 Grid of Basemaps */}
      <div
        className="grid grid-cols-2 gap-2"
        onMouseLeave={() => setHovered(null)}
      >
        {BASEMAPS.map((b, i) => {
          const active = basemap === b.id;
          const isHovered = hovered === i;
          const Icon = ICONS[b.id] ?? Globe2;

          return (
            <motion.button
              key={b.id}
              type="button"
              onClick={() => {
                setBasemap(b.id);
                onClose();
              }}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              animate={{
                scale: isHovered ? 1.03 : 1,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-2xl p-2.5 text-left transition-all cursor-pointer outline-none border",
                active
                  ? "bg-accent/20 border-accent/70 text-foreground shadow-[0_0_12px_rgba(56,189,248,0.25)] ring-1 ring-accent/50"
                  : "bg-white/10 dark:bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/15 text-foreground"
              )}
            >
              <span className="text-xl shrink-0 leading-none">{b.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-bold truncate leading-tight text-foreground">
                  {b.label}
                </div>
                <div className="text-[9px] text-muted-foreground truncate leading-tight">
                  {b.description}
                </div>
              </div>
              {active && <Check size={13} className="text-accent shrink-0" />}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function BasemapSelector() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <BasemapSelectorButton isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)} />
    </>
  );
}
