"use client";

import * as React from "react";
import {
  type HTMLMotionProps,
  motion,
  type SpringOptions,
  type Transition,
  useMotionValue,
  useSpring,
} from "motion/react";

import { cn } from "@/lib/utils";

type StarLayerProps = HTMLMotionProps<"div"> & {
  count: number;
  size: number;
  transition: Transition;
  starColor?: string;
  driftX?: number;
};

const STAR_PALETTE = [
  "#d7ecff", // cold starlight (UrbanLens cold)
  "#82bfff", // atmospheric cyan/blue
  "#16d9f5", // vibrant cyan
  "#ffffff", // pure white star
  "rgba(215, 236, 255, 0.85)",
];

/**
 * The star field is baked into a tileable image once, not into `box-shadow`.
 *
 * The previous implementation gave one 1px div a box-shadow list holding every
 * star — 850, 360 and 160 across the three layers, each list applied to two
 * divs, so ~2,700 shadows in total. Shadows are painted, not composited, and
 * these particular elements are animated forever (`y: [0, -2000]`,
 * `repeat: Infinity`) inside a wrapper whose opacity also animates forever.
 * That is a full repaint of thousands of shadows every frame, for the whole
 * life of the landing page, underneath a WebGL globe and a MapLibre canvas.
 *
 * A repeating background image animated by transform stays on the compositor:
 * same star field, no per-frame paint.
 */
const TILE = 1000; // divides the 2000px layer height, so the wrap seam is exact

function useStarTile(count: number, size: number, fallbackColor: string) {
  const [url, setUrl] = React.useState<string>("");

  React.useEffect(() => {
    // Preserve the original density: `count` stars scattered over 4000×4000.
    const n = Math.max(1, Math.round((count * TILE * TILE) / (4000 * 4000)));
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    for (let i = 0; i < n; i++) {
      ctx.fillStyle =
        Math.random() > 0.35
          ? STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)]
          : fallbackColor;
      ctx.fillRect(Math.random() * TILE, Math.random() * TILE, size, size);
    }
    setUrl(canvas.toDataURL("image/png"));
  }, [count, size, fallbackColor]);

  return url;
}

function StarLayer({
  count = 900,
  size = 1,
  transition = { repeat: Infinity, duration: 16, ease: "linear" },
  starColor = "#d7ecff",
  driftX = -80,
  className,
  ...props
}: StarLayerProps) {
  const tile = useStarTile(count, size, starColor);
  const fill: React.CSSProperties = {
    backgroundImage: tile ? `url(${tile})` : undefined,
    backgroundRepeat: "repeat",
    backgroundSize: `${TILE}px ${TILE}px`,
  };

  return (
    <motion.div
      data-slot="star-layer"
      animate={{
        y: [0, -2000],
        x: [0, driftX],
      }}
      transition={transition}
      className={cn("absolute top-0 left-0 w-full h-[2000px]", className)}
      {...props}
    >
      <div className="absolute top-0 left-0 h-[2000px] w-full" style={fill} />
      <div className="absolute top-[2000px] left-0 h-[2000px] w-full" style={fill} />
    </motion.div>
  );
}

type StarsBackgroundProps = React.ComponentProps<"div"> & {
  factor?: number;
  speed?: number;
  transition?: SpringOptions;
  starColor?: string;
};

export function StarsBackground({
  children,
  className,
  factor = 0.08,
  speed = 18,
  transition = { stiffness: 65, damping: 18 },
  starColor = "#d7ecff",
  ...props
}: StarsBackgroundProps) {
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);

  const springX = useSpring(offsetX, transition);
  const springY = useSpring(offsetY, transition);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent> | MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const newOffsetX = -(e.clientX - centerX) * factor;
      const newOffsetY = -(e.clientY - centerY) * factor;
      offsetX.set(newOffsetX);
      offsetY.set(newOffsetY);
    },
    [offsetX, offsetY, factor],
  );

  React.useEffect(() => {
    const onWindowMove = (e: MouseEvent) => {
      handleMouseMove(e);
    };
    window.addEventListener("mousemove", onWindowMove, { passive: true });
    return () => window.removeEventListener("mousemove", onWindowMove);
  }, [handleMouseMove]);

  return (
    <div
      data-slot="stars-background"
      className={cn(
        "relative size-full overflow-hidden bg-[radial-gradient(ellipse_at_center,_#071124_0%,_#030712_45%,_#000206_100%)]",
        className,
      )}
      onMouseMove={handleMouseMove}
      {...props}
    >
      <motion.div
        animate={{
          opacity: [0.85, 1, 0.78, 0.95, 0.85],
        }}
        transition={{
          repeat: Infinity,
          duration: 6,
          ease: "easeInOut",
        }}
        style={{ x: springX, y: springY }}
      >
        {/* Fast micro starlight layer */}
        <StarLayer
          count={850}
          size={1}
          driftX={-70}
          transition={{ repeat: Infinity, duration: speed, ease: "linear" }}
          starColor={starColor}
        />
        {/* Mid-speed bright starlight layer */}
        <StarLayer
          count={360}
          size={1.8}
          driftX={-110}
          transition={{
            repeat: Infinity,
            duration: speed * 1.5,
            ease: "linear",
          }}
          starColor={starColor}
        />
        {/* Foreground dynamic celestial nodes */}
        <StarLayer
          count={160}
          size={2.6}
          driftX={-150}
          transition={{
            repeat: Infinity,
            duration: speed * 2.2,
            ease: "linear",
          }}
          starColor={starColor}
        />
      </motion.div>

      {children}
    </div>
  );
}

export default StarsBackground;
