/** Bench hook: no-op unless the puppeteer benchmark set window.__M2. */
export const m2 = (n: string) => {
  try {
    if (typeof window !== "undefined" && (window as any).__M2) {
      (window as any).__M2.push([n, performance.now()]);
    }
  } catch {}
};