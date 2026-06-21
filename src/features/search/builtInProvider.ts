import type { SearchHit, SearchProviderDescriptor } from "../../core/pluginApi";
import { focusElement } from "../../core/focusRestore";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { getCurrentSettings } from "../../settingsStore";
import { readRegistry } from "./shelfRegistry";

interface ShelfHit { appid: number; name: string; shelfId: string | null; shelfTitle: string }

const NATIVE_SHELF_ID = "__ds_native_recents__";

function getClassMap(): Record<string, string> {
  try {
    const g = globalThis as any;
    if (g?.__DS_CLASS_MAP && typeof g.__DS_CLASS_MAP === "object") return g.__DS_CLASS_MAP;
    if (globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem("ds_class_map");
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function nativeCardSelector(map: Record<string, string>): string {
  const cls = map.nativeCard;
  return cls
    ? `[class~="${cls}"]:not(.ds-card), a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)`
    : `a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)`;
}

function collectClassCandidates(doc: Document, map: Record<string, string>): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (cls?: string) => {
    if (!cls) return;
    try {
      doc.querySelectorAll<HTMLElement>(`[class~="${cls}"]`).forEach((el) => {
        if (!seen.has(el)) { seen.add(el); candidates.push(el); }
      });
    } catch {}
  };
  push(map.nativeShelfContainer);
  push(map.shelfSection);
  return candidates;
}

function isNativeCandidate(el: HTMLElement, root: HTMLElement | null, homeRoot: HTMLElement | null, sel: string): boolean {
  if (root && root.contains(el)) return false;
  if (homeRoot && homeRoot.contains(el)) return false;
  if (!el.isConnected || !el.querySelector(sel)) return false;
  const r = el.getBoundingClientRect();
  return r.height >= 40 && r.width >= 40;
}

function findNativeShelfEl(doc: Document): HTMLElement | null {
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root");
  const homeRoot = doc.getElementById("deck-shelves-home-root");
  const map = getClassMap();
  const sel = nativeCardSelector(map);
  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  for (const el of collectClassCandidates(doc, map)) {
    if (!isNativeCandidate(el, root, homeRoot, sel)) continue;
    const top = el.getBoundingClientRect().top;
    if (top < bestTop) { best = el; bestTop = top; }
  }
  return best;
}

function extractAppidFromCard(card: HTMLElement): number {
  const appid = Number(card.getAttribute("data-appid") ?? NaN);
  if (Number.isFinite(appid) && appid > 0) return appid;
  const href = card.getAttribute("href") || "";
  const hm = /\/library\/app\/(\d+)/.exec(href);
  if (hm) return Number(hm[1]);
  const img = card.querySelector<HTMLImageElement>("img[src]");
  const src = img?.getAttribute("src") || "";
  const sm = /(?:\/assets\/|\/apps\/)(\d+)\//.exec(src);
  return sm ? Number(sm[1]) : 0;
}

function nameFromAppStore(appid: number): string {
  try {
    const overview = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    return String(overview?.display_name ?? overview?.name ?? "").trim();
  } catch { return ""; }
}

function extractCardName(card: HTMLElement, appid: number): string {
  return nameFromAppStore(appid)
    || (card.querySelector<HTMLImageElement>("img[alt]")?.getAttribute("alt") ?? "").trim();
}

function collectNativeShelfApps(): ShelfHit[] {
  const doc = getPreferredSteamDocument();
  if (!doc) return [];
  // Don't include native shelf games when the user has hidden the row.
  const s = getCurrentSettings();
  if ((s as any)?.hideRecents === true) return [];
  const best = findNativeShelfEl(doc);
  if (!best) return [];
  const map = getClassMap();
  // Native Steam cards are `<div role="link">` with the hashed
  // `nativeCard` class. Appids live in img src; names come from
  // `appStore.GetAppOverviewByAppID(appid)`.
  const sel = map.nativeCard
    ? `[class~="${map.nativeCard}"]:not(.ds-card)`
    : 'a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)';
  const cards = Array.from(best.querySelectorAll<HTMLElement>(sel));
  const out: ShelfHit[] = [];
  for (const card of cards) {
    const appid = extractAppidFromCard(card);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    const name = extractCardName(card, appid);
    if (!name) continue;
    out.push({ appid, name, shelfId: NATIVE_SHELF_ID, shelfTitle: "Recents" });
  }
  return out;
}

function collectShelfApps(): ShelfHit[] {
  const out: ShelfHit[] = [];
  const seen = new Set<number>();
  // Native shelf gets first dibs so a card that's also in a DS shelf
  // surfaces from the visible row the user expects to land on. If the
  // native row is hidden (or `hideRecents === true`), the dedupe below
  // simply preserves DS-shelf ordering.
  for (const nat of collectNativeShelfApps()) {
    if (seen.has(nat.appid) || !nat.name) continue;
    seen.add(nat.appid);
    out.push(nat);
  }
  // DS shelves walked in registry order — first match wins on duplicates.
  for (const shelf of readRegistry()) {
    for (const item of shelf.items) {
      if (seen.has(item.appid)) continue;
      seen.add(item.appid);
      out.push({
        appid: item.appid,
        name: item.name,
        shelfId: shelf.shelfId,
        shelfTitle: shelf.title,
      });
    }
  }
  try { (globalThis as any).__ds_search_pool = out.length; } catch {}
  return out;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function subsequenceScore(n: string, qLower: string): number {
  let qi = 0;
  for (let i = 0; i < n.length && qi < qLower.length; i++) {
    if (n[i] === qLower[qi]) qi++;
  }
  return qi === qLower.length ? 100 - (n.length - qLower.length) : -1;
}

function scoreMatch(name: string, qLower: string): number {
  if (!name) return -1;
  const n = normalize(name);
  const q = normalize(qLower);
  if (n.startsWith(q)) return 1000 - n.length;
  const idx = n.indexOf(q);
  if (idx < 0) return subsequenceScore(n, q);
  const isBoundary = idx === 0 || /\s|[:\-_]/.test(n[idx - 1] ?? "");
  return (isBoundary ? 700 : 500) - idx;
}

export const BUILT_IN_SHELF_SEARCH: SearchProviderDescriptor = {
  id: "deck-shelves.shelves",
  displayName: "Shelves",
  priority: 100,
  search: async (query, limit) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const apps = collectShelfApps();
    const scored: Array<{ entry: ShelfHit; score: number }> = [];
    for (const entry of apps) {
      const score = scoreMatch(entry.name, q);
      if (score < 0) continue;
      scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, limit));
    try { (globalThis as any).__ds_search_last = { q, pool: apps.length, hits: top.length }; } catch {}
    const hits: SearchHit[] = top.map(({ entry, score }) => ({
      id: `shelves:${entry.appid}`,
      appid: entry.appid,
      title: entry.name,
      subtitle: entry.shelfTitle ? `in shelf: ${entry.shelfTitle}` : undefined,
      score,
      onActivate: () => focusShelfCard(entry.appid, entry.shelfId),
    }));
    return hits;
  },
};

// Native recents card for `appid`. `:not(.ds-card)` keeps it native;
// falls back to the appid encoded in the card's image src.
function findNativeCard(doc: Document, appid: number): HTMLElement | null {
  const nativeShelf = findNativeShelfEl(doc);
  if (!nativeShelf) return null;
  const direct = nativeShelf.querySelector<HTMLElement>(`[data-appid="${appid}"]:not(.ds-card)`);
  if (direct) return direct;
  const map = getClassMap();
  const sel = map.nativeCard ? `[class~="${map.nativeCard}"]:not(.ds-card)` : '[role="link"]';
  const re = new RegExp(`(?:/assets/|/apps/)${appid}/`);
  for (const w of Array.from(nativeShelf.querySelectorAll<HTMLElement>(sel))) {
    const src = w.querySelector<HTMLImageElement>("img[src]")?.getAttribute("src") || "";
    if (re.test(src)) return w;
  }
  return null;
}

function focusShelfCard(appid: number, shelfId: string | null): void {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  const escape = (s: string) => g.CSS?.escape?.(s) ?? s.replace(/["\\]/g, "\\$&");
  const doc = getPreferredSteamDocument() ?? document;
  const isNative = shelfId === NATIVE_SHELF_ID;
  const findTarget = (): HTMLElement | null => {
    if (isNative) return findNativeCard(doc, appid);
    const scoped = shelfId
      ? doc.querySelector<HTMLElement>(`.ds-shelf[data-shelfid="${escape(shelfId)}"] [data-appid="${appid}"]`)
      : null;
    return scoped ?? doc.querySelector<HTMLElement>(`.ds-shelf [data-appid="${appid}"]`);
  };
  const target = findTarget();
  if (!target && shelfId && !isNative) {
    // Card not mounted — scroll the shelf into view first, then retry a
    // few times while the DOM catches up. Steam virtualises long rows so
    // off-screen items don't render until they're near the viewport.
    const shelfEl = doc.querySelector<HTMLElement>(`.ds-shelf[data-shelfid="${escape(shelfId)}"]`);
    if (shelfEl) {
      try { shelfEl.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior }); } catch {}
      let attempt = 0;
      const id = setInterval(() => {
        attempt++;
        const found = findTarget();
        if (found) {
          clearInterval(id);
          try { focusElement(found); } catch {}
        } else if (attempt > 20) {
          clearInterval(id);
        }
      }, 60);
    }
    return;
  }
  if (!target) return;
  // Use focusElement (BTakeFocus) only — it handles scroll internally.
  // Calling scrollIntoView BEFORE focusElement double-scrolls: first
  // inline:center on the shelf row resets the row's left position,
  // then BTakeFocus scrolls again. This left cards appearing with no
  // left-side spacing because the row ended up over-shifted.
  try { focusElement(target); } catch {}
}
