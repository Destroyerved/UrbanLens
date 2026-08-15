import type { ProjectType, SimulationResult } from "@/types";
import { simulateIntervention } from "@/lib/analysis";
import { simulateLatency } from "./latency";

/**
 * Scenario simulation service.
 * Backend swap: POST /api/scenarios/simulate
 */

export async function runSimulation(
  parcelId: string,
  projectType: ProjectType
): Promise<SimulationResult> {
  await simulateLatency(200);
  return simulateIntervention(parcelId, projectType);
}
