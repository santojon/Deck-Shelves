import { uniqNumbers } from "./steamAccess";

/* Generic walkers over Steam's object graph: map/set detection and the deep app-id extraction the library and collection readers share. */

// Any object the Steam graph walkers descend into (stores, maps, arrays, MobX nodes).
type Walkable = Record<string | symbol, any>;

export function isMapLike(obj: unknown): boolean {
  const o = obj as Walkable | null | undefined;
  return !!o && typeof o === 'object' && typeof o.values === 'function' && typeof o.get === 'function';
}

export function isSetLike(obj: unknown): boolean {
  const o = obj as Walkable | null | undefined;
  return !!o && typeof o === 'object' && typeof o.values === 'function' && typeof o.has === 'function' && !isMapLike(o) && typeof o.get !== 'function';
}

const DEEP_APPID_NUMBER_KEYS = ["appid", "appId", "nAppID", "m_unAppID"];

const DEEP_APPID_CHILD_KEY_RE = /(apps|appids|items|list|entries|children|rgAppIDs|m_rgAppIDs|rgItems|m_rgItems)/i;

function pushDirectAppId(value: Walkable, out: number[]): void {
  for (const k of DEEP_APPID_NUMBER_KEYS) {
    const v = Number(value?.[k]);
    if (Number.isFinite(v) && v > 0) { out.push(v); return; }
  }
}

function walkIterableChildren(value: Walkable, depth: number, walk: (v: unknown, d: number) => void): boolean {
  if (isMapLike(value) || isSetLike(value) || value instanceof Set) {
    for (const entry of value.values()) walk(entry, depth + 1);
    return true;
  }
  if (typeof value[Symbol.iterator] === 'function' && typeof value !== 'string') {
    try { for (const entry of value as Iterable<unknown>) walk(entry, depth + 1); return true; } catch {}
  }
  return false;
}

function walkObjectChildren(value: Walkable, depth: number, walk: (v: unknown, d: number) => void): void {
  for (const [key, child] of Object.entries(value)) {
    if (!child) continue;
    if (DEEP_APPID_CHILD_KEY_RE.test(key) || (depth < 2 && typeof child === "object")) {
      walk(child, depth + 1);
    }
  }
}

function pushIfPositiveNumber(value: number, out: number[]): void {
  if (Number.isFinite(value) && value > 0) out.push(value);
}

export function extractAppIdsDeep(node: unknown, maxDepth = 6): number[] {
  const out: number[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth = 0) => {
    if (value == null || depth > maxDepth || seen.has(value)) return;
    if (typeof value === "number") { pushIfPositiveNumber(value, out); return; }
    if (typeof value !== "object") return;
    seen.add(value);
    if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
    const o = value as Walkable;
    if (walkIterableChildren(o, depth, walk)) return;
    pushDirectAppId(o, out);
    walkObjectChildren(o, depth, walk);
  };
  walk(node, 0);
  return uniqNumbers(out);
}

const COLLECTION_VALUE_APPID_KEYS = ["appid", "appId", "nAppID", "m_unAppID"];

function pickDirectAppIdNumber(val: Walkable): number[] {
  for (const k of COLLECTION_VALUE_APPID_KEYS) {
    const n = Number(val?.[k]);
    if (Number.isFinite(n) && n > 0) return [n];
  }
  return [];
}

function isAnySetLike(v: unknown): boolean { return isSetLike(v) || v instanceof Set; }

function isAnyMapLike(v: unknown): boolean { return isMapLike(v) || v instanceof Map; }

function collectIdsFromCollectionValue(val: unknown): number[] {
  if (!val) return [];
  if (typeof val === "number") return Number.isFinite(val) && val > 0 ? [val] : [];
  if (Array.isArray(val)) return val.flatMap(collectIdsFromCollectionValue);
  if (isAnySetLike(val) || isAnyMapLike(val)) return Array.from((val as { values(): Iterable<unknown> }).values()).flatMap(collectIdsFromCollectionValue);
  if (typeof val === "object") return pickDirectAppIdNumber(val as Walkable);
  return [];
}

export function extractCollectionAppIds(raw: unknown): number[] {
  if (!raw || typeof raw !== "object") return [];
  const idsFromValue = (val: unknown): number[] => collectIdsFromCollectionValue(val);
  // Try direct well-known fields first (depth-0 only = no cross-contamination)
  for (const key of ["apps", "added", "m_rgApps", "rgApps", "appids", "allApps", "visibleApps"]) {
    const val = (raw as Walkable)[key];
    if (val) {
      const ids = uniqNumbers(idsFromValue(val));
      if (ids.length) return ids;
    }
  }
  // Bounded fallback — depth 3 avoids traversing into sibling collection objects
  return extractAppIdsDeep(raw, 3);
}
