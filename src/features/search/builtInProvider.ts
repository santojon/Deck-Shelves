import type { SearchHit, SearchProviderDescriptor } from "../../core/pluginApi";
import { focusElement } from "../../core/focusRestore";
import { getPreferredSteamDocument } from "../../runtime/steamHost";

interface SteamAppOverviewLite {
  appid: number;
  display_name?: string;
  name?: string;
  installed?: boolean;
}

function getOverview(appid: number): SteamAppOverviewLite | null {
  try {
    const store = (globalThis as unknown as {
      appStore?: { GetAppOverviewByAppID?: (id: number) => SteamAppOverviewLite | null };
    }).appStore;
    return store?.GetAppOverviewByAppID?.(appid) ?? null;
  } catch { return null; }
}

function nameOf(appid: number): string {
  const ov = getOverview(appid);
  return ov?.display_name ?? ov?.name ?? "";
}

interface ShelfHit { appid: number; name: string; shelfId: string | null; shelfTitle: string | null }

/**
 * Walks the rendered DS shelves on the home and collects every card
 * currently in the DOM. Reads names from `data-name` (set directly by
 * GameCard) so the search doesn't depend on appStore being warm —
 * non-library appids (store, wishlist, friends_playing) used to come
 * back nameless and silently miss every query.
 */
function collectShelfApps(): ShelfHit[] {
  const seen = new Map<number, ShelfHit>();
  const doc = getPreferredSteamDocument() ?? document;
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root") ?? doc;
  const shelves = root.querySelectorAll<HTMLElement>(".ds-shelf[data-shelfid]");
  for (const shelfEl of Array.from(shelves)) {
    const shelfId = shelfEl.getAttribute("data-shelfid");
    const titleEl = shelfEl.querySelector<HTMLElement>(".ds-shelf-title");
    const shelfTitle = titleEl?.textContent?.trim() ?? null;
    const cards = shelfEl.querySelectorAll<HTMLElement>("[data-appid]");
    for (const card of Array.from(cards)) {
      const raw = card.getAttribute("data-appid");
      if (!raw) continue;
      const appid = Number(raw);
      if (!Number.isFinite(appid) || appid <= 0) continue;
      if (seen.has(appid)) continue;
      const name = (card.getAttribute("data-name") || nameOf(appid) || "").trim();
      if (!name) continue;
      seen.set(appid, { appid, name, shelfId, shelfTitle });
    }
  }
  try { (globalThis as any).__ds_search_pool = seen.size; } catch {}
  return Array.from(seen.values());
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
  // Resolve the exact card the user picked. Scope to the shelf the hit
  // came from so two shelves containing the same app land on the one the
  // search was answering from; fall back to a global lookup when the
  // shelf id is missing or the card has already been recycled out of
  // that container.
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  const escape = (s: string) => g.CSS?.escape?.(s) ?? s.replace(/["\\]/g, "\\$&");
  const doc = getPreferredSteamDocument() ?? document;
  let target: HTMLElement | null = null;
  if (shelfId) {
    target = doc.querySelector<HTMLElement>(
      `[data-shelfid="${escape(shelfId)}"] [data-appid="${appid}"]`,
    );
  }
  if (!target) {
    target = doc.querySelector<HTMLElement>(`[data-appid="${appid}"]`);
  }
  if (!target) return;
  try {
    target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
  } catch {}
  try {
    focusElement(target);
  } catch {}
}
