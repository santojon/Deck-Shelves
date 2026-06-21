/* Library statistics — pure aggregation over a normalized game list.
   No Steam APIs, no side-effects (see .claude/rules/domain.md). The
   Steam-facing adapter in src/steam/statistics.ts feeds it real data and
   maps the result onto the public StatisticsEntry shape. */

export interface LibraryStatGame {
  appid: number;
  isSteam: boolean;
  isNonSteam: boolean;
  installed: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  playtimeMinutes: number;
  lastPlayed: number;
  deckCompat: number;
  updatePending: boolean;
}

export interface LibraryStat {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  category?: string;
}

interface Acc {
  steam: number; nonSteam: number; installed: number; favorites: number;
  hidden: number; updates: number; played: number; recent7: number;
  recent30: number; verified: number; playable: number; unsupported: number;
  unknown: number; totalMinutes: number; maxMinutes: number;
}

const DAY_SECONDS = 86_400;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function emptyAcc(): Acc {
  return {
    steam: 0, nonSteam: 0, installed: 0, favorites: 0, hidden: 0, updates: 0,
    played: 0, recent7: 0, recent30: 0, verified: 0, playable: 0,
    unsupported: 0, unknown: 0, totalMinutes: 0, maxMinutes: 0,
  };
}

function addFlags(acc: Acc, g: LibraryStatGame): void {
  if (g.isNonSteam) acc.nonSteam++; else acc.steam++;
  if (g.installed) acc.installed++;
  if (g.isFavorite) acc.favorites++;
  if (g.isHidden) acc.hidden++;
  if (g.updatePending) acc.updates++;
}

function addPlaytime(acc: Acc, g: LibraryStatGame): void {
  const mins = g.playtimeMinutes > 0 ? g.playtimeMinutes : 0;
  acc.totalMinutes += mins;
  if (mins > 0) acc.played++;
  if (mins > acc.maxMinutes) acc.maxMinutes = mins;
}

function addRecency(acc: Acc, g: LibraryStatGame, nowSec: number): void {
  if (g.lastPlayed <= 0) return;
  const age = nowSec - g.lastPlayed;
  if (age < 0) return;
  if (age <= 7 * DAY_SECONDS) acc.recent7++;
  if (age <= 30 * DAY_SECONDS) acc.recent30++;
}

function addCompat(acc: Acc, g: LibraryStatGame): void {
  switch (g.deckCompat) {
    case 3: acc.verified++; break;
    case 2: acc.playable++; break;
    case 1: acc.unsupported++; break;
    default: acc.unknown++; break;
  }
}

export function computeLibraryStatistics(games: LibraryStatGame[], nowMs: number): LibraryStat[] {
  const nowSec = Math.floor(nowMs / 1000);
  const acc = emptyAcc();
  for (const g of games) {
    addFlags(acc, g);
    addPlaytime(acc, g);
    addRecency(acc, g, nowSec);
    addCompat(acc, g);
  }
  const total = games.length;
  const avgMinutes = acc.played > 0 ? acc.totalMinutes / acc.played : 0;

  return [
    { id: "total_games",        label: "Total games",        value: total,                     category: "library" },
    { id: "steam_games",        label: "Steam games",        value: acc.steam,                 category: "library" },
    { id: "non_steam_games",    label: "Non-Steam games",    value: acc.nonSteam,              category: "library" },
    { id: "installed_games",    label: "Installed",          value: acc.installed,             category: "library" },
    { id: "favorite_games",     label: "Favorites",          value: acc.favorites,             category: "library" },
    { id: "hidden_games",       label: "Hidden",             value: acc.hidden,                category: "library" },
    { id: "played_games",       label: "Played",             value: acc.played,                category: "status" },
    { id: "never_played_games", label: "Never played",       value: total - acc.played,        category: "status" },
    { id: "updates_pending",    label: "Updates pending",    value: acc.updates,               category: "status" },
    { id: "recently_played_7d", label: "Played last 7 days",  value: acc.recent7,              category: "time" },
    { id: "recently_played_30d",label: "Played last 30 days", value: acc.recent30,             category: "time" },
    { id: "total_playtime",     label: "Total playtime",     value: round1(acc.totalMinutes / 60), unit: "h", category: "time" },
    { id: "avg_playtime",       label: "Avg playtime",       value: round1(avgMinutes / 60),   unit: "h", category: "time" },
    { id: "most_played",        label: "Most played",        value: round1(acc.maxMinutes / 60), unit: "h", category: "time" },
    { id: "deck_verified",      label: "Deck Verified",      value: acc.verified,              category: "compat" },
    { id: "deck_playable",      label: "Deck Playable",      value: acc.playable,              category: "compat" },
    { id: "deck_unsupported",   label: "Deck Unsupported",   value: acc.unsupported,           category: "compat" },
    { id: "deck_unknown",       label: "Deck Unknown",       value: acc.unknown,               category: "compat" },
  ];
}

/* ── Shelf statistics ───────────────────────────────────────────────── */

export interface ShelfStatInput {
  kind: "regular" | "smart";
  sourceType: string;
  enabled: boolean;
  hidden: boolean;
  limit: number;
  featured: boolean;
  fullPage: boolean;
  decorative: boolean;
}

// Maps a concrete source type onto the coarse bucket shown in "by type".
const SHELF_TYPE_BUCKET: Record<string, string> = {
  filter: "filter", tab: "tab", collection: "collection",
  wishlist: "online", store: "online", composite: "composite", external: "external",
};

function shelfTypeBucket(s: ShelfStatInput): string {
  if (s.kind === "smart") return "smart";
  return SHELF_TYPE_BUCKET[s.sourceType] ?? "other";
}

interface ShelfAcc {
  regular: number; smart: number; enabled: number; hidden: number;
  featured: number; fullPage: number; decorative: number; slotsTotal: number;
  byType: Record<string, number>;
}

function addShelf(acc: ShelfAcc, s: ShelfStatInput): void {
  if (s.kind === "smart") acc.smart++; else acc.regular++;
  if (s.enabled) acc.enabled++;
  if (s.hidden) acc.hidden++;
  if (s.featured) acc.featured++;
  if (s.fullPage) acc.fullPage++;
  if (s.decorative) acc.decorative++;
  if (s.enabled && !s.hidden) acc.slotsTotal += s.limit;
  const b = shelfTypeBucket(s);
  acc.byType[b] = (acc.byType[b] ?? 0) + 1;
}

export function computeShelfStatistics(shelves: ShelfStatInput[]): LibraryStat[] {
  const acc: ShelfAcc = { regular: 0, smart: 0, enabled: 0, hidden: 0, featured: 0, fullPage: 0, decorative: 0, slotsTotal: 0, byType: {} };
  for (const s of shelves) addShelf(acc, s);
  const { regular, smart, enabled, hidden, featured, fullPage, decorative, slotsTotal, byType } = acc;
  const total = shelves.length;
  const visible = shelves.filter((s) => s.enabled && !s.hidden).length;
  const slotsAvg = visible > 0 ? Math.round(slotsTotal / visible) : 0;

  const out: LibraryStat[] = [
    { id: "shelves_total",     label: "Total shelves",      value: total,      category: "shelves" },
    { id: "shelves_regular",   label: "Regular shelves",    value: regular,    category: "shelves" },
    { id: "shelves_smart",     label: "Smart shelves",      value: smart,      category: "shelves" },
    { id: "shelves_enabled",   label: "Enabled",            value: enabled,    category: "shelves" },
    { id: "shelves_hidden",    label: "Hidden",             value: hidden,     category: "shelves" },
    { id: "shelf_slots_total", label: "Total card slots",   value: slotsTotal, category: "shelves" },
    { id: "shelf_slots_avg",   label: "Avg slots / shelf",  value: slotsAvg,   category: "shelves" },
    { id: "cards_featured",    label: "Featured shelves",   value: featured,   category: "card_types" },
    { id: "cards_full_page",   label: "Full-page shelves",  value: fullPage,   category: "card_types" },
    { id: "cards_decorative",  label: "Decorative shelves", value: decorative, category: "card_types" },
  ];
  for (const b of ["filter", "tab", "collection", "online", "composite", "external", "smart", "other"]) {
    if (byType[b]) out.push({ id: `shelf_type_${b}`, label: `${b} shelves`, value: byType[b], category: "shelf_types" });
  }
  return out;
}

/* ── Over-time history ──────────────────────────────────────────────── */

export interface ShelfSnapshot { date: string; shelves: number; games: number }

// Append today's snapshot (one per calendar day), newest last, capped.
export function appendSnapshot(history: ShelfSnapshot[], today: ShelfSnapshot, cap = 90): ShelfSnapshot[] {
  const out = history.filter((h) => h.date !== today.date);
  out.push(today);
  return out.slice(-cap);
}

export function summarizeHistory(history: ShelfSnapshot[]): LibraryStat[] {
  if (history.length === 0) return [];
  const avg = (key: "shelves" | "games") =>
    Math.round(history.reduce((a, h) => a + (h[key] || 0), 0) / history.length);
  return [
    { id: "history_days",       label: "Days tracked",  value: history.length,  category: "over_time" },
    { id: "history_avg_shelves",label: "Avg shelves",   value: avg("shelves"),  category: "over_time" },
    { id: "history_avg_games",  label: "Avg games",     value: avg("games"),    category: "over_time" },
  ];
}

/* ── Suggestions derived from statistics ────────────────────────────── */

export interface StatSuggestion {
  id: string;
  messageKey: string;
  params: Record<string, string | number>;
  templateId?: string;
}

function statValue(stats: LibraryStat[], id: string): number {
  const e = stats.find((s) => s.id === id);
  return typeof e?.value === "number" ? e.value : 0;
}

// Turn the raw numbers into at most a few actionable hints. Pure: the UI
// localizes `messageKey` with `params` and wires `templateId` to a shelf.
export function deriveSuggestions(lib: LibraryStat[], shelf: LibraryStat[]): StatSuggestion[] {
  const out: StatSuggestion[] = [];
  const neverPlayed = statValue(lib, "never_played_games");
  const updates = statValue(lib, "updates_pending");
  const verified = statValue(lib, "deck_verified");
  const totalShelves = statValue(shelf, "shelves_total");

  if (totalShelves === 0) {
    out.push({ id: "first_shelf", messageKey: "stat_suggestion_first_shelf", params: {}, templateId: "favorites" });
  }
  if (neverPlayed >= 10) {
    out.push({ id: "backlog", messageKey: "stat_suggestion_backlog", params: { count: neverPlayed }, templateId: "never_played" });
  }
  if (verified >= 10) {
    out.push({ id: "deck_verified", messageKey: "stat_suggestion_deck_verified", params: { count: verified }, templateId: "deck_verified" });
  }
  if (updates > 0) {
    out.push({ id: "updates", messageKey: "stat_suggestion_updates", params: { count: updates }, templateId: "awaiting_update" });
  }
  return out.slice(0, 5);
}
