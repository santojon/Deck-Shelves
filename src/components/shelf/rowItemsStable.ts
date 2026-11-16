import type { DeckRowItem } from "./types";

function bothPlainObjects(a: any, b: any): boolean {
  return !!a && !!b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b);
}

function dataEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a === "function" && typeof b === "function") return true;
  if (!bothPlainObjects(a, b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!dataEqual(a[k], b[k])) return false;
  return true;
}

export function stabilizeRowItems(prev: readonly DeckRowItem[], next: DeckRowItem[]): DeckRowItem[] {
  if (next.length === 0) return prev.length === 0 ? (prev as DeckRowItem[]) : next;
  const byId = new Map<string | number, DeckRowItem>();
  for (const p of prev) byId.set(p.id, p);
  let reusedAll = prev.length === next.length;
  for (let i = 0; i < next.length; i++) {
    const old = byId.get(next[i].id);
    if (old && dataEqual(old, next[i])) {
      if (old !== prev[i]) reusedAll = false;
      next[i] = old;
    } else {
      reusedAll = false;
    }
  }
  return reusedAll ? (prev as DeckRowItem[]) : next;
}
