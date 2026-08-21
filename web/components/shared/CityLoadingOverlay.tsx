"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ScanEye, AlertTriangle, RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";

export default function CityLoadingOverlay() {
  const cityLoading = useApp((s) => s.cityLoading);
  const datasetVersion = useApp((s) => s.datasetVersion);
  const cityError = useApp((s) => s.cityError);
  const city = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);

  const isVisible = cityLoading || datasetVersion === 0 || Boolean(cityError);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="city-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/20 dark:bg-slate-950/35 backdrop-blur-md pointer-events-auto select-none"
        >
          {cityError ? (
            /* Error Fallback Pill */
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              className="glass-strong flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl border border-destructive/40 backdrop-blur-2xl bg-slate-900/80 max-w-xs"
            >
              <div className="grid h-7 w-7 place-items-center rounded-xl bg-destructive/20 text-destructive ring-1 ring-destructive/40">
                <AlertTriangle size={14} />
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <div className="text-[11px] font-bold text-destructive">Sync Error</div>
                <div className="text-[9.5px] text-muted-foreground truncate">{cityError}</div>
              </div>
              <button
                type="button"
                onClick={() => setCity(city.id)}
                className="flex items-center gap-1 rounded-lg bg-accent/20 px-2 py-1 text-[10px] font-bold text-accent hover:bg-accent/30 transition-colors cursor-pointer"
              >
                <RotateCcw size={11} />
                Retry
              </button>
            </motion.div>
          ) : (
            /* Ultra-Cool Futuristic Spatial Emblem Loader */
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className="relative flex items-center justify-center"
            >
              {/* Outer Radar Expanding Wave */}
              <div className="absolute h-16 w-16 rounded-full bg-accent/20 animate-ping opacity-35" />

              {/* Holographic Glowing Glass Lens Disc */}
              <div className="relative grid h-12 w-12 place-items-center rounded-full glass-strong border border-white/40 dark:border-accent/50 shadow-[0_0_25px_rgba(56,189,248,0.4),inset_0_1px_2px_rgba(255,255,255,0.4)] backdrop-blur-2xl bg-slate-900/50 dark:bg-slate-950/60">
                {/* Orbital Neon Laser Spinner Ring */}
                <div className="absolute inset-[-2px] rounded-full border-[1.5px] border-t-accent border-r-transparent border-b-accent/30 border-l-transparent animate-spin [animation-duration:1s] shadow-[0_0_8px_rgba(56,189,248,0.6)]" />

                {/* Center Pulsing Optical Eye Symbol */}
                <ScanEye
                  size={19}
                  className="text-accent animate-pulse drop-shadow-[0_0_10px_rgba(56,189,248,0.9)]"
                />
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
