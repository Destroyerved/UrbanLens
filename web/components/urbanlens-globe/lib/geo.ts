import * as THREE from "three";

const DEG = Math.PI / 180;

/**
 * Longitude/latitude → a point on a unit sphere, using the convention that
 * matches three.js SphereGeometry UVs (so equirectangular Earth textures line
 * up with these coordinates without any offset hacks).
 */
export function latLngToVec3(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Rotation (x, y) that brings a lng/lat to face the camera at +Z. */
export function faceRotation(lat: number, lng: number): { x: number; y: number } {
  const p = latLngToVec3(lat, lng, 1);
  const y = -Math.atan2(p.x, p.z);
  const rotated = p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), y);
  const x = Math.atan2(rotated.y, rotated.z);
  return { x, y };
}

/** Great-circle arc between two lng/lat points, lifted off the surface. */
export function arcPoints(
  a: [number, number],
  b: [number, number],
  segments = 48,
  lift = 0.06
): THREE.Vector3[] {
  const from = latLngToVec3(a[1], a[0], 1);
  const to = latLngToVec3(b[1], b[0], 1);
  const angle = from.angleTo(to);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = from.clone().lerp(to, t).normalize();
    // a gentle parabolic lift, scaled by how far apart the two nodes are
    const h = 1 + Math.sin(t * Math.PI) * lift * (0.4 + angle);
    out.push(point.multiplyScalar(h));
  }
  return out;
}

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/** Shortest signed angular difference, so the globe never spins the long way. */
export function shortestAngle(from: number, to: number) {
  const diff = (to - from) % (Math.PI * 2);
  return ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/**
 * Builds a flat ribbon that hugs the sphere along a lng/lat path.
 *
 * Used instead of a fat-line implementation so the boundary has real,
 * predictable thickness in world units on every GPU, with no dependency on
 * line-width support or renderer resolution.
 */
export function sphereRibbon(
  path: [number, number][],
  widthRadians: number,
  radius = 1.004
): THREE.BufferGeometry {
  const pts = path.map(([lng, lat]) => latLngToVec3(lat, lng, radius));
  const positions: number[] = [];
  const indices: number[] = [];
  const half = widthRadians / 2;

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const p = pts[i];

    const tangent = next.clone().sub(prev).normalize();
    const outward = p.clone().normalize();
    const side = new THREE.Vector3().crossVectors(outward, tangent).normalize();

    const a = p.clone().addScaledVector(side, half);
    const b = p.clone().addScaledVector(side, -half);
    // keep both edges on the sphere so the ribbon never floats at the limb
    a.setLength(radius);
    b.setLength(radius);

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);

    if (i < pts.length - 1) {
      const o = i * 2;
      indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
