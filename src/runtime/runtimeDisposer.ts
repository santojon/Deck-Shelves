/* Global disposer registry — a safety net alongside (not a replacement for)
   each subsystem's own manual uninstall wiring in index.tsx's dispose().
   A hot-swap or Steam restart calling disposeAll() catches anything a future
   subsystem forgets to wire into the manual list by hand — the class of bug
   behind a past incident (a hot-swap clearing only 7 of 16 API registries). */

type Disposer = () => void;

const disposers = new Set<Disposer>();

/** Register a cleanup function to run on disposeAll(). Returns an unregister
    function — call it if the subsystem already cleaned itself up through its
    own path (e.g. its own effect cleanup) to avoid a harmless double-call. */
export function registerDisposer(fn: Disposer): () => void {
  disposers.add(fn);
  return () => { disposers.delete(fn); };
}

/** Run every registered disposer (most-recently-registered first, the usual
    LIFO cleanup order) and clear the registry. Each disposer is isolated —
    one throwing never stops the rest from running. */
export function disposeAll(): void {
  for (const fn of Array.from(disposers).reverse()) {
    try { fn(); } catch {}
  }
  disposers.clear();
}

export function getDisposerCount(): number {
  return disposers.size;
}
