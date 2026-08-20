"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Search, ScanEye, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CITIES, HOT_PICKS } from "@/config/city";
import { useApp } from "@/lib/store";
import { prefetchBootstrap } from "@/lib/dataset";
import { ExpandingSearchDock } from "@/components/search/ExpandingSearchDock";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";
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
  const [filterText, setFilterText] = useState("");

  const filteredCities = useMemo(() => {
    if (!filterText.trim()) return CITIES;
    const q = filterText.toLowerCase();
    return CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.blurb.toLowerCase().includes(q)
    );
  }, [filterText]);

  return (
    <div
      data-glow
      className="glass-strong pointer-events-auto flex h-12 items-center gap-2.5 rounded-full pl-3.5 pr-2.5 shadow-elev-3 backdrop-blur-2xl border border-white/25 dark:border-white/15"
    >
      {/* Brand — links back to Landing Page */}
      <a
        href="/"
        title="Return to Landing Page"
        className="flex items-center gap-2.5 pr-2 transition-all duration-200 ease-out hover:opacity-85 cursor-pointer"
      >
        <div className="grid h-7 w-7 place-items-center rounded-full bg-accent/20 ring-1 ring-accent/50 shadow-[0_0_12px_rgba(56,189,248,0.3)]">
          <ScanEye size={15} className="text-accent" />
        </div>
        <div className="leading-none">
          <div className="text-[13.5px] font-bold tracking-tight text-foreground">UrbanLens</div>
          <div className="mt-0.5 text-[9px] font-bold tracking-wider text-muted-foreground">
            GUJARAT STATE SPATIAL INTELLIGENCE
          </div>
        </div>
      </a>

      <div className="mx-1 h-5 w-px bg-white/25 dark:bg-white/15" />

      {/* Animated Expanding Search Dock */}
      <div className="relative z-[70]">
        <ExpandingSearchDock onSearch={() => setPaletteOpen(true)} />
      </div>

      <div className="flex-1" />

      {/* Right Tools (Gujarat Districts Switcher, Copilot, Theme) */}
      <div className="flex items-center gap-2">
        {/* Gujarat 34-District Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setCityOpen((v) => !v)}
            className="glass-card flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-foreground transition-all hover:scale-[1.02] cursor-pointer"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                cityLoading
                  ? "animate-pulse bg-warning"
                  : "bg-good shadow-[0_0_8px_rgba(34,197,94,0.6)]"
              )}
            />
            <span className="font-bold">{city.name}</span>
            <span className="text-muted-foreground font-normal text-[11px]">· Gujarat</span>
            <ChevronDown
              size={12}
              className={cn("text-muted-foreground transition-transform", cityOpen && "rotate-180")}
            />
          </button>

          <AnimatePresence>
            {cityOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                className="glass-strong absolute right-0 top-10 z-[80] w-80 rounded-3xl p-3 shadow-2xl backdrop-blur-2xl border border-white/30 dark:border-white/15"
              >
                {/* Search Filter Input */}
                <div className="relative mb-2.5">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Search 34 Gujarat districts…"
                    autoFocus
                    className="w-full h-8 pl-8 pr-3 text-[12px] rounded-xl bg-white/20 dark:bg-white/10 border border-white/20 dark:border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1.5 focus:ring-accent"
                  />
                </div>

                {/* Quick Hot Picks */}
                {!filterText && (
                  <div className="mb-2.5 pb-2 border-b border-border/50">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      Major Urban Centers
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {HOT_PICKS.map((pickId) => {
                        const c = CITIES.find((item) => item.id === pickId);
                        if (!c) return null;
                        const isActive = c.id === city.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCityOpen(false);
                              setFilterText("");
                              void setCity(c.id);
                            }}
                            className={cn(
                              "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                              isActive
                                ? "bg-accent text-accent-foreground shadow-sm"
                                : "bg-white/15 dark:bg-white/10 hover:bg-white/25 dark:hover:bg-white/20 text-foreground"
                            )}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Scrollable Full List (All 34 Districts) */}
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-1 flex justify-between">
                  <span>All Districts ({filteredCities.length})</span>
                  <span>Gujarat State</span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                  {filteredCities.map((c) => {
                    const isActive = c.id === city.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCityOpen(false);
                          setFilterText("");
                          void setCity(c.id);
                        }}
                        onMouseEnter={() => prefetchBootstrap(c.id)}
                        disabled={cityLoading}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-all cursor-pointer",
                          isActive
                            ? "bg-accent/20 text-accent font-bold ring-1 ring-accent/40"
                            : "hover:bg-white/20 dark:hover:bg-white/10 text-foreground"
                        )}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-[12px] truncate">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate leading-tight">
                            {c.blurb}
                          </div>
                        </div>
                        {isActive && <Check size={14} className="text-accent shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredCities.length === 0 && (
                    <div className="py-4 text-center text-[11.5px] text-muted-foreground">
                      No district matching &quot;{filterText}&quot;
                    </div>
                  )}
                </div>

                {cityError && (
                  <div className="mt-2 px-2.5 py-1 text-[10.5px] text-critical">{cityError}</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mx-0.5 h-5 w-px bg-white/25 dark:bg-white/15" />

        {/* Liquid Metal Copilot Button */}
        <LiquidMetalButton
          label="Copilot"
          active={copilotOpen}
          onClick={() => setCopilotOpen(!copilotOpen)}
        />

        <ThemeToggle />
      </div>
    </div>
  );
}