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

function findNativeShelfEl(doc: Document): HTMLElement | null {
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root");
  const map = getClassMap();
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (sel: string) => {
    try {
      doc.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (!seen.has(el)) { seen.add(el); candidates.push(el); }
      });
    } catch {}
  };
  if (map.nativeShelfContainer) push(`.${CSS.escape(map.nativeShelfContainer)}`);
  if (map.shelfSection) push(`.${CSS.escape(map.shelfSection)}`);
  push('[class*="LibrarySection" i]');
  push('[class*="ShelfSection" i]');
  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  for (const el of candidates) {
    if (root && root.contains(el)) continue;
    if (!el.isConnected || el.offsetParent === null) continue;
    if (!el.querySelector('[data-appid], a[href*="/library/app/"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 60 || r.width < 60) continue;
    if (r.top < bestTop) { best = el; bestTop = r.top; }
  }
  return best;
}

function collectNativeShelfApps(): ShelfHit[] {
  const doc = getPreferredSteamDocument();
  if (!doc) return [];
  const s = getCurrentSettings();
  if ((s as any)?.hideRecents === true) return [];
  const best = findNativeShelfEl(doc);
  if (!best) return [];
  const out: ShelfHit[] = [];
  // Each native card carries an inner href like `/library/app/<id>` and
  // a label container we can lift the title from. `[data-appid]` is the
  // fallback DS-style attribute.
  const cards = Array.from(best.querySelectorAll<HTMLElement>('a[href*="/library/app/"], [data-appid]'));
  for (const card of cards) {
    let appid = Number(card.getAttribute('data-appid') ?? NaN);
    if (!Number.isFinite(appid) || appid <= 0) {
      const href = card.getAttribute('href') || '';
      const m = /\/library\/app\/(\d+)/.exec(href);
      appid = m ? Number(m[1]) : 0;
    }
    if (!Number.isFinite(appid) || appid <= 0) continue;
    const nameSrc = card.querySelector<HTMLElement>('img[alt], [class*="label" i], [class*="title" i]');
    const name = (nameSrc?.getAttribute?.('alt') || nameSrc?.textContent || '').trim();
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

function focusShelfCard(appid: number, shelfId: string | null): void {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  const escape = (s: string) => g.CSS?.escape?.(s) ?? s.replace(/["\\]/g, "\\$&");
  const doc = getPreferredSteamDocument() ?? document;
  const isNative = shelfId === NATIVE_SHELF_ID;
  const findTarget = (): HTMLElement | null => {
    if (isNative) {
      // Native recents lives outside `.ds-shelf` — search the whole doc
      // for the matching card. Filter back to exclude DS hits so we land
      // on the native instance even if the same app sits in a DS shelf.
      const all = Array.from(doc.querySelectorAll<HTMLElement>(`[data-appid="${appid}"]`));
      const dsRoot = doc.querySelector<HTMLElement>(".deck-shelves-root");
      return all.find((el) => !(dsRoot && dsRoot.contains(el))) ?? all[0] ?? null;
    }
    let t: HTMLElement | null = null;
    if (shelfId) {
      t = doc.querySelector<HTMLElement>(
        `.ds-shelf[data-shelfid="${escape(shelfId)}"] [data-appid="${appid}"]`,
      );
    }
    if (!t) {
      t = doc.querySelector<HTMLElement>(`.ds-shelf [data-appid="${appid}"]`);
    }
    return t;
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
          try { found.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior }); } catch {}
          try { focusElement(found); } catch {}
        } else if (attempt > 20) {
          clearInterval(id);
        }
      }, 60);
    }
    return;
  }
  if (!target) return;
  try {
    target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
  } catch {}
  try {
    focusElement(target);
  } catch {}
}
