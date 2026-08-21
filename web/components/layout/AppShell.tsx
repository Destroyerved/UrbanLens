"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import MapControls from "@/components/map/MapControls";
import LayerPanel from "@/components/map/LayerPanel";
import { BasemapSelectorButton, BasemapGalleryPanel } from "@/components/map/BasemapSelector";
import { LegendButton, LegendPanel } from "@/components/map/Legend";
import TopBar from "./TopBar";
import ModeRail from "./ModeRail";
import CommandPalette from "@/components/search/CommandPalette";
import CityLoadingOverlay from "@/components/shared/CityLoadingOverlay";
import { GlobalSpotlight } from "@/components/ui/spotlight-card";


// Split the heavyweight map/panel code. The default overview/map chunks start
// immediately, while growth/simulator/copilot code is not downloaded until the
// user opens it.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });
const ParcelDrawer = dynamic(() => import("@/components/parcels/ParcelDrawer"), { ssr: false });
const CopilotDrawer = dynamic(() => import("@/components/copilot/CopilotDrawer"), { ssr: false });
const OverviewPanel = dynamic(() => import("@/components/panels/OverviewPanel"), { ssr: false });
const GrowthPanel = dynamic(() => import("@/components/panels/GrowthPanel"), { ssr: false });
const InfrastructurePanel = dynamic(() => import("@/components/panels/InfrastructurePanel"), { ssr: false });
const LandPanel = dynamic(() => import("@/components/panels/LandPanel"), { ssr: false });
const SiteSelectionPanel = dynamic(() => import("@/components/panels/SiteSelectionPanel"), { ssr: false });
const SimulatorPanel = dynamic(() => import("@/components/panels/SimulatorPanel"), { ssr: false });
const EquityPanel = dynamic(() => import("@/components/panels/EquityPanel"), { ssr: false });
const ConservationPanel = dynamic(() => import("@/components/panels/ConservationPanel"), { ssr: false });
const CorridorPanel = dynamic(() => import("@/components/panels/CorridorPanel"), { ssr: false });
const CompareCandidatesPanel = dynamic(() => import("@/components/panels/CompareCandidatesPanel"), { ssr: false });

export default function AppShell() {
  const mode = useApp((s) => s.mode);
  const setCity = useApp((s) => s.setCity);
  const city = useApp((s) => s.city);
  const cityLoading = useApp((s) => s.cityLoading);
  const datasetVersion = useApp((s) => s.datasetVersion);
  
  const panelOpen = useApp((s) => s.panelOpen);
  const setPanelOpen = useApp((s) => s.setPanelOpen);
  const copilotOpen = useApp((s) => s.copilotOpen);
  const compareOpen = useApp((s) => s.compareOpen);
  const searchFocused = useApp((s) => s.searchFocused);
  const setSearchFocused = useApp((s) => s.setSearchFocused);
  const paletteOpen = useApp((s) => s.paletteOpen);
  const setPaletteOpen = useApp((s) => s.setPaletteOpen);
  const citySwitcherOpen = useApp((s) => s.citySwitcherOpen);
  const setCitySwitcherOpen = useApp((s) => s.setCitySwitcherOpen);

  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [basemapOpen, setBasemapOpen] = useState(false);

  const hasActiveRightPanel = copilotOpen || panelOpen;
  const isModalActive = searchFocused || paletteOpen || citySwitcherOpen;

  // Click outside listener for bottom-left popups
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-bottom-left-control]")) {
        setLegendOpen(false);
        setBasemapOpen(false);
      }
    };
    if (legendOpen || basemapOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [legendOpen, basemapOpen]);

  // Global Escape key listener to dismiss all active search/city modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalActive) {
        setSearchFocused(false);
        setPaletteOpen(false);
        setCitySwitcherOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalActive, setSearchFocused, setPaletteOpen, setCitySwitcherOpen]);

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

      {/* Global Liquid Glass Blur Backdrop — covers and blurs entire workspace including map and controls */}
      <AnimatePresence>
        {isModalActive && (
          <motion.div
            key="global-glass-blur-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => {
              setSearchFocused(false);
              setPaletteOpen(false);
              setCitySwitcherOpen(false);
            }}
            className="pointer-events-auto fixed inset-0 z-[48] bg-slate-900/15 dark:bg-slate-950/25 backdrop-blur-xl cursor-pointer transition-opacity"
          />
        )}
      </AnimatePresence>

      {/* Main website content layer — applies aesthetic optical blur, depth scale and saturation when city is loading or modal is active */}
      <div
        className={cn(
          "absolute inset-0 transition-all duration-300 ease-out",
          (cityLoading || datasetVersion === 0) &&
            "opacity-70 brightness-[0.90] pointer-events-none select-none",
          isModalActive &&
            "filter blur-[16px] saturate-[140%] scale-[0.995] pointer-events-none select-none"
        )}
      >
        {/* Base: the map never unmounts */}
        <MapCanvas />

        {/* Chrome ModeRail */}
        <div className="pointer-events-none absolute left-4 top-[76px] z-[35]">
          <ModeRail />
        </div>

        {/* Side-by-side Candidate Sites Comparison Panel (Left of right panel) */}
        <AnimatePresence>
          {compareOpen && mode === "sites" && (
            <CompareCandidatesPanel key="compare-candidates-panel" />
          )}
        </AnimatePresence>

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
              className="pointer-events-auto absolute bottom-5 right-4 top-[76px] z-[30] flex w-[360px] flex-col max-h-[calc(100vh-96px)]"
            >
              <AnimatePresence mode="wait">
                {mode === "overview" && <OverviewPanel key="overview" />}
                {mode === "growth" && <GrowthPanel key="growth" />}
                {mode === "infrastructure" && <InfrastructurePanel key="infrastructure" />}
                {mode === "land" && <LandPanel key="land" />}
                {mode === "sites" && <SiteSelectionPanel key="sites" />}
                {mode === "simulator" && <SimulatorPanel key="simulator" />}
                {mode === "equity" && <EquityPanel key="equity" />}
                {mode === "conservation" && <ConservationPanel key="conservation" />}
                {mode === "corridor" && <CorridorPanel key="corridor" />}
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

        {/* Floating map controls on the right, dynamically positioned beside the active panel or comparison */}
        <div
          className={cn(
            "pointer-events-auto absolute bottom-5 z-[25] flex items-end gap-3 transition-all duration-300 ease-out",
            compareOpen && mode === "sites"
              ? "right-[910px]"
              : hasActiveRightPanel
                ? "right-[380px]"
                : "right-4"
          )}
        >
          <LayerPanel open={layersOpen} />
          <MapControls onToggleLayers={() => setLayersOpen((v) => !v)} layersOpen={layersOpen} />
        </div>

        {/* Bottom-left: Fixed Static Corner Buttons (Overview & Basemap) */}
        <div
          data-bottom-left-control
          className="pointer-events-none absolute bottom-5 left-4 z-[30] flex flex-col gap-2.5"
        >
          <div className="pointer-events-auto">
            <LegendButton
              isOpen={legendOpen}
              onToggle={() => {
                setLegendOpen((v) => !v);
                setBasemapOpen(false);
              }}
            />
          </div>
          <div className="pointer-events-auto">
            <BasemapSelectorButton
              isOpen={basemapOpen}
              onToggle={() => {
                setBasemapOpen((v) => !v);
                setLegendOpen(false);
              }}
            />
          </div>
        </div>

        {/* Floating Popout Panels (Anchored cleanly to the right of the buttons at left-[200px] bottom-5) */}
        <AnimatePresence>
          {legendOpen && (
            <div
              data-bottom-left-control
              className="pointer-events-auto absolute bottom-5 left-[200px] z-[40]"
            >
              <LegendPanel onClose={() => setLegendOpen(false)} />
            </div>
          )}
          {basemapOpen && (
            <div
              data-bottom-left-control
              className="pointer-events-auto absolute bottom-5 left-[200px] z-[40]"
            >
              <BasemapGalleryPanel onClose={() => setBasemapOpen(false)} />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Chrome TopBar sits in fixed sharp position */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-[50]">
        <TopBar />
      </div>

      {/* Top-level Interactive Overlays */}
      <ParcelDrawer />
      <CommandPalette />
      <CityLoadingOverlay />
    </div>
  );
}