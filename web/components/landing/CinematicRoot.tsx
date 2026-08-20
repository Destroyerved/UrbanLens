"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Lenis from "lenis";
import { cn } from "@/lib/utils";
import { Magnetic } from "@/components/ui/magnetic";
import { stage } from "@/lib/landing/timeline";
import { APP_ROUTE, NAV } from "@/lib/landing/story";
import {
  ExplainScene,
  FinalScene,
  Footer,
  HeroScene,
  IdentifyScene,
  LocateScene,
  MetricsScene,
  ObserveScene,
  PositioningScene,
  PredictScene,
  ProblemScene,
  QuietScene,
  RecommendScene,
  SimulateScene,
  UnderstandScene,
} from "./scenes";

/* Both stages are heavy and client-only — they load after first paint. */
const EarthStage = dynamic(() => import("./EarthStage"), { ssr: false });
const CityStage = dynamic(() => import("./CityStage"), { ssr: false });
const StarsBackground = dynamic(() => import("@/components/ui/stars"), { ssr: false });
const MagneticCursor = dynamic(
  () => import("@/components/ui/magnetic-cursor").then((m) => m.MagneticCursor),
  { ssr: false }
);

declare global {
  interface Window {
    __lenis?: Lenis | null;
  }
}

/* ── the director: scroll position → stage.T ─────────────────────── */

function useDirector() {
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
    stage.T = 0;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.reduced = reduced;
    stage.compact = window.matchMedia("(max-width: 860px)").matches;

    let metrics: { top: number; height: number }[] = [];

    const measure = () => {
      metrics = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"))
        .sort((a, b) => Number(a.dataset.scene) - Number(b.dataset.scene))
        .map((n) => ({
          top: n.getBoundingClientRect().top + window.scrollY,
          height: n.offsetHeight,
        }));
      compute();
    };

    const compute = () => {
      const y = window.scrollY;
      let T = 0;
      for (const m of metrics) {
        const raw = (y - m.top) / Math.max(1, m.height);
        T += raw < 0 ? 0 : raw > 1 ? 1 : raw;
      }
      stage.T = T;
    };

    let lenis: Lenis | null = null;
    let raf = 0;

    if (!reduced) {
      lenis = new Lenis({
        duration: 1.2,
        lerp: 0.08,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1.9,
        touchMultiplier: 2.2,
        syncTouch: false,
      });
      window.__lenis = lenis;
      lenis.scrollTo(0, { immediate: true });
      const loop = (time: number) => {
        raf = requestAnimationFrame(loop);
        lenis?.raf(time);
      };
      raf = requestAnimationFrame(loop);
      lenis.on("scroll", compute);
    } else {
      window.addEventListener("scroll", compute, { passive: true });
    }

    // `measure` reads getBoundingClientRect on every scene, so it forces a full
    // layout. Observing document.body fires it for any height change at all —
    // including ones the scenes themselves cause — which is a layout-thrash
    // loop during scroll. Only re-measure when the height genuinely moved.
    let lastBodyHeight = -1;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? -1;
      if (Math.abs(h - lastBodyHeight) < 1) return;
      lastBodyHeight = h;
      measure();
    });
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    measure();
    const t = window.setTimeout(measure, 400);

    const onBeforeUnload = () => {
      window.scrollTo(0, 0);
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", compute);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.__lenis = null;
      lenis?.destroy();
    };
  }, []);
}

/* ── minimal header, matching the reference's restraint ──────────── */

function Nav() {
  const bar = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  const scrollToSection = (href: string, index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setActive(index);
    if (href === "#top") {
      if (window.__lenis) {
        window.__lenis.scrollTo(0, { duration: 1.35 });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      return;
    }

    const targetEl = document.querySelector(href);
    if (targetEl) {
      if (window.__lenis) {
        window.__lenis.scrollTo(targetEl as HTMLElement, { duration: 1.45, offset: 0 });
      } else {
        targetEl.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  useEffect(() => {
    let lastY = -1;
    let lastCur = -1;
    let hidden: boolean | null = null;
    let raf = 0;

    // Automatically hide navbar after 2.2s upon landing on the page
    const autoHideTimer = setTimeout(() => {
      if (bar.current && window.scrollY < 100) {
        bar.current.style.transform = "translateY(-130%)";
        hidden = true;
      }
    }, 2200);

    // This loop runs for the entire life of the landing page, so every branch
    // in it has to be a no-op while the page is still. Previously it dispatched
    // a setState and rewrote a style on all 60 frames a second even when
    // nothing had moved.
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const y = window.scrollY;

      if (lastY < 0) lastY = y;
      const diff = y - lastY;
      if (Math.abs(diff) >= 3) {
        const nextHidden = diff > 0; // down hides, up reveals
        if (nextHidden !== hidden) {
          hidden = nextHidden;
          if (bar.current) {
            bar.current.style.transform = nextHidden ? "translateY(-130%)" : "translateY(0)";
          }
        }
        lastY = y;
      }

      // Track active scene based on stage.T
      const T = stage.T;
      let cur = 0;
      if (T >= 10) cur = 5; // COPILOT
      else if (T >= 8) cur = 4; // SITE SELECTION
      else if (T >= 7) cur = 3; // LAND
      else if (T >= 6) cur = 2; // INFRASTRUCTURE
      else if (T >= 4) cur = 1; // GROWTH
      else cur = 0; // OVERVIEW

      if (cur !== lastCur) {
        lastCur = cur;
        setActive(cur);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(autoHideTimer);
    };
  }, []);

  const activeIndex = hovered !== null ? hovered : active;

  return (
    <header ref={bar} className="ulc-nav">
      <a
        href="#top"
        onClick={(e) => scrollToSection("#top", 0, e)}
        className="group flex cursor-pointer items-center gap-3.5 transition-opacity hover:opacity-90"
      >
        <span className="ulc-display text-[15px] font-bold tracking-[0.24em] text-white">
          URBANLENS
        </span>
        <span className="h-3 w-px bg-white/20" aria-hidden />
        <span className="ulc-tech-sm hidden tracking-[0.28em] text-[rgba(226,240,255,0.55)] sm:inline">
          URBAN PLANNING &amp; LAND INTELLIGENCE
        </span>
      </a>

      {/* Futuristic interactive capsule bar */}
      <nav
        className="relative hidden items-center gap-1 rounded-full border border-white/10 bg-[rgba(2,4,10,0.6)] px-2.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:flex"
        onMouseLeave={() => setHovered(null)}
      >
        {NAV.map((n, i) => {
          const isItemActive = i === activeIndex;
          return (
            <motion.a
              key={n.label}
              href={n.href}
              onClick={(e) => scrollToSection(n.href, i, e)}
              onMouseEnter={() => setHovered(i)}
              whileHover={{ scale: 1.04 }}
              animate={{ scale: isItemActive ? 1.02 : 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
              className={cn(
                "relative z-10 rounded-full px-3.5 py-1 text-[9.5px] font-mono font-medium tracking-[0.24em] transition-colors duration-300 uppercase",
                isItemActive
                  ? "text-white text-shadow-[0_0_10px_rgba(22,217,245,0.7)]"
                  : "text-[rgba(226,240,255,0.55)] hover:text-white"
              )}
            >
              {isItemActive && (
                <motion.div
                  layoutId="nav-active-pill"
                  className="absolute inset-0 -z-10 rounded-full border border-[rgba(22,217,245,0.65)] bg-[rgba(22,217,245,0.18)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.45),inset_0_-1px_2px_rgba(0,0,0,0.4),0_0_18px_rgba(22,217,245,0.35)] backdrop-blur-md"
                  transition={{ type: "spring", stiffness: 450, damping: 30 }}
                />
              )}
              {n.label}
            </motion.a>
          );
        })}
      </nav>

      <Magnetic intensity={0.5} range={70} actionArea="self">
        <a
          href={APP_ROUTE}
          className="ulc-navlink inline-flex items-center gap-1.5 cursor-pointer text-[10px] tracking-[0.28em] text-white/80 transition-all duration-300 hover:text-white hover:tracking-[0.32em]"
        >
          <span>ENTER</span>
          <span className="text-[var(--cyan)] font-sans">→</span>
        </a>
      </Magnetic>
    </header>
  );
}

function OpeningCurtain() {
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Never hold first content behind an artificial half-second delay.
    const t = setTimeout(() => {
      setReady(true);
    }, 120);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) return null;

  return (
    <div className={cn("ulc-opening-veil", ready && "ulc-veil-open")} aria-hidden="true">
      <div
        className={cn(
          "flex flex-col items-center gap-3.5 transition-all duration-300",
          ready ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <span className="ulc-display text-[14px] font-bold tracking-[0.32em] text-white">
          URBANLENS
        </span>
        <div className="h-0.5 w-20 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full animate-[ulc-shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[var(--cyan)] to-transparent" />
        </div>
      </div>
    </div>
  );
}

/* ── the experience ──────────────────────────────────────────────── */

export default function CinematicRoot() {
  useDirector();
  const [visualsReady, setVisualsReady] = useState(false);
  const [cityStageReady, setCityStageReady] = useState(false);

  useEffect(() => {
    // Let text/nav paint first; WebGL is loaded during the first idle slice.
    const start = () => setVisualsReady(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 350 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 120);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    // The city MapLibre chapter is several screens down. Do not download or
    // initialize a second WebGL engine while the hero globe is still visible.
    const check = () => {
      if (window.scrollY > window.innerHeight * 0.8) {
        setCityStageReady(true);
        // One-shot: the second WebGL engine never gets torn down again, so
        // leaving this bound means a listener firing on every scroll event for
        // the rest of the session to re-set a state that is already true.
        window.removeEventListener("scroll", check);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  return (
    <div className="ulc relative">
      <OpeningCurtain />
      {visualsReady && <StarsBackground className="pointer-events-none fixed inset-0 z-0 bg-transparent" />}
      {visualsReady && <EarthStage />}
      {cityStageReady && <CityStage />}
      <div className="ulc-vignette pointer-events-none fixed inset-0 z-[1]" aria-hidden />

      <Nav />

      <MagneticCursor cursorSize={76} blendMode="difference">
        <main className="relative z-10 isolate">
          <HeroScene />
          <ProblemScene />
          <MetricsScene />
          <LocateScene />
          <ObserveScene />
          <PredictScene />
          <UnderstandScene />
          <IdentifyScene />
          <RecommendScene />
          <SimulateScene />
          <ExplainScene />
          <QuietScene />
          <PositioningScene />
          <FinalScene />

          {/* clearance so the last pinned scene dissolves before the footer */}
          <div aria-hidden className="h-svh" />
        </main>
      </MagneticCursor>

      <Footer />
    </div>
  );
}
