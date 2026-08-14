/**
 * The selected city, held in localStorage and exposed as an external store.
 *
 * This is deliberately not React state seeded by an effect: localStorage does not
 * exist during server rendering, so reading it in a lazy initialiser would cause
 * a hydration mismatch, and restoring it in an effect means a setState in the
 * effect body. `useSyncExternalStore` is the primitive built for exactly this —
 * it takes a separate server snapshot and subscribes to changes.
 *
 * The browser only fires `storage` for *other* tabs, so writes go through
 * `writeCity`, which notifies local subscribers too.
 */

const KEY = "urbanlens.city";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeCity(listener: Listener): () => void {
  listeners.add(listener);
  // Keep tabs in sync as well.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readCity(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // Private mode / storage disabled.
  }
}

/** No stored selection exists on the server, so it always renders the default. */
export function readCityServer(): string | null {
  return null;
}

export function writeCity(cityId: string): void {
  try {
    window.localStorage.setItem(KEY, cityId);
  } catch {
    // Selection just won't persist.
  }
  for (const l of listeners) l();
}
