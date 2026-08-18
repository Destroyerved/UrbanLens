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

function generateStars(count: number, fallbackColor = "#d7ecff") {
  const shadows: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 4000) - 2000;
    const y = Math.floor(Math.random() * 4000) - 2000;
    const color =
      Math.random() > 0.35
        ? STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)]
        : fallbackColor;
    shadows.push(`${x}px ${y}px ${color}`);
  }
  return shadows.join(", ");
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
  const [boxShadow, setBoxShadow] = React.useState<string>("");

  React.useEffect(() => {
    setBoxShadow(generateStars(count, starColor));
  }, [count, starColor]);

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
      <div
        className="absolute bg-transparent rounded-full"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          boxShadow: boxShadow,
        }}
      />
      <div
        className="absolute bg-transparent rounded-full top-[2000px]"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          boxShadow: boxShadow,
        }}
      />
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
