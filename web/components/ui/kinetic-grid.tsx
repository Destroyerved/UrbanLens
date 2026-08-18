"use client";

import { useEffect, useRef, useCallback, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { earthFor, stage, stageOpacity } from "@/lib/landing/timeline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  born: number;
}

interface ExcludeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_SIZE = 55;
const INFLUENCE_RADIUS = 240;
const MAX_WARP = 22;
const LERP_SPEED = 0.085;

const NODE_BASE_RADIUS = 1.2;
const NODE_ACTIVE_RADIUS = 2.8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(
  base: { r: number; g: number; b: number; a: number },
  active: { r: number; g: number; b: number; a: number },
  t: number,
): string {
  const r = Math.round(lerpN(base.r, active.r, t));
  const g = Math.round(lerpN(base.g, active.g, t));
  const b = Math.round(lerpN(base.b, active.b, t));
  const a = lerpN(base.a, active.a, t);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KineticGrid({
  children,
  className,
  globalColor = "cyan",
  transparent = true,
}: {
  children?: ReactNode;
  className?: string;
  globalColor?: "default" | "monochrome" | "cyan";
  transparent?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mouseRef = useRef<Point>({ x: -9999, y: -9999 });
  const targetMouseRef = useRef<Point>({ x: -9999, y: -9999 });
  const ripplesRef = useRef<Ripple[]>([]);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const excludeRectsRef = useRef<ExcludeRect[]>([]);

  // ── Measure content & text bounding boxes to exclude ─────────────────────────

  const updateExclusions = useCallback(() => {
    if (typeof window === "undefined") return;
    const elements = document.querySelectorAll<HTMLElement>(
      "header, nav, h1, h2, h3, p, a, button, [data-scene] h1, [data-scene] p, .ulc-drift, .ulc-nav, .ulc-metric, .ulc-display, .ulc-copy, .ulc-tech, footer"
    );

    const rects: ExcludeRect[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;

    elements.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > -20 &&
        r.top < H + 20 &&
        r.right > -20 &&
        r.left < W + 20
      ) {
        rects.push({
          left: r.left - 24,
          top: r.top - 18,
          right: r.right + 24,
          bottom: r.bottom + 18,
        });
      }
    });

    excludeRectsRef.current = rects;
  }, []);

  // ── Check if a point is in a blank/empty space ──────────────────────────────

  const getBlankFactor = useCallback((x: number, y: number): number => {
    const rects = excludeRectsRef.current;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return 0;
      }
    }

    // Check Earth globe exclusion when Earth stage is visible
    if (stageOpacity(stage.T).earth > 0.08) {
      const { w: W, h: H } = sizeRef.current;
      const k = earthFor(stage.T);
      const globeX = W / 2 + k.x * W * 0.28;
      const globeY = H / 2 - k.y * H * 0.24;
      const globeRadius = Math.min(W, H) * (0.88 / k.dist) + 30;

      const dx = x - globeX;
      const dy = y - globeY;
      if (dx * dx + dy * dy < globeRadius * globeRadius) {
        return 0;
      }
    }

    return 1;
  }, []);

  // ── Warp ────────────────────────────────────────────────────────────────────

  const getWarpedPoint = useCallback(
    (
      gx: number,
      gy: number,
      col: number,
      row: number,
      mouse: Point,
      ripples: Ripple[],
      cols: number,
      rows: number,
    ): { pt: Point; proximity: number; blank: number } => {
      const blank = getBlankFactor(gx, gy);
      if (blank <= 0) {
        return { pt: { x: gx, y: gy }, proximity: 0, blank: 0 };
      }

      // Edge pin — smoothly locks boundary rows/cols in place
      const edgeMargin = 1.5;
      const colPin = Math.min(col / edgeMargin, (cols - 1 - col) / edgeMargin, 1);
      const rowPin = Math.min(row / edgeMargin, (rows - 1 - row) / edgeMargin, 1);
      const pinFactor = colPin * colPin * rowPin * rowPin * blank;

      const dx = gx - mouse.x;
      const dy = gy - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const proximity = Math.max(0, 1 - dist / INFLUENCE_RADIUS) * pinFactor;

      // Ripple displacement
      let rx = 0;
      let ry = 0;
      for (const r of ripples) {
        const rdx = gx - r.x;
        const rdy = gy - r.y;
        const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
        const waveWidth = 55;
        const diff = rdist - r.radius;
        if (Math.abs(diff) < waveWidth) {
          const strength = (1 - Math.abs(diff) / waveWidth) * r.opacity * 18 * pinFactor;
          const angle = Math.atan2(rdy, rdx);
          const sign = diff < 0 ? -1 : 1;
          rx += Math.cos(angle) * strength * sign * -1;
          ry += Math.sin(angle) * strength * sign * -1;
        }
      }

      // Cursor warp with bell falloff
      if (dist < INFLUENCE_RADIUS && dist > 0 && pinFactor > 0) {
        const t = dist / INFLUENCE_RADIUS;
        const eased = t < 0.01 ? 0 : (1 - t) * (1 - t) * Math.min(1, dist / 60);
        const warpAmt = eased * MAX_WARP * pinFactor;
        const angle = Math.atan2(dy, dx);
        return {
          pt: {
            x: gx - Math.cos(angle) * warpAmt + rx,
            y: gy - Math.sin(angle) * warpAmt + ry,
          },
          proximity,
          blank,
        };
      }

      return { pt: { x: gx + rx, y: gy + ry }, proximity, blank };
    },
    [getBlankFactor],
  );

  // ── Draw ────────────────────────────────────────────────────────────────────

  const draw = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { w: W, h: H } = sizeRef.current;
      const mouse = mouseRef.current;
      const ripples = ripplesRef.current;

      const theme = {
        default: {
          lineActive: { r: 22, g: 217, b: 245, a: 0.75 },
          nodeActive: { r: 22, g: 217, b: 245, a: 0.95 },
          glow: "22,217,245",
          ripple: "34,211,238",
        },
        cyan: {
          lineActive: { r: 22, g: 217, b: 245, a: 0.75 },
          nodeActive: { r: 22, g: 217, b: 245, a: 0.95 },
          glow: "22,217,245",
          ripple: "34,211,238",
        },
        monochrome: {
          lineActive: { r: 255, g: 255, b: 255, a: 0.8 },
          nodeActive: { r: 255, g: 255, b: 255, a: 0.95 },
          glow: "255,255,255",
          ripple: "255,255,255",
        },
      }[globalColor ?? "cyan"];

      ctx.clearRect(0, 0, W, H);

      // Update ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = (now - r.born) / 1000;
        r.radius = Math.max(0, age * 380);
        r.opacity = Math.max(0, 1 - age * 1.3);
        if (r.opacity <= 0) ripples.splice(i, 1);
      }

      // ── Build warped grid ─────────────────────────────────────────────────
      const cols = Math.max(2, Math.ceil(W / CELL_SIZE)) + 1;
      const rows = Math.max(2, Math.ceil(H / CELL_SIZE)) + 1;
      const cellW = W / (cols - 1);
      const cellH = H / (rows - 1);

      const pts: Point[][] = [];
      const prox: number[][] = [];
      const blanks: number[][] = [];

      for (let row = 0; row < rows; row++) {
        pts[row] = [];
        prox[row] = [];
        blanks[row] = [];
        for (let col = 0; col < cols; col++) {
          const { pt, proximity, blank } = getWarpedPoint(
            col * cellW,
            row * cellH,
            col,
            row,
            mouse,
            ripples,
            cols,
            rows,
          );
          pts[row][col] = pt;
          prox[row][col] = proximity;
          blanks[row][col] = blank;
        }
      }

      // ── Grid lines (invisible when idle, only visible when interacting) ────
      const drawSeg = (
        p1: Point,
        p2: Point,
        pr1: number,
        pr2: number,
        b1: number,
        b2: number,
      ) => {
        if (b1 <= 0 || b2 <= 0) return;
        const avg = (pr1 + pr2) / 2;
        if (avg < 0.04) return; // Keep grid invisible when no interaction

        const t = avg * avg * (3 - 2 * avg);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(${theme.lineActive.r},${theme.lineActive.g},${theme.lineActive.b},${(t * theme.lineActive.a).toFixed(3)})`;
        ctx.lineWidth = lerpN(0.6, 1.3, t);
        ctx.stroke();
      };

      ctx.lineCap = "butt";

      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols - 1; col++)
          drawSeg(
            pts[row][col],
            pts[row][col + 1],
            prox[row][col],
            prox[row][col + 1],
            blanks[row][col],
            blanks[row][col + 1],
          );

      for (let col = 0; col < cols; col++)
        for (let row = 0; row < rows - 1; row++)
          drawSeg(
            pts[row][col],
            pts[row + 1][col],
            prox[row][col],
            prox[row + 1][col],
            blanks[row][col],
            blanks[row + 1][col],
          );

      // ── Intersection nodes (only appear when active in blank space) ───────
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (blanks[row][col] <= 0) continue;
          const p = pts[row][col];
          const pr = prox[row][col];
          if (pr < 0.06) continue; // Invisible when not near cursor

          const t = pr * pr * (3 - 2 * pr);
          const r = lerpN(NODE_BASE_RADIUS, NODE_ACTIVE_RADIUS, t);

          // Outer glow ring for active nodes
          if (t > 0.28) {
            const glowR = r + lerpN(0, 5, (t - 0.28) / 0.72);
            const grd = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, glowR);
            grd.addColorStop(0, `rgba(${theme.glow},${(t * 0.26).toFixed(3)})`);
            grd.addColorStop(1, `rgba(${theme.glow},0)`);
            ctx.beginPath();
            ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();
          }

          // Node fill
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${theme.nodeActive.r},${theme.nodeActive.g},${theme.nodeActive.b},${(t * theme.nodeActive.a).toFixed(3)})`;
          ctx.fill();
        }
      }

      // ── Ripple rings in blank space ──────────────────────────────────────
      for (const r of ripples) {
        if (getBlankFactor(r.x, r.y) <= 0) continue;
        const safeRadius = Math.max(0, r.radius);
        ctx.beginPath();
        ctx.arc(r.x, r.y, safeRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${theme.ripple},${(r.opacity * 0.24).toFixed(3)})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    },
    [getWarpedPoint, getBlankFactor, globalColor],
  );

  // ── Animation loop ──────────────────────────────────────────────────────────

  const animate = useCallback(
    (now: number) => {
      const m = mouseRef.current;
      const t = targetMouseRef.current;

      m.x = lerpN(m.x, t.x, LERP_SPEED);
      m.y = lerpN(m.y, t.y, LERP_SPEED);

      draw(now);
      rafRef.current = requestAnimationFrame(animate);
    },
    [draw],
  );

  // ── Setup ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      sizeRef.current = { w, h };
      updateExclusions();
      if (mouseRef.current.x === -9999) {
        mouseRef.current = { x: -9999, y: -9999 };
        targetMouseRef.current = { x: -9999, y: -9999 };
      }
    };

    setSize();
    window.addEventListener("resize", setSize);
    window.addEventListener("scroll", updateExclusions, { passive: true });

    const interval = window.setInterval(updateExclusions, 600);

    const onMouseMove = (e: MouseEvent) => {
      targetMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onClick = (e: MouseEvent) => {
      if (getBlankFactor(e.clientX, e.clientY) > 0) {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: 0,
          opacity: 1,
          born: performance.now(),
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", setSize);
      window.removeEventListener("scroll", updateExclusions);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate, updateExclusions, getBlankFactor]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "relative w-full min-h-screen overflow-hidden",
        transparent ? "bg-transparent" : "bg-[#02040A]",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full z-0 pointer-events-none"
      />

      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
}
