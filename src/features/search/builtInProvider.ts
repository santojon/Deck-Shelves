import type { SearchHit, SearchProviderDescriptor } from "../../core/pluginApi";
import { focusElement } from "../../core/focusRestore";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { readRegistry } from "./shelfRegistry";

interface ShelfHit { appid: number; name: string; shelfId: string; shelfTitle: string }

/**
 * Reads from the shelf registry — every Shelf component publishes its
 * resolved appids + names there on mount and on every update, so this
 * sees EVERY game across EVERY visible shelf, not just the cards
 * currently rendered in the DOM. Items below the fold, virtualised, or
 * still streaming meta all count.
 */
function collectShelfApps(): ShelfHit[] {
  const out: ShelfHit[] = [];
  const seen = new Set<number>();
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

/**
 * Score a name against a query. Returns -1 when no match. Higher wins.
 * Cheap fuzzy: prefix > substring (word-boundary) > substring (mid-word) >
 * all-chars-in-order subsequence. Diacritics are stripped on both sides
 * so "Pokemon" matches "Pokémon" and vice-versa.
 */
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

/**
 * Built-in search provider — scans the appids of every card currently
 * rendered across visible Deck Shelves shelves and ranks by name match.
 * Restricts hits to what the user can actually see on the home, not the
 * full Steam library.
 *
 * Synchronous under the hood (DOM walk + appStore lookups are local),
 * but the API surface is Promise-based so the overlay can interleave
 * with async provider hits without branching.
 */
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
  const findTarget = (): HTMLElement | null => {
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
  let target = findTarget();
  if (!target && shelfId) {
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
