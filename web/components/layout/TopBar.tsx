"use client";

import { useState } from "react";
import { ChevronDown, Search, Sparkles, ScanEye, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CITIES, ACTIVE_CITY } from "@/config/city";
import { useApp } from "@/lib/store";
import { ExpandingSearchDock } from "@/components/search/ExpandingSearchDock";
import { LiquidMetalButton } from "@/components/ui/LiquidMetalButton";
import ThemeToggle from "./ThemeToggle";
import { cn } from "@/lib/utils";

export default function TopBar() {
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);
  const copilotOpen = useApp((s) => s.copilotOpen);
  const setCopilotOpen = useApp((s) => s.setCopilotOpen);
  const searchFocused = useApp((s) => s.searchFocused);
  const city = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const cityLoading = useApp((s) => s.cityLoading);
  const [cityOpen, setCityOpen] = useState(false);

  return (
    <div data-glow className="glass pointer-events-auto flex h-12 items-center gap-2.5 rounded-full pl-3.5 pr-2.5 shadow-elev-2 backdrop-blur-xl">
      {/* Brand — blurs when search is focused */}
      <div
        className={cn(
          "flex items-center gap-2.5 pr-2 transition-all duration-300 ease-out",
          searchFocused && "blur-[6px] opacity-30 pointer-events-none scale-[0.97]"
        )}
      >
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

      <div
        className={cn(
          "mx-1 h-5 w-px bg-white/25 dark:bg-white/15 transition-all duration-300",
          searchFocused && "opacity-20 blur-[2px]"
        )}
      />

      {/* Expanding Search Dock — Remains 100% focused & crystal clear */}
      <div className="relative z-[70]">
        <ExpandingSearchDock
          onSearch={() => setPaletteOpen(true)}
        />
      </div>

      <div className="flex-1" />

      {/* Right Tools (City, Copilot, Theme) — Blurs when search is focused */}
      <div
        className={cn(
          "flex items-center gap-2 transition-all duration-300 ease-out",
          searchFocused && "blur-[6px] opacity-30 pointer-events-none scale-[0.97]"
        )}
      >
        {/* City selector */}
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
                  ? "bg-warning animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                  : "bg-good shadow-[0_0_8px_rgba(34,197,94,0.6)]"
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
                className="glass-strong absolute right-0 top-10 z-[50] w-60 rounded-2xl p-2 shadow-elev-3 backdrop-blur-xl border border-white/20 dark:border-white/10"
                onMouseLeave={() => setCityOpen(false)}
              >
                {CITIES.map((c) => {
                  const active = city.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        void setCity(c.id);
                        setCityOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold transition-colors cursor-pointer",
                        active
                          ? "bg-accent/15 text-accent"
                          : "hover:bg-white/20 dark:hover:bg-white/10 text-foreground"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span>{c.name}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-normal">{c.blurb}</div>
                      </div>
                      {active && <Check size={13} className="text-accent shrink-0 ml-1.5" />}
                    </button>
                  );
                })}
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
