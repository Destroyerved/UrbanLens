/**
 * Earth textures, generated in the browser.
 *
 * No proprietary or licensed imagery is used. Coastlines are drawn from Natural
 * Earth land polygons (public domain, shipped as TopoJSON in `world-atlas`),
 * and everything else — ocean depth, terrain shading, night-side city glow — is
 * synthesised on a canvas. That keeps the page light and the assets original.
 */

import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";

export interface EarthCanvases {
  day: HTMLCanvasElement;
  night: HTMLCanvasElement;
  mask: HTMLCanvasElement;
}

/** Major world cities used only for night-side glow. Public knowledge. */
const CITY_LIGHTS: [number, number, number][] = [
  // [lng, lat, weight]
  [72.57, 23.03, 1.0], [72.87, 19.08, 0.95], [77.21, 28.61, 1.0], [77.59, 12.97, 0.85],
  [80.27, 13.08, 0.8], [88.36, 22.57, 0.85], [78.47, 17.38, 0.8], [73.86, 18.52, 0.7],
  [75.79, 26.91, 0.6], [72.63, 23.22, 0.5], [70.8, 22.3, 0.45], [75.86, 22.72, 0.5],
  [67.0, 24.86, 0.7], [74.35, 31.55, 0.6], [90.41, 23.81, 0.75], [79.86, 6.93, 0.45],
  [55.27, 25.2, 0.7], [51.39, 35.69, 0.65], [46.71, 24.71, 0.6], [39.28, 21.49, 0.45],
  [31.24, 30.04, 0.7], [28.03, -26.2, 0.55], [18.42, -33.92, 0.45], [3.38, 6.52, 0.6],
  [36.82, -1.29, 0.45], [32.58, 15.5, 0.35], [-0.13, 51.51, 0.9], [2.35, 48.86, 0.85],
  [13.4, 52.52, 0.8], [12.5, 41.9, 0.7], [4.9, 52.37, 0.6], [-3.7, 40.42, 0.7],
  [37.62, 55.76, 0.8], [30.52, 50.45, 0.5], [23.73, 37.98, 0.45], [28.98, 41.01, 0.7],
  [18.06, 59.33, 0.45], [24.94, 60.17, 0.4], [-9.14, 38.72, 0.45], [16.37, 48.21, 0.5],
  [116.4, 39.9, 1.0], [121.47, 31.23, 1.0], [113.26, 23.13, 0.9], [114.06, 22.54, 0.85],
  [139.69, 35.69, 1.0], [135.5, 34.69, 0.8], [126.98, 37.57, 0.9], [121.56, 25.03, 0.7],
  [103.82, 1.35, 0.75], [100.5, 13.76, 0.7], [106.85, -6.21, 0.8], [120.98, 14.6, 0.7],
  [101.69, 3.14, 0.6], [105.85, 21.03, 0.55], [106.66, 10.76, 0.6], [96.16, 16.87, 0.4],
  [174.76, -36.85, 0.4], [151.21, -33.87, 0.7], [144.96, -37.81, 0.65], [115.86, -31.95, 0.4],
  [-74.01, 40.71, 1.0], [-87.63, 41.88, 0.8], [-118.24, 34.05, 0.9], [-122.42, 37.77, 0.7],
  [-95.37, 29.76, 0.7], [-96.8, 32.78, 0.7], [-80.19, 25.76, 0.65], [-75.17, 39.95, 0.65],
  [-79.38, 43.65, 0.7], [-73.57, 45.5, 0.6], [-123.12, 49.28, 0.5], [-114.07, 51.05, 0.4],
  [-99.13, 19.43, 0.85], [-103.35, 20.66, 0.5], [-74.07, 4.71, 0.65], [-77.04, -12.05, 0.6],
  [-70.65, -33.46, 0.6], [-58.38, -34.6, 0.75], [-43.17, -22.91, 0.75], [-46.63, -23.55, 0.85],
  [-47.88, -15.79, 0.5], [-38.5, -12.97, 0.4], [-66.9, 10.5, 0.45], [-84.09, 9.93, 0.3],
];

const W = 2048;
const H = 1024;

function proj(lng: number, lat: number): [number, number] {
  return [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];
}

function drawLand(
  ctx: CanvasRenderingContext2D,
  land: Feature<Geometry> | FeatureCollection<Geometry>
) {
  const geoms: Geometry[] = [];
  if ("features" in land) land.features.forEach((f) => geoms.push(f.geometry));
  else geoms.push(land.geometry);

  ctx.beginPath();
  for (const g of geoms) {
    const polys: Polygon["coordinates"][] =
      g.type === "MultiPolygon"
        ? (g as MultiPolygon).coordinates
        : g.type === "Polygon"
          ? [(g as Polygon).coordinates]
          : [];
    for (const poly of polys) {
      for (const ring of poly) {
        ring.forEach(([lng, lat], i) => {
          const [x, y] = proj(lng, lat);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    }
  }
}

/** cheap value noise, used for terrain mottling */
function noiseCanvas(w: number, h: number, cell: number, alpha: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  let seed = 20260817;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const v = rnd();
      ctx.fillStyle = `rgba(255,255,255,${(v * alpha).toFixed(3)})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  // two blur passes so the lattice never reads as visible squares
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const o = out.getContext("2d")!;
  o.filter = "blur(6px)";
  o.drawImage(c, 0, 0);
  o.filter = "blur(3px)";
  o.globalAlpha = 0.7;
  o.drawImage(out, 0, 0);
  return out;
}

export async function buildEarthCanvases(
  topoUrl = "/geo/land-50m.json"
): Promise<EarthCanvases> {
  const res = await fetch(topoUrl);
  const topo = (await res.json()) as Topology;
  const key = Object.keys(topo.objects)[0];
  const land = feature(topo, topo.objects[key]) as unknown as
    | Feature<Geometry>
    | FeatureCollection<Geometry>;

  /* ── day ────────────────────────────────────────────────────── */
  const day = document.createElement("canvas");
  day.width = W;
  day.height = H;
  const d = day.getContext("2d")!;

  // ocean — deep navy with a subtle equatorial lift
  const og = d.createLinearGradient(0, 0, 0, H);
  og.addColorStop(0, "#05121f");
  og.addColorStop(0.28, "#081628");
  og.addColorStop(0.5, "#0a1d33");
  og.addColorStop(0.72, "#08182b");
  og.addColorStop(1, "#05121f");
  d.fillStyle = og;
  d.fillRect(0, 0, W, H);

  // land
  d.save();
  drawLand(d, land);
  d.fillStyle = "#16232f";
  d.fill("evenodd");
  d.clip("evenodd");
  // terrain mottling inside land only
  d.globalAlpha = 0.34;
  d.drawImage(noiseCanvas(768, 384, 3, 0.42), 0, 0, W, H);
  d.globalAlpha = 0.3;
  d.fillStyle = "#27454f";
  d.fillRect(0, 0, W, H);
  d.restore();

  // coastline rim
  d.save();
  drawLand(d, land);
  d.strokeStyle = "rgba(130,191,255,0.34)";
  d.lineWidth = 1.1;
  d.stroke();
  d.restore();

  /* ── mask (land = white) ────────────────────────────────────── */
  const mask = document.createElement("canvas");
  mask.width = 1024;
  mask.height = 512;
  const m = mask.getContext("2d")!;
  m.fillStyle = "#000";
  m.fillRect(0, 0, 1024, 512);
  m.save();
  m.scale(1024 / W, 512 / H);
  drawLand(m, land);
  m.fillStyle = "#fff";
  m.fill("evenodd");
  m.restore();

  /* ── night ──────────────────────────────────────────────────── */
  const night = document.createElement("canvas");
  night.width = W;
  night.height = H;
  const n = night.getContext("2d")!;
  n.fillStyle = "#01060e";
  n.fillRect(0, 0, W, H);

  // faint land silhouette so continents stay readable on the dark side
  n.save();
  drawLand(n, land);
  n.fillStyle = "rgba(18,34,52,0.85)";
  n.fill("evenodd");
  n.restore();

  n.globalCompositeOperation = "lighter";
  for (const [lng, lat, wgt] of CITY_LIGHTS) {
    const [x, y] = proj(lng, lat);
    const r = 6 + wgt * 26;
    const g = n.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,214,150,${0.75 * wgt})`);
    g.addColorStop(0.35, `rgba(255,178,96,${0.28 * wgt})`);
    g.addColorStop(1, "rgba(255,150,60,0)");
    n.fillStyle = g;
    n.beginPath();
    n.arc(x, y, r, 0, Math.PI * 2);
    n.fill();
    // bright core
    n.fillStyle = `rgba(255,236,200,${0.9 * wgt})`;
    n.beginPath();
    n.arc(x, y, 1.1 + wgt * 1.6, 0, Math.PI * 2);
    n.fill();
  }
  n.globalCompositeOperation = "source-over";

  return { day, night, mask };
}
