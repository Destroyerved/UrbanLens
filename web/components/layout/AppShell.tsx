"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import MapCanvas from "@/components/map/MapCanvas";
import MapControls from "@/components/map/MapControls";
import LayerPanel from "@/components/map/LayerPanel";
import BasemapSelector from "@/components/map/BasemapSelector";
import Legend from "@/components/map/Legend";
import TopBar from "./TopBar";
import ModeRail from "./ModeRail";
import CommandPalette from "@/components/search/CommandPalette";
import ParcelDrawer from "@/components/parcels/ParcelDrawer";
import CopilotDrawer from "@/components/copilot/CopilotDrawer";
import OverviewPanel from "@/components/panels/OverviewPanel";
import GrowthPanel from "@/components/panels/GrowthPanel";
import InfrastructurePanel from "@/components/panels/InfrastructurePanel";
import LandPanel from "@/components/panels/LandPanel";
import SiteSelectionPanel from "@/components/panels/SiteSelectionPanel";
import SimulatorPanel from "@/components/panels/SimulatorPanel";
import { GlassFilter } from "@/components/ui/GlassFilter";
import { GlobalSpotlight } from "@/components/ui/spotlight-card";

export default function AppShell() {
  const mode = useApp((s) => s.mode);
  const setCity = useApp((s) => s.setCity);
  const city = useApp((s) => s.city);
  const cityLoading = useApp((s) => s.cityLoading);
  const datasetVersion = useApp((s) => s.datasetVersion);
  
  const panelOpen = useApp((s) => s.panelOpen);
  const setPanelOpen = useApp((s) => s.setPanelOpen);
  const copilotOpen = useApp((s) => s.copilotOpen);
  const searchFocused = useApp((s) => s.searchFocused);
  const setSearchFocused = useApp((s) => s.setSearchFocused);
  const [layersOpen, setLayersOpen] = useState(false);

  const hasActiveRightPanel = copilotOpen || panelOpen;

  // The map layers ship empty and are fetched from the engine, so the study
  // area has to be loaded before anything renders real geography. `?city=`
  // makes an area linkable the same way `?mode=` makes a panel linkable.
  useEffect(() => {
    const requested =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("city")
        : null;
    void setCity(requested ?? city.id);
    // Runs once on mount; later changes come from the switcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Global continuous pointer tracker for specular glass border highlights */}
      <GlobalSpotlight />

      {/* SVG liquid glass distortion filter definition */}
      <GlassFilter />

      {/* Main website content layer — applies aesthetic optical blur, depth scale and saturation when search is focused */}
      <div
        className={cn(
          "absolute inset-0 transition-all duration-400 ease-out",
          searchFocused && "blur-[8px] scale-[0.99] brightness-[0.92] saturate-[1.25] pointer-events-none select-none"
        )}
      >
        {/* Base: the map never unmounts */}
        <MapCanvas />

        {/* Switching study area reloads every layer; say so rather than showing
            the previous city's geography under the new city's name. */}
        {(cityLoading || datasetVersion === 0) && (
          <div className="pointer-events-none absolute inset-x-0 top-[72px] z-[60] flex justify-center">
            <div className="glass-strong flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold shadow-elev-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
              Loading {city.name}…
            </div>
          </div>
        )}

        {/* Chrome ModeRail */}
        <div className="pointer-events-none absolute left-4 top-[76px] z-[35]">
          <ModeRail />
        </div>

        {/* Contextual intelligence panel on the right OR AI Copilot seamlessly replacing it */}
        <AnimatePresence>
          {copilotOpen ? (
            <CopilotDrawer key="copilot-drawer" />
          ) : panelOpen ? (
            <motion.div
              key="active-mode-panel-container"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="pointer-events-auto absolute bottom-5 right-4 top-[76px] z-[30] flex w-[336px] flex-col max-h-[calc(100vh-96px)]"
            >
              <AnimatePresence mode="wait">
                {mode === "overview" && <OverviewPanel key="overview" />}
                {mode === "growth" && <GrowthPanel key="growth" />}
                {mode === "infrastructure" && <InfrastructurePanel key="infrastructure" />}
                {mode === "land" && <LandPanel key="land" />}
                {mode === "sites" && <SiteSelectionPanel key="sites" />}
                {mode === "simulator" && <SimulatorPanel key="simulator" />}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Floating Restore Arrow Tab when panel is collapsed */}
        <AnimatePresence>
          {!hasActiveRightPanel && (
            <motion.div
              initial={{ opacity: 0, x: 24, scale: 0.85 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 450, damping: 30 }}
              className="pointer-events-auto fixed right-3 top-1/2 -translate-y-1/2 z-[30]"
            >
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                aria-label="Open intelligence panel"
                title="Open intelligence panel"
                className="glass-strong group flex h-11 w-11 items-center justify-center rounded-2xl text-accent shadow-elev-3 transition-all hover:scale-110 hover:border-accent/80 hover:bg-accent/25 hover:shadow-accent/30 active:scale-95 cursor-pointer backdrop-blur-xl ring-1 ring-white/20 dark:ring-white/10"
              >
                <ChevronLeft size={20} className="transition-transform duration-200 group-hover:-translate-x-1" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating map controls on the right, dynamically positioned beside the active panel */}
        <div
          className={cn(
            "pointer-events-auto absolute bottom-5 z-[25] flex items-end gap-3 transition-all duration-300 ease-out",
            hasActiveRightPanel ? "right-[356px]" : "right-4"
          )}
        >
          <LayerPanel open={layersOpen} />
          <MapControls onToggleLayers={() => setLayersOpen((v) => !v)} layersOpen={layersOpen} />
        </div>

        {/* Bottom-left: Morphing Basemap Gallery + Legend */}
        <div className="pointer-events-none absolute bottom-5 left-4 z-[25] flex flex-col items-start gap-3">
          <div className="pointer-events-auto">
            <BasemapSelector />
          </div>

          <div className="pointer-events-auto">
            <Legend />
          </div>
        </div>
      </div>

      {/* Ethereal Frosted Glow Overlay when search is active */}
      <AnimatePresence>
        {searchFocused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setSearchFocused(false)}
            className="fixed inset-0 z-[40] bg-black/10 dark:bg-black/25 backdrop-blur-sm cursor-pointer"
          >
            {/* Ambient Celestial Spotlight directly behind search bar */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_40%_at_50%_0%,rgba(56,189,248,0.18),transparent_70%)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chrome TopBar sits ABOVE blur layer so search dock remains in sharp crystal focus */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-[50]">
        <TopBar />
      </div>

      {/* Top-level Interactive Overlays */}
      <ParcelDrawer />
      <CommandPalette />
    </div>
  );
}