"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ScanEye } from "lucide-react";
import { useApp } from "@/lib/store";

export default function CityLoadingOverlay() {
  const cityLoading = useApp((s) => s.cityLoading);
  const datasetVersion = useApp((s) => s.datasetVersion);

  const isVisible = cityLoading || datasetVersion === 0;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="city-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 dark:bg-black/80 pointer-events-auto"
        >
          {/* Ambient Background Spotlight */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2),transparent_60%)] pointer-events-none" />

          {/* Minimalist Liquid Glass Brand Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong relative flex flex-col items-center justify-center px-10 py-7 rounded-3xl shadow-2xl border border-white/30 dark:border-white/15 text-center backdrop-blur-md bg-white/15 dark:bg-black/50"
          >
            {/* Animated Glowing Brand Icon */}
            <div className="relative mb-3 flex items-center justify-center">
              <div className="absolute h-16 w-16 rounded-full bg-accent/20 animate-ping opacity-60" />
              <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-accent/25 text-accent ring-1.5 ring-accent/60 shadow-[0_0_20px_rgba(56,189,248,0.45)]">
                <ScanEye size={22} className="animate-pulse" />
              </div>
            </div>

            {/* Brand Title */}
            <h2 className="text-[20px] font-extrabold tracking-tight text-foreground">
              UrbanLens
            </h2>

            {/* Sleek Minimal Progress Line */}
            <div className="mt-4 h-1 w-28 bg-white/15 dark:bg-white/10 rounded-full overflow-hidden relative">
              <motion.div
                className="h-full bg-accent rounded-full shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                animate={{
                  x: ["-100%", "100%"],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  ease: "easeInOut",
                }}
                style={{ width: "50%" }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
