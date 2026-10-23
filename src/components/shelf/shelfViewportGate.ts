/* Vertical shelf virtualization support: one IntersectionObserver per scroll
   root tells a placeholder shelf when it comes within reach of the viewport
   (so its real row mounts before the controller can get there), and the last
   measured height of each shelf keeps placeholders the right size on a
   rebuild (no scroll jump when the row swaps in). */
import { observerCreated, observerDisposed } from "../../core/perfMetrics";

const NEAR_MARGIN = "75% 0px";
const observers = new Map<Element | null, IntersectionObserver>();
const callbacks = new WeakMap<Element, () => void>();
const heights = new Map<string, number>();

// A rebuilt Home brings a new scroll root; an observer keyed on the old one
// would keep that detached tree alive for the session.
function dropDetachedRoots(): void {
  for (const [root, io] of observers) {
    if (!root || root.isConnected) continue;
    try { io.disconnect(); } catch {}
    observers.delete(root);
    observerDisposed();
  }
}

function scrollRootOf(el: Element): Element | null {
  let cur: Element | null = el.parentElement;
  const doc = el.ownerDocument;
  while (cur && cur !== doc.body) {
    try {
      const oy = doc.defaultView?.getComputedStyle(cur).overflowY ?? "";
      if (oy === "auto" || oy === "scroll") return cur;
    } catch { return null; }
    cur = cur.parentElement;
  }
  return null;
}

function observerFor(root: Element | null, doc: Document): IntersectionObserver | null {
  const IO = (doc.defaultView as any)?.IntersectionObserver ?? (globalThis as any).IntersectionObserver;
  if (typeof IO !== "function") return null;
  const existing = observers.get(root);
  if (existing) return existing;
  dropDetachedRoots();
  const io: IntersectionObserver = new IO((entries: IntersectionObserverEntry[]) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const cb = callbacks.get(e.target);
      if (cb) { callbacks.delete(e.target); io.unobserve(e.target); try { cb(); } catch {} }
    }
  }, { root, rootMargin: NEAR_MARGIN });
  observers.set(root, io);
  observerCreated();
  return io;
}

/* Two observers per placeholder: the one rooted on its scroll container gives
   the 75 % look-ahead; the viewport one is the safety net. In a Home mounted by
   a hot-swapped bundle the rooted observer reports "not intersecting" once and
   never updates (measured on a device; the root stays connected and a fresh
   observer on the same node works), while the viewport one keeps firing. */
export function observeShelfNear(el: Element | null, cb: () => void): () => void {
  if (!el) { cb(); return () => {}; }
  const doc = el.ownerDocument;
  const ios = [observerFor(scrollRootOf(el), doc), observerFor(null, doc)].filter((io): io is IntersectionObserver => !!io);
  if (!ios.length) { cb(); return () => {}; }
  const stop = () => { callbacks.delete(el); for (const io of ios) io.unobserve(el); };
  callbacks.set(el, () => { stop(); cb(); });
  for (const io of ios) io.observe(el);
  return stop;
}

export function rememberShelfHeight(shelfId: string | undefined, h: number): void {
  if (shelfId && h > 0) heights.set(shelfId, Math.round(h));
}

export function recallShelfHeight(shelfId: string | undefined): number | undefined {
  return shelfId ? heights.get(shelfId) : undefined;
}

export function __resetShelfViewportGateForTest(): void {
  for (const io of observers.values()) { try { io.disconnect(); } catch {} observerDisposed(); }
  observers.clear();
  heights.clear();
}
