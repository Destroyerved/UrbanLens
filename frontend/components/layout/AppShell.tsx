"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/store";
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

export default function AppShell() {
  const mode = useApp((s) => s.mode);
  const [layersOpen, setLayersOpen] = useState(false);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* SVG liquid glass distortion filter definition */}
      <GlassFilter />

      {/* Base: the map never unmounts */}
      <MapCanvas />

      {/* Chrome TopBar */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-[10]">
        <TopBar />
      </div>

      {/* Chrome ModeRail */}
      <div className="pointer-events-none absolute left-4 top-[76px] z-[10]">
        <ModeRail />
      </div>

      {/* Contextual intelligence panel on the right */}
      <div className="pointer-events-none absolute bottom-5 right-4 top-[76px] z-[20] flex w-[336px] flex-col">
        <div className="pointer-events-auto max-h-full">
          <AnimatePresence mode="wait">
            {mode === "overview" && <OverviewPanel key="overview" />}
            {mode === "growth" && <GrowthPanel key="growth" />}
            {mode === "infrastructure" && <InfrastructurePanel key="infrastructure" />}
            {mode === "land" && <LandPanel key="land" />}
            {mode === "sites" && <SiteSelectionPanel key="sites" />}
            {mode === "simulator" && <SimulatorPanel key="simulator" />}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating map controls on the right, left of the panel */}
      <div className="pointer-events-auto absolute bottom-5 right-[366px] z-[10] flex items-end gap-3">
        <LayerPanel open={layersOpen} />
        <MapControls onToggleLayers={() => setLayersOpen((v) => !v)} layersOpen={layersOpen} />
      </div>

      {/* Bottom-left: Morphing Basemap Gallery + Legend + provenance disclaimer */}
      <div className="pointer-events-none absolute bottom-5 left-4 z-[25] flex flex-col items-start gap-3">
        {/* Morphing Expandable Basemap Selector */}
        <div className="pointer-events-auto">
          <BasemapSelector />
        </div>

        <div className="pointer-events-auto">
          <Legend />
        </div>
      </div>

      {/* Overlays */}
      <ParcelDrawer />
      <CopilotDrawer />
      <CommandPalette />
    </div>
  );
}
