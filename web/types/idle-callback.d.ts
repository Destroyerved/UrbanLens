/**
 * `requestIdleCallback` is not in TypeScript's lib.dom, so `"requestIdleCallback"
 * in window` narrowed `window` to `never` on the fallback branch and every
 * `window.setTimeout` after such a guard failed to compile — which fails
 * `next build`, not just the editor. Declaring the pair (optionally, because the
 * runtime guard is genuine — Safari shipped it only recently) makes the guard
 * narrow the way it reads.
 *
 * No import/export in this file: it must stay a global script, not a module, or
 * the `Window` augmentation below is scoped to the file and changes nothing.
 */
interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

interface IdleRequestOptions {
  timeout?: number;
}

interface Window {
  requestIdleCallback?(
    callback: (deadline: IdleDeadline) => void,
    options?: IdleRequestOptions,
  ): number;
  cancelIdleCallback?(handle: number): void;
}
