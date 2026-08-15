import type { Facility, FacilityType, LngLat } from "@/types";
import { wardForPoint } from "./wards";

/**
 * Illustrative/demo facility dataset modelled on Ahmedabad's public
 * infrastructure (names reference real institutions for familiarity;
 * coordinates are approximate). NOT an official record.
 *
 * Deliberate spatial pattern for the demo narrative: hospitals concentrate
 * in the centre/east — the fast-growing NW corridor (Gota, Chandkheda,
 * Bopal) is underserved. That gap is what the site-selection story finds.
 */

function f(id: string, name: string, type: FacilityType, coord: LngLat): Facility {
  return { id, name, type, coord, wardId: wardForPoint(coord).id };
}

export const FACILITIES: Facility[] = [
  // Hospitals — centre/east heavy
  f("h-civil", "Civil Hospital, Asarwa", "hospital", [72.605, 23.052]),
  f("h-vs", "V.S. Hospital, Ellisbridge", "hospital", [72.567, 23.017]),
  f("h-svp", "SVP Hospital, Paldi", "hospital", [72.571, 23.006]),
  f("h-lg", "L.G. Hospital, Maninagar", "hospital", [72.598, 22.992]),
  f("h-sterling", "Sterling Hospital, Memnagar", "hospital", [72.535, 23.048]),
  f("h-sola", "Sola Civil Hospital", "hospital", [72.507, 23.061]),
  f("h-shardaben", "Shardaben Hospital, Saraspur", "hospital", [72.612, 23.035]),
  f("h-naroda", "Apollo Clinic, Naroda Road", "hospital", [72.634, 23.069]),
  f("h-zydus", "Zydus Hospital, Thaltej", "hospital", [72.517, 23.052]),
  f("h-shalby", "Shalby Hospital, S.G. South", "hospital", [72.52, 22.978]),
  f("h-gcs", "GCS Hospital, Naroda Road", "hospital", [72.615, 23.06]),
  f("h-sanjivani", "Sanjivani Hospital, Vatva", "hospital", [72.63, 22.965]),
  // Clinics
  f("c-vasna", "UHC Vasna", "clinic", [72.552, 22.996]),
  f("c-nikol", "UHC Nikol", "clinic", [72.652, 23.045]),
  f("c-chand", "UHC Chandkheda", "clinic", [72.572, 23.108]),
  f("c-bopal", "UHC Bopal", "clinic", [72.474, 23.016]),
  // Schools
  f("s-1", "Municipal School, Khadia", "school", [72.59, 23.023]),
  f("s-2", "St. Xavier's, Navrangpura", "school", [72.556, 23.036]),
  f("s-3", "DPS Bopal", "school", [72.468, 23.024]),
  f("s-4", "Kendriya Vidyalaya, Sabarmati", "school", [72.586, 23.082]),
  f("s-5", "Nirman School, Vastrapur", "school", [72.529, 23.032]),
  f("s-6", "Municipal School, Maninagar", "school", [72.602, 22.998]),
  f("s-7", "Naroda Public School", "school", [72.64, 23.078]),
  f("s-8", "Gota Municipal School", "school", [72.522, 23.094]),
  f("s-9", "Chandkheda Vidyalaya", "school", [72.562, 23.112]),
  f("s-10", "Vatva Municipal School", "school", [72.632, 22.972]),
  f("s-11", "Sarkhej Urdu School", "school", [72.502, 22.976]),
  f("s-12", "Nikol High School", "school", [72.658, 23.038]),
  // Parks — thin in the west
  f("p-1", "Law Garden", "park", [72.56, 23.026]),
  f("p-2", "Parimal Garden", "park", [72.552, 23.021]),
  f("p-3", "Kankaria Lakefront", "park", [72.602, 22.985]),
  f("p-4", "Riverfront Park (East)", "park", [72.578, 23.03]),
  f("p-5", "Sabarmati Riverfront (North)", "park", [72.582, 23.065]),
  f("p-6", "Naroda Lake Garden", "park", [72.646, 23.082]),
  f("p-7", "Vastrapur Lake Garden", "park", [72.529, 23.038]),
  // Transit (BRTS/Metro nodes) — NW sparse, that's the flagship ⚠
  f("t-1", "Ashram Rd BRTS", "transit", [72.575, 23.02]),
  f("t-2", "RTO Circle BRTS", "transit", [72.585, 23.06]),
  f("t-3", "Maninagar Metro", "transit", [72.604, 22.996]),
  f("t-4", "Old City Metro", "transit", [72.592, 23.026]),
  f("t-5", "ISKCON BRTS", "transit", [72.508, 23.028]),
  f("t-6", "Motera Metro", "transit", [72.597, 23.098]),
  f("t-7", "Vaishnodevi BRTS", "transit", [72.51, 23.116]),
  f("t-8", "Naroda BRTS", "transit", [72.636, 23.066]),
  f("t-9", "Vasna BRTS", "transit", [72.556, 22.998]),
  f("t-10", "Nikol BRTS", "transit", [72.648, 23.042]),
  f("t-11", "Chandkheda BRTS", "transit", [72.565, 23.1]),
  f("t-12", "South Bopal BRTS", "transit", [72.472, 23.01]),
  // Fire
  f("fi-1", "Fire Station, Danapith", "fire", [72.588, 23.02]),
  f("fi-2", "Fire Station, Naroda", "fire", [72.638, 23.072]),
  f("fi-3", "Fire Station, Bodakdev", "fire", [72.512, 23.04]),
  // Police
  f("po-1", "Police HQ, Shahibaug", "police", [72.592, 23.055]),
  f("po-2", "Police Station, Satellite", "police", [72.518, 23.012]),
  f("po-3", "Police Station, Maninagar", "police", [72.6, 22.994]),
  f("po-4", "Police Station, Chandkheda", "police", [72.568, 23.106]),
  // Government offices
  f("g-1", "AMC Head Office", "govt", [72.58, 23.022]),
  f("g-2", "Collector Office", "govt", [72.594, 23.04]),
  f("g-3", "AUDA Office", "govt", [72.53, 23.03]),
  f("g-4", "Zonal Office, Naroda", "govt", [72.636, 23.07]),
];

export const FACILITIES_BY_TYPE = (type: FacilityType): Facility[] =>
  FACILITIES.filter((x) => x.type === type);

export const FACILITY_COORDS = (type: FacilityType): LngLat[] =>
  FACILITIES_BY_TYPE(type).map((x) => x.coord);
