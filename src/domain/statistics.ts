// Pure statistics aggregation — no Steam APIs, no side-effects. The
// adapter in src/steam/statistics.ts feeds it real data.

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
  decorativeCards: number;
  gapCards: number;
  linkedCards: number;
}

// Maps a concrete source type onto the bucket shown in "by shelf type".
// wishlist + store stay distinct so online shelves surface individually.
const SHELF_TYPE_BUCKET: Record<string, string> = {
  filter: "filter", tab: "tab", collection: "collection",
  wishlist: "wishlist", store: "store", composite: "composite", external: "external",
};

const SHELF_TYPE_ORDER = ["filter", "tab", "collection", "wishlist", "store", "composite", "external", "smart", "other"];

function shelfTypeBucket(s: ShelfStatInput): string {
  if (s.kind === "smart") return "smart";
  return SHELF_TYPE_BUCKET[s.sourceType] ?? "other";
}

interface ShelfAcc {
  regular: number; smart: number; enabled: number; hidden: number;
  featured: number; fullPage: number; slotsTotal: number;
  decorativeCards: number; gapCards: number; linkedCards: number;
  byType: Record<string, number>;
}

function addShelf(acc: ShelfAcc, s: ShelfStatInput): void {
  if (s.kind === "smart") acc.smart++; else acc.regular++;
  if (s.enabled) acc.enabled++;
  if (s.hidden) acc.hidden++;
  if (s.featured) acc.featured++;
  if (s.fullPage) acc.fullPage++;
  if (s.enabled && !s.hidden) acc.slotsTotal += s.limit;
  acc.decorativeCards += s.decorativeCards;
  acc.gapCards += s.gapCards;
  acc.linkedCards += s.linkedCards;
  const b = shelfTypeBucket(s);
  acc.byType[b] = (acc.byType[b] ?? 0) + 1;
}

export function computeShelfStatistics(shelves: ShelfStatInput[]): LibraryStat[] {
  const acc: ShelfAcc = { regular: 0, smart: 0, enabled: 0, hidden: 0, featured: 0, fullPage: 0, slotsTotal: 0, decorativeCards: 0, gapCards: 0, linkedCards: 0, byType: {} };
  for (const s of shelves) addShelf(acc, s);
  const { regular, smart, enabled, hidden, featured, fullPage, slotsTotal, decorativeCards, gapCards, linkedCards, byType } = acc;
  const total = shelves.length;
  const visible = shelves.filter((s) => s.enabled && !s.hidden).length;
  const slotsAvg = visible > 0 ? Math.round(slotsTotal / visible) : 0;

  const out: LibraryStat[] = [
    { id: "shelves_total",     label: "Total shelves",      value: total,      category: "shelves" },
    { id: "shelves_regular",   label: "Regular shelves",    value: regular,    category: "shelves" },
    { id: "shelves_smart",     label: "Smart shelves",      value: smart,      category: "shelves" },
    { id: "shelves_enabled",   label: "Enabled",            value: enabled,    category: "shelves" },
    { id: "shelves_hidden",    label: "Hidden",             value: hidden,     category: "shelves" },
    { id: "shelves_featured",  label: "Featured shelves",   value: featured,   category: "shelves" },
    { id: "shelves_full_page", label: "Full-page shelves",  value: fullPage,   category: "shelves" },
    { id: "shelf_slots_total", label: "Total card slots",   value: slotsTotal, category: "shelves" },
    { id: "shelf_slots_avg",   label: "Avg slots / shelf",  value: slotsAvg,   category: "shelves" },
  ];
  // "By card type" counts actual cards, not shelves.
  for (const [id, value] of [["decorative_cards", decorativeCards], ["gap_cards", gapCards], ["linked_cards", linkedCards]] as const) {
    if (value) out.push({ id, label: id, value, category: "card_types" });
  }
  for (const b of SHELF_TYPE_ORDER) {
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
  templateId?: string; // regular SHELF_TEMPLATES id
  smartMode?: string;  // smart-shelf mode
}

// seed = rotation seed (day index); exclude = template ids/modes already present.
export interface SuggestionContext {
  seed?: number;
  smartEnabled?: boolean;
  exclude?: ReadonlyArray<string>;
  max?: number;
}

function statValue(stats: LibraryStat[], id: string): number {
  const e = stats.find((s) => s.id === id);
  return typeof e?.value === "number" ? e.value : 0;
}

// Rotate a window of `n` items starting at `seed` so the visible subset
// varies between seeds but is stable for a given one.
function rotateWindow<T>(arr: T[], seed: number, n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const start = ((seed % arr.length) + arr.length) % arr.length;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[(start + i) % arr.length]);
  return out;
}

function regularCandidates(lib: LibraryStat[], shelf: LibraryStat[]): StatSuggestion[] {
  const out: StatSuggestion[] = [];
  const add = (cond: boolean, id: string, reason: string, count: number, templateId: string) => {
    if (cond) out.push({ id, messageKey: reason, params: count ? { count } : {}, templateId });
  };
  add(statValue(shelf, "shelves_total") === 0, "first_shelf", "stat_suggestion_first_shelf", 0, "favorites");
  add(statValue(lib, "never_played_games") >= 10, "backlog", "stat_suggestion_backlog", statValue(lib, "never_played_games"), "never_played");
  add(statValue(lib, "deck_verified") >= 10, "deck_verified", "stat_suggestion_deck_verified", statValue(lib, "deck_verified"), "deck_verified");
  add(statValue(lib, "deck_playable") >= 10, "deck_playable", "stat_suggestion_deck_playable", statValue(lib, "deck_playable"), "deck_playable");
  add(statValue(lib, "updates_pending") > 0, "updates", "stat_suggestion_updates", statValue(lib, "updates_pending"), "awaiting_update");
  add(statValue(lib, "non_steam_games") >= 5, "non_steam", "stat_suggestion_non_steam", statValue(lib, "non_steam_games"), "non_steam");
  add(statValue(lib, "favorite_games") >= 3, "favorites", "stat_suggestion_favorites", statValue(lib, "favorite_games"), "favorites");
  add(statValue(lib, "recently_played_7d") >= 3, "recent", "stat_suggestion_recent", statValue(lib, "recently_played_7d"), "recent");
  add(statValue(lib, "played_games") >= 5, "most_played", "stat_suggestion_most_played", statValue(lib, "played_games"), "most_played");
  return out;
}

function smartCandidates(lib: LibraryStat[]): StatSuggestion[] {
  const out: StatSuggestion[] = [];
  const add = (cond: boolean, id: string, reason: string, count: number, smartMode: string) => {
    if (cond) out.push({ id, messageKey: reason, params: count ? { count } : {}, smartMode });
  };
  const deck = statValue(lib, "deck_verified") + statValue(lib, "deck_playable");
  add(statValue(lib, "never_played_games") >= 10, "smart_backlog", "stat_suggestion_backlog", statValue(lib, "never_played_games"), "best_unplayed");
  add(deck >= 10, "smart_deck", "stat_suggestion_deck_verified", deck, "deck_picks");
  add(statValue(lib, "recently_played_30d") >= 5, "smart_recent", "stat_suggestion_recent", statValue(lib, "recently_played_30d"), "recently_played");
  add(statValue(lib, "played_games") >= 10, "smart_quick", "stat_suggestion_most_played", statValue(lib, "played_games"), "quick_play");
  return out;
}

// Contextual + rotative suggestions: heuristic-gated (can be empty),
// rotating by `seed` so different valid templates surface over time. Pure;
// the UI localizes `messageKey` and applies `templateId` / `smartMode`.
export function deriveSuggestions(lib: LibraryStat[], shelf: LibraryStat[], ctx: SuggestionContext = {}): StatSuggestion[] {
  const { seed = 0, smartEnabled = false, exclude = [], max = 5 } = ctx;
  let pool = regularCandidates(lib, shelf);
  if (smartEnabled) pool = pool.concat(smartCandidates(lib));
  pool = pool.filter((c) => !exclude.includes(c.templateId ?? c.smartMode ?? c.id));
  const pinned = pool.filter((c) => c.id === "first_shelf");
  const rest = pool.filter((c) => c.id !== "first_shelf");
  return pinned.concat(rotateWindow(rest, seed, Math.max(0, max - pinned.length)));
}
