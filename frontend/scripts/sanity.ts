/**
 * Deterministic analysis sanity check — run with `npm run sanity`.
 * Verifies the demo story emerges from the formulas (nothing hardcoded):
 *  1. GJ-AHD-1028 ranks #1 for a hospital with default constraints/weights
 *  2. Healthcare coverage before/after simulation moves convincingly
 *  3. Ward gaps identify the NW corridor
 */
import { DEFAULT_WEIGHTS } from "../types";
import {
  searchSites,
  simulateIntervention,
  computeWardGaps,
  computeCityKpis,
  computeTransitions,
  growthSummary,
  DEFAULT_CONSTRAINTS,
} from "../lib/analysis";

const candidates = searchSites("hospital", DEFAULT_CONSTRAINTS, DEFAULT_WEIGHTS, 8);
console.log("=== HOSPITAL SITE RANKING (default constraints + weights) ===");
for (const c of candidates) {
  console.log(
    `#${c.rank} ${c.parcelId}  score=${c.score}  ward=${c.parcel.wardId}  area=${c.parcel.areaHa}ha  own=${c.parcel.ownership}`
  );
  console.log(
    "    factors:",
    c.factors.map((f) => `${f.key}=${f.score}`).join(" ")
  );
}

console.log("\n=== SIMULATION (top candidate) ===");
const sim = simulateIntervention(candidates[0].parcelId, "hospital");
console.log(
  `citywide coverage ${sim.before.coveragePct}% -> ${sim.after.coveragePct}%  newlyCovered=+${Math.round(sim.newlyCovered / 1000)}K  avgDist ${sim.before.avgDistKm}km -> ${sim.after.avgDistKm}km`
);
console.log(
  `corridor coverage ${sim.corridorBefore.coveragePct}% -> ${sim.corridorAfter.coveragePct}%  corridor avgDist ${sim.corridorBefore.avgDistKm}km -> ${sim.corridorAfter.avgDistKm}km`
);
console.log(
  `accessibility ${sim.accessibilityBefore} -> ${sim.accessibilityAfter}  livability ${sim.livabilityBefore} -> ${sim.livabilityAfter}  ward=${sim.wardName}`
);

console.log("\n=== WARD GAPS (worst 5) ===");
for (const g of computeWardGaps().slice(0, 5)) {
  console.log(
    `${g.wardName.padEnd(22)} overall=${g.overall}  health=${g.scores.healthcare} edu=${g.scores.education} parks=${g.scores.parks} transport=${g.scores.transport}  affected=${Math.round(g.affectedPopulation / 1000)}K`
  );
}

console.log("\n=== KPIs ===");
console.log(computeCityKpis());

console.log("\n=== GROWTH ===");
console.log(growthSummary());
console.log(
  "top transitions 2018->2026:",
  computeTransitions(2018, 2026).slice(0, 5)
);

// determinism check
const again = searchSites("hospital", DEFAULT_CONSTRAINTS, DEFAULT_WEIGHTS, 8);
const same = JSON.stringify(again.map((c) => [c.parcelId, c.score])) ===
  JSON.stringify(candidates.map((c) => [c.parcelId, c.score]));
console.log("\ndeterminism:", same ? "PASS" : "FAIL");
