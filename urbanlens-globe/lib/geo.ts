import * as THREE from "three";

/**
 * Standard Three.js equirectangular mapping:
 *   x =  r · cos(lat) · cos(lon)
 *   y =  r · sin(lat)
 *   z = −r · cos(lat) · sin(lon)
 */
export function latLonToVec3(lat: number, lon: number, r = 1): THREE.Vector3 {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    r * Math.cos(la) * Math.cos(lo),
    r * Math.sin(la),
    -r * Math.cos(la) * Math.sin(lo)
  );
}

export const GUJARAT_CENTER = { lat: 22.6, lon: 71.6 };

export type City = {
  name: string;
  lat: number;
  lon: number;
  major?: boolean;
  /** label screen offset direction */
  dx: number;
  dy: number;
};

export const CITIES: City[] = [
  { name: "Ahmedabad",   lat: 23.0225, lon: 72.5714, major: true, dx: -1, dy: -1 },
  { name: "Gandhinagar", lat: 23.2156, lon: 72.6369,             dx:  1, dy: -1 },
  { name: "Surat",       lat: 21.1702, lon: 72.8311, major: true, dx:  1, dy:  1 },
  { name: "Vadodara",    lat: 22.3072, lon: 73.1812,             dx:  1, dy:  0 },
  { name: "Rajkot",      lat: 22.3039, lon: 70.8022,             dx: -1, dy:  0 },
];
