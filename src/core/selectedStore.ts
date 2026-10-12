/* A per-key selected store: one upstream subscription (`attach`) recomputes
   every subscribed key on a signal and notifies only the keys whose value
   changed. Built for `useSyncExternalStore` in card components — a Home-wide
   signal (shelf refresh, friends poll) then re-renders the few cards whose
   own value moved instead of every mounted card (S6 render scaling). */
export type SelectedStore<T> = {
  subscribe(key: number, cb: () => void): () => void;
  get(key: number): T;
  recompute(): void;
  invalidate(key?: number): void;
};

export function createSelectedStore<T>(opts: {
  compute: (key: number) => T;
  equal: (a: T, b: T) => boolean;
  attach: (recompute: () => void) => () => void;
}): SelectedStore<T> {
  const values = new Map<number, T>();
  const subs = new Map<number, Set<() => void>>();
  let detach: (() => void) | null = null;

  const get = (key: number): T => {
    const cached = values.get(key);
    if (cached !== undefined) return cached;
    const v = opts.compute(key);
    values.set(key, v);
    return v;
  };

  const recompute = (): void => {
    for (const [key, cbs] of subs) {
      const next = opts.compute(key);
      const prev = values.get(key);
      // Nothing read yet for this key → nothing to notify about.
      if (prev === undefined) { values.set(key, next); continue; }
      if (opts.equal(prev, next)) continue;
      values.set(key, next);
      for (const cb of cbs) { try { cb(); } catch {} }
    }
  };

  const subscribe = (key: number, cb: () => void): (() => void) => {
    let set = subs.get(key);
    if (!set) { set = new Set(); subs.set(key, set); }
    set.add(cb);
    if (!detach) detach = opts.attach(recompute);
    return () => {
      const cur = subs.get(key);
      if (!cur) return;
      cur.delete(cb);
      if (cur.size === 0) { subs.delete(key); values.delete(key); }
      if (subs.size === 0 && detach) { detach(); detach = null; }
    };
  };

  const invalidate = (key?: number): void => {
    if (key === undefined) values.clear();
    else values.delete(key);
  };

  return { subscribe, get, recompute, invalidate };
}
