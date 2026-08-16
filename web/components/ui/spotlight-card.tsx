"use client";

import React, { useEffect, useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
  glowColor?: "blue" | "purple" | "green" | "red" | "orange" | "yellow" | "cyan" | string;
  size?: "sm" | "md" | "lg";
  width?: string | number;
  height?: string | number;
  customSize?: boolean;
  interactive?: boolean;
  borderGlowColor?: string;
  glowSize?: number;
}

const colorNameOrCodeToBase = (glowColor: string): { base: number; spread: number } => {
  const c = glowColor.toLowerCase();
  if (c.includes("purple") || c.includes("168, 85, 247") || c.includes("c084fc") || c.includes("a855f7")) {
    return { base: 275, spread: 50 };
  }
  if (c.includes("green") || c.includes("34, 197, 94") || c.includes("22c55e") || c.includes("4ade80")) {
    return { base: 145, spread: 40 };
  }
  if (c.includes("red") || c.includes("239, 68, 68") || c.includes("ef4444") || c.includes("f87171")) {
    return { base: 0, spread: 35 };
  }
  if (c.includes("orange") || c.includes("245, 158, 11") || c.includes("f59e0b") || c.includes("fb923c")) {
    return { base: 32, spread: 35 };
  }
  if (c.includes("yellow") || c.includes("eab308") || c.includes("facc15")) {
    return { base: 48, spread: 30 };
  }
  // Default cyan/blue
  return { base: 195, spread: 40 };
};

const sizeMap = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96",
};

/**
 * Global pointer tracker to enable fixed background-attachment specular border shimmer
 * across all cards and glass surfaces on the website with 0 re-renders.
 */
export function GlobalSpotlight() {
  useEffect(() => {
    let rafId: number | null = null;
    const root = document.documentElement;

    // Initially offscreen so no element glows until the cursor moves
    root.style.setProperty("--x", "-5000");
    root.style.setProperty("--y", "-5000");

    const handlePointerMove = (e: PointerEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const x = e.clientX;
        const y = e.clientY;
        root.style.setProperty("--x", x.toFixed(1));
        root.style.setProperty("--y", y.toFixed(1));
        root.style.setProperty("--xp", (x / window.innerWidth).toFixed(3));
        root.style.setProperty("--yp", (y / window.innerHeight).toFixed(3));
      });
    };

    const handlePointerLeave = () => {
      if (rafId) cancelAnimationFrame(rafId);
      root.style.setProperty("--x", "-5000");
      root.style.setProperty("--y", "-5000");
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    window.addEventListener("blur", handlePointerLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return null;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = "",
  glowColor = "blue",
  size = "md",
  width,
  height,
  customSize = true,
  interactive = true,
  borderGlowColor,
  glowSize,
  onClick,
  style,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Both of these must be pulled out of `props` rather than spread onto the
  // div: React has no `borderGlowColor` DOM attribute and warns about it. They
  // reach the styling layer as custom properties the stylesheet already reads,
  // so the declared API does what its names say instead of being decorative.
  const { base, spread } = colorNameOrCodeToBase(borderGlowColor ?? glowColor);

  const getSizeClasses = () => {
    if (customSize) return "";
    return sizeMap[size];
  };

  const getInlineStyles = (): React.CSSProperties => {
    const baseStyles: Record<string, string | number> = {
      "--base": base,
      "--spread": spread,
      "--radius": 16,
      "--border": 1.5,
      "--spotlight-size": glowSize !== undefined ? `${glowSize}px` : "320px",
      "--hue": "calc(var(--base) + (var(--xp, 0.5) * var(--spread, 0)))",
      position: "relative",
    };

    if (width !== undefined) {
      baseStyles.width = typeof width === "number" ? `${width}px` : width;
    }
    if (height !== undefined) {
      baseStyles.height = typeof height === "number" ? `${height}px` : height;
    }

    return { ...baseStyles, ...style } as React.CSSProperties;
  };

  return (
    <div
      ref={cardRef}
      data-glow
      onClick={onClick}
      style={getInlineStyles()}
      className={cn(
        "glass-glow-card relative rounded-2xl p-3.5 backdrop-blur-xl transition-all duration-300",
        interactive && "cursor-pointer hover:scale-[1.008] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35),0_0_16px_rgba(56,189,248,0.12)] active:scale-[0.985]",
        getSizeClasses(),
        className
      )}
      {...props}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export const SpotlightCard = GlowCard;
