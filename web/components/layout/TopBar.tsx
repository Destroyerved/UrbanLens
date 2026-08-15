"use client";

import { useState } from "react";
import { ChevronDown, Search, Sparkles, ScanEye, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CITIES } from "@/config/city";
import { useApp } from "@/lib/store";
import ThemeToggle from "./ThemeToggle";
import { cn } from "@/lib/utils";

export default function TopBar() {
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);
  const city = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const cityLoading = useApp((s) => s.cityLoading);
  const cityError = useApp((s) => s.cityError);
  const copilotOpen = useApp((s) => s.copilotOpen);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);
  const [cityOpen, setCityOpen] = useState(false);

  return (
    <div className="glass pointer-events-auto flex h-12 items-center gap-2.5 rounded-full pl-3.5 pr-2.5 shadow-elev-2">
      {/* Brand */}
      <div className="flex items-center gap-2.5 pr-2">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-accent/20 ring-1 ring-accent/50 shadow-[0_0_12px_rgba(56,189,248,0.3)]">
          <ScanEye size={15} className="text-accent" />
        </div>
        <div className="leading-none">
          <div className="text-[13.5px] font-bold tracking-tight text-foreground">UrbanLens</div>
          <div className="mt-0.5 text-[9px] font-bold tracking-wider text-muted-foreground">
            URBAN PLANNING &amp; LAND INTELLIGENCE
          </div>
        </div>
      </div>

      <div className="mx-1 h-5 w-px bg-white/25 dark:bg-white/15" />

      {/* Global search */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="glass-card group flex h-8 w-[250px] items-center gap-2 rounded-full px-3 text-left transition-all hover:scale-[1.01]"
      >
        <Search size={13.5} className="text-muted-foreground transition-colors group-hover:text-accent" />
        <span className="flex-1 text-[12px] font-medium text-muted-foreground group-hover:text-foreground">
          Search parcels, wards, actions…
        </span>
        <kbd className="num rounded-full border border-border/70 bg-white/20 dark:bg-white/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* City selector */}
      <div className="relative">
        <button
          onClick={() => setCityOpen((v) => !v)}
          className="glass-card flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-foreground transition-all hover:scale-[1.02]"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              cityLoading
                ? "animate-pulse bg-warning"
                : "bg-good shadow-[0_0_8px_rgba(34,197,94,0.6)]",
            )}
          />
          <span>{city.name}</span>
          <span className="text-muted-foreground font-normal">· {city.state}</span>
          <ChevronDown
            size={12}
            className={cn("text-muted-foreground transition-transform", cityOpen && "rotate-180")}
          />
        </button>
        <AnimatePresence>
          {cityOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.16 }}
              className="glass-strong absolute right-0 top-10 z-[50] w-52 rounded-2xl p-2 shadow-elev-3"
              onMouseLeave={() => setCityOpen(false)}
            >
              {CITIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCityOpen(false);
                    void setCity(c.id);
                  }}
                  disabled={cityLoading}
                  className="flex w-full items-start justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold transition-colors hover:bg-white/20 disabled:opacity-50 dark:hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{c.name}</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {c.blurb}
                    </span>
                  </span>
                  {c.id === city.id && (
                    <Check size={13} className="mt-0.5 shrink-0 text-accent" />
                  )}
                </button>
              ))}
              {cityError && (
                <div className="px-2.5 py-1.5 text-[10px] text-critical">{cityError}</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-0.5 h-5 w-px bg-white/25 dark:bg-white/15" />

      {/* Copilot */}
      <button
        onClick={() => setCopilotOpen(!copilotOpen)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition-all active:scale-[0.97]",
          copilotOpen
            ? "bg-accent text-accent-foreground shadow-md ring-1 ring-accent/50 shadow-accent/30"
            : "glass text-accent ring-1 ring-accent/40 hover:bg-accent/20 hover:scale-[1.02]"
        )}
      >
        <Sparkles size={13} />
        Copilot
      </button>

      <ThemeToggle />
    </div>
  );
}
