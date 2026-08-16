"use client";

import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { Sparkles } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LiquidMetalButtonProps {
  label?: string;
  onClick?: () => void;
  viewMode?: "text" | "icon";
  active?: boolean;
  className?: string;
}

export function LiquidMetalButton({
  label = "Copilot",
  onClick,
  viewMode = "text",
  active = false,
  className,
}: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<any>(null);
  const rippleId = useRef(0);

  const dimensions = useMemo(() => {
    if (viewMode === "icon") {
      return { width: 36, height: 34 };
    }
    return { width: 104, height: 34 };
  }, [viewMode]);

  useEffect(() => {
    const styleId = "shader-canvas-style-liquid-metal";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .shader-container-liquid canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 9999px !important;
          pointer-events: none !important;
        }
        @keyframes liquid-ripple-animation {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0.7;
          }
          100% {
            transform: translate(-50%, -50%) scale(3.5);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const loadShader = async () => {
      try {
        if (shaderRef.current) {
          if (shaderMount.current?.dispose) {
            shaderMount.current.dispose();
          } else if (shaderMount.current?.destroy) {
            shaderMount.current.destroy();
          }

          shaderMount.current = new ShaderMount(
            shaderRef.current,
            liquidMetalFragmentShader,
            {
              u_repetition: 4,
              u_softness: 0.55,
              u_shiftRed: 0.2,
              u_shiftBlue: 0.4,
              u_distortion: 0.1,
              u_contour: 0,
              u_angle: 45,
              u_scale: 8,
              u_shape: 1,
              u_offsetX: 0.1,
              u_offsetY: -0.1,
            },
            undefined,
            0.6
          );
        }
      } catch (error) {
        console.error("Failed to load liquid metal shader:", error);
      }
    };

    loadShader();

    return () => {
      if (shaderMount.current?.dispose) {
        shaderMount.current.dispose();
        shaderMount.current = null;
      } else if (shaderMount.current?.destroy) {
        shaderMount.current.destroy();
        shaderMount.current = null;
      }
    };
  }, []);

  const handleMouseEnter = () => {
    setIsHovered(true);
    shaderMount.current?.setSpeed?.(1.1);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
    shaderMount.current?.setSpeed?.(0.6);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (shaderMount.current?.setSpeed) {
      shaderMount.current.setSpeed(2.4);
      setTimeout(() => {
        if (isHovered) {
          shaderMount.current?.setSpeed?.(1.1);
        } else {
          shaderMount.current?.setSpeed?.(0.6);
        }
      }, 350);
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ripple = { x, y, id: rippleId.current++ };

    setRipples((prev) => [...prev, ripple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
    }, 600);

    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
      className={cn(
        "group relative inline-flex items-center justify-center rounded-full p-0 transition-all duration-200 outline-none select-none cursor-pointer overflow-hidden border",
        active
          ? "border-accent/80 shadow-[0_0_18px_rgba(56,189,248,0.5),0_2px_8px_rgba(0,0,0,0.4)] scale-[1.02]"
          : isHovered
            ? "border-accent/50 shadow-[0_0_14px_rgba(56,189,248,0.35),0_4px_10px_rgba(0,0,0,0.3)] scale-[1.02]"
            : "border-white/20 dark:border-white/10 shadow-[0_2px_6px_rgba(0,0,0,0.25)]",
        isPressed && "scale-95",
        className
      )}
      aria-label={label}
    >
      {/* WebGL Liquid Metal Shader Layer */}
      <div
        ref={shaderRef}
        className="shader-container-liquid pointer-events-none absolute inset-0 rounded-full overflow-hidden"
      />

      {/* Inner Dark Rim / Glass Tint Overlay */}
      <div
        className={cn(
          "pointer-events-none absolute inset-[2px] rounded-full transition-all duration-300",
          active
            ? "bg-gradient-to-b from-cyan-600/70 to-sky-700/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
            : "bg-gradient-to-b from-[#141c2d]/80 to-[#0a0f1a]/92 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
        )}
      />

      {/* Ripple Effects */}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          style={{
            position: "absolute",
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(56, 189, 248, 0.6) 0%, rgba(56, 189, 248, 0) 75%)",
            pointerEvents: "none",
            animation: "liquid-ripple-animation 0.6s ease-out",
          }}
        />
      ))}

      {/* Label + Icon Content Layer */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 px-2 pointer-events-none">
        <Sparkles
          size={13}
          className={cn(
            "transition-all shrink-0",
            active
              ? "text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.9)]"
              : isHovered
                ? "text-cyan-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.7)]"
                : "text-cyan-400/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          )}
        />
        {viewMode === "text" && (
          <span
            className={cn(
              "text-[12px] font-bold tracking-tight whitespace-nowrap transition-colors duration-200",
              active
                ? "text-white drop-shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                : isHovered
                  ? "text-white"
                  : "text-slate-100"
            )}
          >
            {label}
          </span>
        )}
      </div>
    </button>
  );
}
