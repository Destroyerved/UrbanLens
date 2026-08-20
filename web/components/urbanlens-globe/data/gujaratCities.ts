/**
 * Major Gujarat urban nodes.
 *
 * Real WGS84 coordinates (degrees). Keep this list short — the globe is meant
 * to read as an intelligence surface, not a crowded atlas.
 */

export interface GlobeCity {
  id: string;
  name: string;
  /** [longitude, latitude] */
  coord: [number, number];
  /** 1 = primary node (labelled), 2 = secondary (marker only) */
  tier: 1 | 2;
  /** which way the label sits, so neighbouring labels never collide */
  labelOffset?: [number, number];
  note?: string;
}

export const GUJARAT_CITIES: GlobeCity[] = [
  {
    id: "ahmedabad",
    name: "Ahmedabad",
    coord: [72.5714, 23.0225],
    tier: 1,
    labelOffset: [-0.052, 0.004],
    note: "Largest urban agglomeration",
  },
  {
    id: "gandhinagar",
    name: "Gandhinagar",
    coord: [72.6369, 23.2156],
    tier: 1,
    labelOffset: [0.014, 0.026],
    note: "State capital",
  },
  {
    id: "surat",
    name: "Surat",
    coord: [72.8311, 21.1702],
    tier: 1,
    labelOffset: [0.016, -0.02],
    note: "Industrial corridor",
  },
  {
    id: "vadodara",
    name: "Vadodara",
    coord: [73.1812, 22.3072],
    tier: 1,
    labelOffset: [0.018, 0.006],
    note: "Central Gujarat",
  },
  {
    id: "rajkot",
    name: "Rajkot",
    coord: [70.8022, 22.3039],
    tier: 1,
    labelOffset: [-0.05, 0.012],
    note: "Saurashtra hub",
  },
  { id: "bhavnagar", name: "Bhavnagar", coord: [72.1519, 21.7645], tier: 2 },
  { id: "jamnagar", name: "Jamnagar", coord: [70.0577, 22.4707], tier: 2 },
];

/** Visual intelligence links between nodes — not literal transport routes. */
export const GUJARAT_LINKS: [string, string][] = [
  ["ahmedabad", "gandhinagar"],
  ["ahmedabad", "vadodara"],
  ["vadodara", "surat"],
  ["ahmedabad", "rajkot"],
  ["rajkot", "jamnagar"],
  ["surat", "bhavnagar"],
];

/** Geographic centre used to aim the camera at the state. */
export const GUJARAT_CENTER: [number, number] = [71.8, 22.6];

/** Centre of India, used for the intermediate camera stage. */
export const INDIA_CENTER: [number, number] = [79.0, 22.5];

export const cityById = (id: string) => GUJARAT_CITIES.find((c) => c.id === id);
