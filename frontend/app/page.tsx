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
  { ssr: false }
);

type TransitionPhase = "idle" | "expanding" | "done";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [showApp, setShowApp] = useState(false);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── ANIMATION DRIVER ──────────────────────────────────────────────────────
  // Lives here at the page level so the overlay is NEVER unmounted mid-animation.
  // We keep the overlay elements permanently in the DOM and use visibility/opacity
  // changes to trigger browser-side transitions reliably.
  const triggerEnter = () => {
    if (phase !== "idle") return; // prevent double clicks
    
    console.log("[UrbanLens] Globe clicked — cloud-dive animation started");
    setPhase("expanding");

    // After 2.8s (when final black fade is fully opaque), swap to AppShell
    timerRef.current = setTimeout(() => {
      console.log("[UrbanLens] Animation complete — loading AppShell");
      setShowApp(true);
      setPhase("done");

      // After another 600ms (when black fade has finished fading out), reset phase to idle
      resetTimerRef.current = setTimeout(() => {
        setPhase("idle");
        console.log("[UrbanLens] Transition overlay fully reset to idle");
      }, 600);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
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
        <LandingPage onEnterApp={triggerEnter} />
      )}

      {/* ══════════════════════════════════════════════════════════════
          FULLSCREEN CLOUD-DIVE OVERLAY (PERMANENTLY MOUNTED IN DOM)
          Kept permanently in the DOM so that transitions can run smoothly
          when changing state, avoiding React conditional rendering glitches.
          Accurately timed over 2.8 seconds.
      ══════════════════════════════════════════════════════════════ */}
      {/* Layer 1 — deep space dark base, expands first and widest */}
      <div
        className="pointer-events-none fixed inset-0 z-[88]"
        style={{
          background:
            "radial-gradient(circle at 72% 50%, #060f1e 0%, #020810 50%, #000510 100%)",
          opacity: phase === "expanding" ? 1 : 0,
          transform: phase === "expanding" ? "scale(5.5)" : "scale(0.04)",
          transformOrigin: "72% 50%",
          transition:
            phase === "expanding"
              ? "opacity 0.3s ease, transform 2.6s cubic-bezier(0.16, 1, 0.3, 1)"
              : "opacity 0.4s ease, transform 0.4s ease",
          borderRadius: phase === "expanding" ? "0%" : "50%",
          visibility: phase === "idle" ? "hidden" : "visible",
        }}
      />

      {/* Layer 2 — blue atmosphere bloom ring */}
      <div
        className="pointer-events-none fixed inset-0 z-[89]"
        style={{
          background:
            "radial-gradient(circle at 72% 50%, transparent 18%, rgba(30,100,220,0.22) 36%, rgba(15,60,160,0.14) 58%, transparent 78%)",
          opacity: phase === "expanding" ? 1 : 0,
          transform: phase === "expanding" ? "scale(4.8)" : "scale(0.04)",
          transformOrigin: "72% 50%",
          transition:
            phase === "expanding"
              ? "opacity 0.4s ease 0.1s, transform 2.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s"
              : "opacity 0.4s ease, transform 0.4s ease",
          borderRadius: phase === "expanding" ? "0%" : "50%",
          filter: "blur(10px)",
          visibility: phase === "idle" ? "hidden" : "visible",
        }}
      />

      {/* Layer 3 — bright white cloud core */}
      <div
        className="pointer-events-none fixed inset-0 z-[90]"
        style={{
          background:
            "radial-gradient(circle at 72% 50%, rgba(210,235,255,0.98) 0%, rgba(140,195,255,0.75) 20%, rgba(60,135,225,0.4) 44%, rgba(10,30,90,0.18) 68%, transparent 85%)",
          opacity: phase === "expanding" ? 1 : 0,
          transform: phase === "expanding" ? "scale(4.2)" : "scale(0.0)",
          transformOrigin: "72% 50%",
          transition:
            phase === "expanding"
              ? "opacity 0.3s ease 0.2s, transform 2.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s"
              : "opacity 0.4s ease, transform 0.4s ease",
          borderRadius: phase === "expanding" ? "0%" : "50%",
          filter: "blur(5px)",
          visibility: phase === "idle" ? "hidden" : "visible",
        }}
      />

      {/* Layer 4 — final black fade */}
      <div
        className="pointer-events-none fixed inset-0 z-[91]"
        style={{
          background: "linear-gradient(135deg, #000510 0%, #000210 100%)",
          opacity: phase === "expanding" ? 1 : 0,
          transition:
            phase === "expanding"
              ? "opacity 0.6s ease 2.2s"
              : phase === "done"
              ? "opacity 0.6s ease"
              : "none",
          visibility: phase === "idle" ? "hidden" : "visible",
        }}
      />
    </>
  );
}
