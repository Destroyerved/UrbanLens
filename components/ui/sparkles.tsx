"use client";
import React, { useId, useCallback, useRef, useEffect, useState } from "react";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import type { Container } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";
import { cn } from "@/lib/utils";
import { motion, useAnimation } from "framer-motion";

type ParticlesProps = {
  id?: string;
  className?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleColor?: string;
  particleDensity?: number;
};

/**
 * SparklesCore — ambient particle sparkle field.
 *
 * Uses @tsparticles/react v4 which requires ParticlesProvider + useCallback
 * for the stable `init` prop. The provider handles engine initialisation
 * and must wrap the Particles component.
 */
export const SparklesCore = (props: ParticlesProps) => {
  const {
    id,
    className,
    background,
    minSize,
    maxSize,
    speed,
    particleColor,
    particleDensity,
  } = props;

  const [loaded, setLoaded] = useState(false);

  const particlesLoaded = async (container?: Container) => {
    if (container) {
      setLoaded(true);
    }
  };

  // Must be stable (useCallback) — ParticlesProvider enforces this.
  const init = useCallback(async (engine: Parameters<typeof loadSlim>[0]) => {
    await loadSlim(engine);
  }, []);

  const generatedId = useId();

  return (
    <ParticlesProvider init={init}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: 1 }}
        className={className}
      >
        <Particles
          id={id || generatedId}
          className={cn("h-full w-full")}
          particlesLoaded={particlesLoaded}
          options={{
            background: {
              color: {
                value: background || "transparent",
              },
            },
            fullScreen: {
              enable: false,
              zIndex: 1,
            },
            fpsLimit: 60,
            interactivity: {
              events: {
                onClick: { enable: false },
                onHover: { enable: false },
                resize: true as any,
              },
            },
            particles: {
              color: {
                value: particleColor || "#ffffff",
              },
              move: {
                direction: "none",
                enable: true,
                outModes: { default: "out" },
                random: true,
                speed: {
                  min: 0.1,
                  max: speed ?? 1,
                },
                straight: false,
              },
              number: {
                density: {
                  enable: true,
                  width: 400,
                  height: 400,
                },
                value: particleDensity ?? 80,
              },
              opacity: {
                value: { min: 0.1, max: 0.8 },
                animation: {
                  enable: true,
                  speed: speed ?? 2,
                  sync: false,
                  startValue: "random" as any,
                  destroy: "none" as any,
                },
              },
              shape: {
                type: "circle",
              },
              size: {
                value: {
                  min: minSize ?? 0.4,
                  max: maxSize ?? 1,
                },
              },
            },
            detectRetina: true,
          }}
        />
      </motion.div>
    </ParticlesProvider>
  );
};

/**
 * SectionSparkles — lazy-mounting ambient particle layer for scroll sections.
 *
 * Uses IntersectionObserver so particles only render when the section is
 * in/near the viewport (rootMargin 100px). Unmounts when scrolled away,
 * keeping total concurrent particle engines to ≤ 2 at any time.
 *
 * Drop inside a `relative` section as an early child at absolute z-[1].
 * All section content (cards, text) should be `relative` with default stacking
 * (z-auto) which paints above z-[1], naturally occluding sparkles behind cards.
 */
type SectionSparklesProps = ParticlesProps & {
  containerClassName?: string;
};

export const SectionSparkles = ({
  containerClassName,
  ...sparkleProps
}: SectionSparklesProps) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin: "100px 0px 100px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        // Full-section layer: pointer-events-none so cards stay fully
        // interactive. z-[1] keeps sparkles beneath all relative content.
        "pointer-events-none absolute inset-0 z-[1]",
        containerClassName
      )}
      // Radial mask fades the particle field at all edges — no hard cutoff
      style={{
        maskImage:
          "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 10%, white 70%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 10%, white 70%)",
      }}
    >
      {active && (
        <SparklesCore
          background="transparent"
          minSize={0.35}
          maxSize={0.85}
          particleDensity={70}
          speed={1.2}
          particleColor="#38bdf8"
          className="h-full w-full"
          {...sparkleProps}
        />
      )}
    </div>
  );
};
