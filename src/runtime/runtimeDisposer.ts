// Safety net next to each subsystem's own teardown, not a replacement for it.

type Disposer = () => void;

const disposers = new Set<Disposer>();

export function registerDisposer(fn: Disposer): () => void {
  disposers.add(fn);
  return () => { disposers.delete(fn); };
}

export function disposeAll(): void {
  for (const fn of Array.from(disposers).reverse()) {
    try { fn(); } catch {}
  }
  disposers.clear();
}

export function getDisposerCount(): number {
  return disposers.size;
}
