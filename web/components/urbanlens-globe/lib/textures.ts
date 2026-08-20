"use client";

import * as THREE from "three";
import { LAND_MASK_B64, LAND_MASK_H, LAND_MASK_W } from "../data/landMask";

export interface EarthTextures {
  day: THREE.Texture;
  night: THREE.Texture;
  clouds: THREE.Texture | null;
  /** white = ocean, used for the specular highlight */
  ocean: THREE.Texture;
  /** true when the real image files were found under `basePath` */
  usingAssets: boolean;
}

const FILES = {
  day: "earth_day.jpg",
  night: "earth_night.jpg",
  clouds: "clouds_alpha.jpg",
  ocean: "earth_specular.jpg",
};

function loadOne(url: string, loader: THREE.TextureLoader): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (t) => resolve(t),
      undefined,
      () => resolve(null)
    );
  });
}

/* ── procedural fallback ─────────────────────────────────────────────── */

function decodeMask(): Uint8Array {
  const bin = atob(LAND_MASK_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bits = new Uint8Array(LAND_MASK_W * LAND_MASK_H);
  for (let i = 0; i < bits.length; i++) bits[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return bits;
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * Synthesises day / night / ocean textures from the packed land mask, so the
 * globe is still a recognisable Earth when no image assets are installed.
 */
function buildFallback(): Omit<EarthTextures, "usingAssets"> {
  const W = LAND_MASK_W * 4;
  const H = LAND_MASK_H * 4;
  const mask = decodeMask();

  const rawAt = (mx: number, my: number) => {
    const x = ((mx % LAND_MASK_W) + LAND_MASK_W) % LAND_MASK_W;
    const y = Math.min(LAND_MASK_H - 1, Math.max(0, my));
    return mask[y * LAND_MASK_W + x];
  };

  /**
   * A 3×3 blur of the 1-bit mask. Softening first is what stops the warp below
   * from dragging single cells into hairline filaments across the ocean.
   */
  const soft = new Float32Array(LAND_MASK_W * LAND_MASK_H);
  for (let y = 0; y < LAND_MASK_H; y++) {
    for (let x = 0; x < LAND_MASK_W; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += rawAt(x + dx, y + dy) * (dx === 0 && dy === 0 ? 2 : 1);
        }
      }
      soft[y * LAND_MASK_W + x] = sum / 10;
    }
  }

  const maskAt = (mx: number, my: number) => {
    const x = ((mx % LAND_MASK_W) + LAND_MASK_W) % LAND_MASK_W;
    const y = Math.min(LAND_MASK_H - 1, Math.max(0, my));
    return soft[y * LAND_MASK_W + x];
  };

  /**
   * Bilinear sample of the 1-bit mask, warped by a little noise. Together these
   * turn a blocky raster into believable coastlines at render resolution.
   */
  const coast = (px: number, py: number) => {
    const warp = 0.55;
    const u = (px / W) * LAND_MASK_W + (smoothNoise(px / 7, py / 7) - 0.5) * warp;
    const v = (py / H) * LAND_MASK_H + (smoothNoise(px / 6 + 41, py / 6 + 17) - 0.5) * warp;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const a = maskAt(x0, y0);
    const b = maskAt(x0 + 1, y0);
    const c = maskAt(x0, y0 + 1);
    const d = maskAt(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };

  const at = (px: number, py: number) => (coast(px, py) > 0.5 ? 1 : 0);

  const day = document.createElement("canvas");
  day.width = W;
  day.height = H;
  const ocean = document.createElement("canvas");
  ocean.width = LAND_MASK_W;
  ocean.height = LAND_MASK_H;
  const night = document.createElement("canvas");
  night.width = W;
  night.height = H;

  const dctx = day.getContext("2d")!;
  const nctx = night.getContext("2d")!;
  const octx = ocean.getContext("2d")!;

  const dimg = dctx.createImageData(W, H);
  const nimg = nctx.createImageData(W, H);

  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    const polar = Math.max(0, (Math.abs(lat) - 62) / 28); // ice caps
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const landness = coast(x, y);
      const land = landness > 0.5;
      const n = smoothNoise(x / 26, y / 26) * 0.6 + smoothNoise(x / 9, y / 9) * 0.4;

      const arid = smoothNoise(x / 40 + 11, y / 40 + 7);
      const deep = 0.55 + n * 0.45;
      // shelf water brightens close to the shoreline, as it does from orbit
      const shelf = 1 - Math.min(1, Math.abs(landness - 0.5) * 4);
      const landR = 26 + n * 26 + arid * 34 + polar * 150;
      const landG = 38 + n * 30 + arid * 24 + polar * 155;
      const landB = 30 + n * 22 + arid * 12 + polar * 160;
      const seaR = 6 + deep * 10 + shelf * 10;
      const seaG = 20 + deep * 26 + shelf * 26;
      const seaB = 44 + deep * 44 + polar * 90 + shelf * 30;
      const k = Math.min(1, Math.max(0, (landness - 0.46) / 0.18));
      dimg.data[i] = seaR + (landR - seaR) * k;
      dimg.data[i + 1] = seaG + (landG - seaG) * k;
      dimg.data[i + 2] = seaB + (landB - seaB) * k;
      dimg.data[i + 3] = 255;

      // night side: a faint continental silhouette, lights added below
      const base = land ? 16 : 3;
      nimg.data[i] = base;
      nimg.data[i + 1] = base + 4;
      nimg.data[i + 2] = base + 10;
      nimg.data[i + 3] = 255;
    }
  }

  dctx.putImageData(dimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);

  // ocean mask (white where there is water)
  const oimg = octx.createImageData(LAND_MASK_W, LAND_MASK_H);
  for (let y = 0; y < LAND_MASK_H; y++) {
    for (let x = 0; x < LAND_MASK_W; x++) {
      const i = y * LAND_MASK_W + x;
      const v = Math.round(
        (1 - coast((x / LAND_MASK_W) * W, (y / LAND_MASK_H) * H)) * 255
      );
      oimg.data[i * 4] = v;
      oimg.data[i * 4 + 1] = v;
      oimg.data[i * 4 + 2] = v;
      oimg.data[i * 4 + 3] = 255;
    }
  }
  octx.putImageData(oimg, 0, 0);

  // a restrained scatter of night-side settlement glow on land only
  nctx.globalCompositeOperation = "lighter";
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W;
    const y = H * 0.12 + rnd() * H * 0.72;
    if (!at(x, y)) continue;
    const r = 2 + rnd() * 7;
    const a = 0.1 + rnd() * 0.4;
    const g = nctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,206,148,${a})`);
    g.addColorStop(1, "rgba(255,170,90,0)");
    nctx.fillStyle = g;
    nctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  nctx.globalCompositeOperation = "source-over";

  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  };

  return {
    day: mk(day, true),
    night: mk(night, true),
    ocean: mk(ocean, false),
    clouds: null,
  };
}

/**
 * Loads the optional NASA-style textures from `basePath`, falling back to the
 * synthesised Earth for any file that is missing. Never rejects.
 */
export async function loadEarthTextures(
  basePath: string,
  maxAnisotropy = 4
): Promise<EarthTextures> {
  const loader = new THREE.TextureLoader();
  const base = basePath.replace(/\/$/, "");

  const [day, night, clouds, ocean] = await Promise.all([
    loadOne(`${base}/${FILES.day}`, loader),
    loadOne(`${base}/${FILES.night}`, loader),
    loadOne(`${base}/${FILES.clouds}`, loader),
    loadOne(`${base}/${FILES.ocean}`, loader),
  ]);

  // build the synthesised Earth once, and only if something is actually missing
  let fallback: Omit<EarthTextures, "usingAssets"> | null = null;
  const getFallback = () => (fallback ??= buildFallback());

  const tune = (t: THREE.Texture | null, srgb: boolean) => {
    if (!t) return null;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAnisotropy;
    t.wrapS = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  };

  return {
    day: tune(day, true) ?? getFallback().day,
    night: tune(night, true) ?? getFallback().night,
    clouds: tune(clouds, true),
    ocean: tune(ocean, false) ?? getFallback().ocean,
    usingAssets: Boolean(day),
  };
}

export function disposeTextures(t: EarthTextures | null) {
  if (!t) return;
  t.day.dispose();
  t.night.dispose();
  t.ocean.dispose();
  t.clouds?.dispose();
}
