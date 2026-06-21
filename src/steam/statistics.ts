import type { StatisticsEntry, StatisticsProviderDescriptor } from "../core/pluginApi";
import {
  computeLibraryStatistics, computeShelfStatistics, appendSnapshot, summarizeHistory,
  type LibraryStatGame, type ShelfStatInput, type ShelfSnapshot,
} from "../domain/statistics";
import { getCurrentSettings } from "../store/settingsStore";
import { getAllAppOverviews, type AppOverview } from "./index";

function toStatGame(a: AppOverview): LibraryStatGame {
  return {
    appid: a.appid,
    isSteam: a.is_steam !== false && a.is_non_steam !== true,
    isNonSteam: a.is_non_steam === true,
    installed: a.installed === true,
    isFavorite: a.is_favorite === true,
    isHidden: a.is_hidden === true,
    playtimeMinutes: Number(a.playtime_forever ?? 0) || 0,
    lastPlayed: Number(a.last_played ?? 0) || 0,
    deckCompat: Number(a.deck_compatibility_category ?? 0) || 0,
    updatePending: a.update_pending === true,
  };
}

export const BUILT_IN_LIBRARY_STATISTICS: StatisticsProviderDescriptor = {
  id: "deck-shelves.library",
  displayName: "Library statistics",
  category: "library",
  resolve: async (): Promise<ReadonlyArray<StatisticsEntry>> => {
    const apps = await getAllAppOverviews().catch(() => [] as AppOverview[]);
    const games = apps.map(toStatGame);
    return computeLibraryStatistics(games, Date.now());
  },
};

function shelfSourceType(sh: any, kind: "regular" | "smart"): string {
  if (kind === "smart") return String(sh.mode ?? "smart");
  return String(sh.source?.type ?? "filter");
}

// A synthetic card with no text/image/link is a pure gap/spacer.
function isGapCard(c: any): boolean {
  return !c?.text && !c?.image && !c?.link;
}

function toShelfStat(shRaw: any, kind: "regular" | "smart"): ShelfStatInput {
  const sh = shRaw || {};
  const synth: any[] = Array.isArray(sh.syntheticCards) ? sh.syntheticCards : [];
  return {
    kind,
    sourceType: shelfSourceType(sh, kind),
    enabled: sh.enabled !== false,
    hidden: sh.hidden === true,
    limit: Number(sh.limit ?? 20) || 20,
    featured: sh.highlightFirst === true || sh.highlightAll === true,
    fullPage: sh.fullPageShelf === true,
    decorativeCards: synth.length,
    gapCards: synth.filter(isGapCard).length,
    linkedCards: synth.filter((c) => !!c?.link).length,
  };
}

const HISTORY_KEY = "ds_stats_history";

function loadHistory(): ShelfSnapshot[] {
  try {
    const raw = (globalThis as any)?.localStorage?.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveHistory(h: ShelfSnapshot[]): void {
  try { (globalThis as any)?.localStorage?.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
}

export const BUILT_IN_SHELF_STATISTICS: StatisticsProviderDescriptor = {
  id: "deck-shelves.shelf-stats",
  displayName: "Shelf statistics",
  category: "shelves",
  resolve: (): ReadonlyArray<StatisticsEntry> => {
    const s = getCurrentSettings();
    const inputs: ShelfStatInput[] = [
      ...((s?.shelves ?? []) as any[]).map((sh) => toShelfStat(sh, "regular")),
      ...((s?.smartShelves ?? []) as any[]).map((sh) => toShelfStat(sh, "smart")),
    ];
    const stats = computeShelfStatistics(inputs);
    const visible = inputs.filter((i) => i.enabled && !i.hidden);
    const games = visible.reduce((a, i) => a + i.limit, 0);
    const today = new Date().toISOString().slice(0, 10);
    const history = appendSnapshot(loadHistory(), { date: today, shelves: inputs.length, games });
    saveHistory(history);
    return [...stats, ...summarizeHistory(history)];
  },
};
