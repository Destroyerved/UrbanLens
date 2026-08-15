/** Small simulated latency so loading states are visible & realistic. */
export function simulateLatency(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
