"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import components to avoid SSR issues with canvas/three.js
const LandingPage = dynamic(
  () => import("@/components/layout/LandingPage"),
  { ssr: false }
);
const AppShell = dynamic(
  () => import("@/components/layout/AppShell"),
  { ssr: false, loading: () => <div style={{ background: '#05070C', width: '100vw', height: '100vh' }} /> }
);

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [showApp, setShowApp] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── ANIMATION DRIVER ──────────────────────────────────────────────────────
  // Triggers the camera zoom plunge and schedules the WebGL context cleanup
  // and AppShell loading after the camera enters the cloud layer (1200ms).
  const triggerEnter = () => {
    if (isZoomed) return; // prevent double clicks
    
    console.log("[UrbanLens] Globe clicked — camera zoom-in transition started");
    setIsZoomed(true);

    // After 1200ms (camera completes zoom plunge), swap to AppShell immediately,
    // then dispose WebGL on the *next* animation frame so React has already painted
    // the dashboard before the canvas clears — preventing any black flash.
    timerRef.current = setTimeout(() => {
      console.log("[UrbanLens] Transition complete — loading AppShell");
      
      // Mount AppShell first — React will paint it on the next frame
      setShowApp(true);
      
      // Dispose WebGL after React has had one frame to render AppShell
      requestAnimationFrame(() => {
        if (typeof window !== "undefined" && (window as any).__threeRenderer) {
          try {
            (window as any).__threeRenderer.forceContextLoss();
            (window as any).__threeRenderer.dispose();
            (window as any).__threeRenderer = null;
          } catch (err) {
            console.warn("[GlobeScene] WebGL renderer cleanup failed (non-fatal):", err);
          }
        }
      });
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Loading screen before hydration
  if (!mounted) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 ring-1 ring-blue-400/40">
            <div className="h-3.5 w-3.5 animate-pulse rounded-sm bg-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">UrbanLens</div>
            <div className="text-[11px] text-white/40">
              Initialising spatial intelligence…
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── PAGE CONTENT ── */}
      {showApp ? (
        <AppShell />
      ) : (
        <LandingPage isZoomed={isZoomed} onEnterApp={triggerEnter} />
      )}
    </>
  );
}

