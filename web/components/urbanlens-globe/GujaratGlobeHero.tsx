"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import GlobeCanvas from "./GlobeCanvas";
import GlobeScrollController from "./GlobeScrollController";
import { useGlobeSnapshot } from "./lib/store";
import type { GlobeStage } from "./lib/stage";
import "./styles/globe.css";

export interface GlobeStageCopy {
  /** small mono label above the headline */
  label?: string;
  title: string;
  body?: string;
}

export interface GujaratGlobeHeroProps {
  /* ── hero copy (all optional, all overridable) ─────────────────── */
  eyebrow?: string;
  title?: string;
  description?: string;
  primaryCta?: { label: string; href: string } | null;
  secondaryCta?: { label: string; href: string } | null;

  /** copy for the india / gujarat / cities beats of the sequence */
  stages?: Partial<Record<Exclude<GlobeStage, "earth">, GlobeStageCopy>>;

  /* ── behaviour ─────────────────────────────────────────────────── */
  /** total scroll length of the pinned sequence, in viewport heights */
  scrollLength?: number;
  texturePath?: string;
  accent?: string;
  atmosphereColor?: string;
  showCityLabels?: boolean;
  showGrid?: boolean;
  quality?: "auto" | "high" | "low";
  className?: string;

  /* ── hooks for the rest of the landing page ────────────────────── */
  onStageChange?: (stage: GlobeStage) => void;
  onGujaratFocus?: () => void;
  onSequenceComplete?: () => void;

  /** rendered inside the pinned viewport, above the globe (optional) */
  children?: React.ReactNode;
}

const DEFAULT_STAGES: Record<Exclude<GlobeStage, "earth">, GlobeStageCopy> = {
  india: { label: "INDIA", title: "Urban systems at scale" },
  gujarat: { label: "GUJARAT", title: "State-wide urban intelligence" },
  cities: {
    label: "URBAN NODES",
    title: "Ahmedabad · Gandhinagar · Surat · Vadodara · Rajkot",
    body: "Growth, infrastructure and land signals, resolved city by city.",
  },
  complete: {
    label: "URBANLENS",
    title: "From observation to decision",
    body: "Continue for growth prediction, infrastructure gaps and site recommendations.",
  },
};

/**
 * GujaratGlobeHero — a self-contained cinematic globe hero.
 *
 * The section is `scrollLength` viewports tall; the globe is pinned inside it
 * and driven by scroll from full Earth → India → Gujarat → urban nodes. All
 * text is normal accessible HTML layered over the WebGL canvas.
 */
export default function GujaratGlobeHero({
  eyebrow = "AI-POWERED SPATIAL INTELLIGENCE",
  title = "See Gujarat.\nUnderstand what comes next.",
  description = "UrbanLens transforms land, satellite, population and infrastructure data into explainable urban-planning intelligence across Gujarat.",
  primaryCta = { label: "Explore UrbanLens", href: "#explore" },
  secondaryCta = { label: "See How It Works", href: "#how-it-works" },
  stages,
  scrollLength = 4.5,
  texturePath = "/urbanlens-globe",
  accent = "#16D9F5",
  atmosphereColor = "#7ABEFF",
  showCityLabels = true,
  showGrid = true,
  quality = "auto",
  className = "",
  onStageChange,
  onGujaratFocus,
  onSequenceComplete,
  children,
}: GujaratGlobeHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const { stage, ready } = useGlobeSnapshot();
  const [, setLocalStage] = useState<GlobeStage>("earth");

  const copy = useMemo(
    () => ({ ...DEFAULT_STAGES, ...(stages ?? {}) }),
    [stages]
  );

  const handleStage = useCallback(
    (next: GlobeStage) => {
      setLocalStage(next);
      onStageChange?.(next);
    },
    [onStageChange]
  );

  const titleLines = title.split("\n");

  return (
    <section
      ref={sectionRef}
      className={`ulg-root ${className}`}
      style={{ height: `${Math.max(2, scrollLength) * 100}svh` }}
      data-stage={stage}
      data-ready={ready ? "true" : "false"}
    >
      <GlobeScrollController
        targetRef={sectionRef}
        onStageChange={handleStage}
        onGujaratFocus={onGujaratFocus}
        onSequenceComplete={onSequenceComplete}
      />

      <div className="ulg-viewport">
        <GlobeCanvas
          className="ulg-canvas"
          texturePath={texturePath}
          accent={accent}
          atmosphereColor={atmosphereColor}
          showCities={false}
          showCityLabels={false}
          showGrid={showGrid}
          quality={quality}
        />

        <div className="ulg-vignette" aria-hidden="true" />

        {/* ── stage 1: the hero itself ─────────────────────────────── */}
        <div className="ulg-overlay ulg-hero" data-active={stage === "earth"}>
          <div className="ulg-hero-inner">
            {eyebrow && <p className="ulg-eyebrow">{eyebrow}</p>}
            <h1 className="ulg-title">
              {titleLines.map((line, i) => (
                <span key={i} className="ulg-title-line">
                  <span style={{ transitionDelay: `${i * 90}ms` }}>{line}</span>
                </span>
              ))}
            </h1>
            {description && <p className="ulg-description">{description}</p>}

            {(primaryCta || secondaryCta) && (
              <div className="ulg-actions">
                {primaryCta && (
                  <a className="ulg-cta" href={primaryCta.href}>
                    {primaryCta.label} <span aria-hidden="true">→</span>
                  </a>
                )}
                {secondaryCta && (
                  <a className="ulg-cta-ghost" href={secondaryCta.href}>
                    {secondaryCta.label}
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="ulg-scrollcue" aria-hidden="true">
            <span>SCROLL</span>
            <i />
          </div>
        </div>

        {/* ── stages 2–5: caption cards, one visible at a time ─────── */}
        {(["india", "gujarat", "cities", "complete"] as const).map((key) => (
          <div
            key={key}
            className="ulg-overlay ulg-caption"
            data-active={stage === key}
          >
            <div className="ulg-caption-inner">
              {copy[key].label && <p className="ulg-eyebrow">{copy[key].label}</p>}
              <h2 className="ulg-caption-title">{copy[key].title}</h2>
              {copy[key].body && <p className="ulg-description">{copy[key].body}</p>}
            </div>
          </div>
        ))}

        {children}
      </div>
    </section>
  );
}
