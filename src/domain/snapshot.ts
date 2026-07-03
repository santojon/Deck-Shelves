import type { Settings } from "../types";

/* Portable snapshot of the shareable Deck Shelves concepts. Pure, no side
   effects — the controller (and, later, external plugins) build a bundle
   from the live settings and apply a parsed bundle back. Kept format-
   compatible with the existing per-concept export shape (`{ state: {...} }`)
   so older exports still import. */

export const SNAPSHOT_VERSION = 1;

export type SnapshotConcept =
  | "shelves"
  | "smartShelves"
  | "savedFilters"
  | "savedSmartFilters";

export const SNAPSHOT_CONCEPTS: readonly SnapshotConcept[] = [
  "shelves",
  "smartShelves",
  "savedFilters",
  "savedSmartFilters",
];

export interface Snapshot {
  deckShelvesSnapshot: number;
  state: Partial<Pick<Settings, SnapshotConcept>>;
}

/* Build a snapshot from settings. `include` narrows it to a subset of
   concepts (defaults to all). Arrays are shallow-copied so the caller can't
   mutate live settings through the bundle. */
export function buildSnapshot(
  settings: Settings,
  include?: readonly SnapshotConcept[],
): Snapshot {
  const concepts = include && include.length ? include : SNAPSHOT_CONCEPTS;
  const state: Partial<Pick<Settings, SnapshotConcept>> = {};
  for (const concept of concepts) {
    const arr = (settings as any)[concept];
    if (Array.isArray(arr)) (state as any)[concept] = arr.slice();
  }
  return { deckShelvesSnapshot: SNAPSHOT_VERSION, state };
}

/* Read one concept's array from a parsed bundle, tolerant of both the
   `{ state: { shelves: [] } }` and the bare `{ shelves: [] }` shapes. */
export function readSnapshotConcept<T = unknown>(
  raw: any,
  concept: SnapshotConcept,
): T[] | null {
  const fromState = raw?.state?.[concept];
  if (Array.isArray(fromState)) return fromState as T[];
  const bare = raw?.[concept];
  if (Array.isArray(bare)) return bare as T[];
  return null;
}

function keyOf(item: any): string {
  if (item && item.id != null) return `id:${String(item.id)}`;
  if (item && item.name != null) return `name:${String(item.name)}`;
  return `json:${JSON.stringify(item)}`;
}

function mergeById(current: any[], incoming: any[]): any[] {
  const seen = new Set(current.map(keyOf));
  const merged = current.slice();
  for (const item of incoming) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(item);
  }
  return merged;
}

/* Apply a parsed bundle to settings, returning a new Settings object.
   `replace` overwrites each present concept; `merge` appends, de-duplicating
   by id (falling back to name, then a structural key). Concepts absent from
   the bundle are left untouched. */
export function applySnapshot(
  settings: Settings,
  raw: any,
  mode: "merge" | "replace" = "merge",
): Settings {
  const next: Settings = { ...settings };
  for (const concept of SNAPSHOT_CONCEPTS) {
    const incoming = readSnapshotConcept<any>(raw, concept);
    if (!incoming) continue;
    if (mode === "replace") {
      (next as any)[concept] = incoming.slice();
    } else {
      (next as any)[concept] = mergeById((settings as any)[concept] ?? [], incoming);
    }
  }
  return next;
}
