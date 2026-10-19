import { APP_STATUS_GROUPS, EAppDisplayStatus } from "./appDisplayStatus";
import type { FilterGroup, FilterItem } from "../types";
import { compatCategoryForFamily } from "../domain/deviceProfile";
import { evaluateExternalFilter, hasExternalFilterType, toPublicAppMeta } from "../core/pluginApi";
import { getDeviceProfile, getLibraryCategoryOf, getLibraryIdOf } from "../runtime/deviceState";
import { type AppOverview, appIdOf, appNameOf, isFavoriteOf, isHiddenOf, isInstalledOf, isNonSteamOf, lastPlayedOf } from "./appOverview";
import { getAppDeveloperCached, getAppPublisherCached } from "./publisherDeveloper";

/* Filter evaluation: one evaluator per filter type, the price-cache reads the price filters need, and the group evaluation (and/or, inverted items). */

export function isDeckCompatMatch(cat: number | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const map: Record<string, number[]> = {
    verified: [3], playable: [2], unsupported: [1], unknown: [0]
  };
  const cats = allowed.flatMap((k) => map[k] ?? []);
  if (cats.length === 0) return true;
  return cat != null && cats.includes(cat);
}

// SteamOS compat uses the SAME 0..3 category scale as Deck compat (verified=3,
// playable=2, unsupported=1, unknown=0) — confirmed live against
// `steam_os_compat_category` itself. Reuse the identical mapping.
function isSteamOsCompatMatch(cat: number | undefined, allowed: string[] | undefined): boolean {
  return isDeckCompatMatch(cat, allowed);
}

// Pre-fetched data passed into the synchronous filter evaluator so async
// collection lookups can happen before evaluation begins.
export type FilterEvalContext = {
  collectionAppIds: Map<string, Set<number>>;
};

// Per-type filter evaluators (dispatch table).
type FilterEvaluator = (item: FilterItem, app: AppOverview, ctx?: FilterEvalContext) => boolean;

function evalHidden(item: FilterItem, app: AppOverview): boolean {
  const mode = item.params?.mode ?? "exclude";
  if (mode === "only") return isHiddenOf(app);
  if (mode === "exclude") return !isHiddenOf(app);
  return true;
}

/* Remote Play install location. `remote-only` (installed elsewhere, not here)
   powers a "play-from-remote" shelf. Steam apps only — non-Steam shortcuts have
   no per-client data (installed_remote undefined), so they only match `local`. */
const REMOTE_PLAY_MODES: Record<string, (local: boolean, remote: boolean) => boolean> = {
  "local":       (local) => local,
  "local-only":  (local, remote) => local && !remote,
  "remote":      (_local, remote) => remote,
  "remote-only": (local, remote) => remote && !local,
  "both":        (local, remote) => local && remote,
};

function evalRemotePlay(item: FilterItem, app: AppOverview): boolean {
  const mode = String(item.params?.mode ?? "remote-only");
  const local = app.installed === true;
  const remote = app.installed_remote === true;
  const check = REMOTE_PLAY_MODES[mode] ?? REMOTE_PLAY_MODES["remote-only"];
  return check(local, remote);
}

function evalLibraryLocation(item: FilterItem, app: AppOverview): boolean {
  /* New shape: `libraryIds` (multi-select of specific libraries, mixing
     e.g. one SD card + one USB drive) — present (even empty) means the
     item was saved by the granular editor. Empty = not yet narrowed down,
     so no restriction rather than matching nothing. Absent entirely means
     an older single-`category` save (pre-granularity) — kept working as-is. */
  const libraryIds = Array.isArray(item.params?.libraryIds) ? (item.params!.libraryIds as string[]) : null;
  if (libraryIds) {
    if (!libraryIds.length) return true;
    const libId = getLibraryIdOf(appIdOf(app));
    return libId !== null && libraryIds.includes(libId);
  }
  const category = String(item.params?.category ?? "internal");
  return getLibraryCategoryOf(appIdOf(app)) === category;
}

function evalAppStatus(item: FilterItem, app: AppOverview): boolean {
  const groups: string[] = Array.isArray(item.params?.groups) ? item.params!.groups : [];
  let ds = app.display_status as number | undefined;
  /* Non-Steam shortcuts (e.g. Unifideck) usually carry no per-client
     display_status, so a status filter would match nothing. Synthesize
     installed / not-installed from the install heuristic so the installed_idle
     and not_installed groups work for them too. */
  if ((ds === undefined || ds === 0) && isNonSteamOf(app)) {
    ds = isInstalledOf(app) ? EAppDisplayStatus.Installed : EAppDisplayStatus.NotInstalled;
  }
  return groups.some((g) => {
    const statuses = APP_STATUS_GROUPS[g as keyof typeof APP_STATUS_GROUPS];
    return statuses ? statuses.includes(ds as number) : false;
  });
}

function evalIsNew(_item: FilterItem, app: AppOverview): boolean {
  const a = app as any;
  const added = Number(a.rt_purchased_time ?? a.rt_recent_activity_time ?? a.user_added_ts ?? a.rt_store_asset_mtime ?? 0);
  if (!added || !Number.isFinite(added)) return false;
  const addedMs = added < 1e12 ? added * 1000 : added;
  return (Date.now() - addedMs) < 14 * 24 * 60 * 60 * 1000;
}

function evalPlayedWithinDays(item: FilterItem, app: AppOverview): boolean {
  const days = Number(item.params?.days ?? 7);
  const now = Math.floor(Date.now() / 1000);
  const min = now - Math.floor(days * 86400);
  return lastPlayedOf(app) >= min;
}

function evalPlaytimeRange(item: FilterItem, app: AppOverview): boolean {
  const minHours: number | undefined = item.params?.minHours;
  const maxHours: number | undefined = item.params?.maxHours;
  const playtimeMinutes = app.playtime_forever ?? 0;
  if (typeof minHours === "number" && playtimeMinutes < minHours * 60) return false;
  if (typeof maxHours === "number" && playtimeMinutes > maxHours * 60) return false;
  return true;
}

// Recent activity — Steam's rolling two-week playtime (current rotation).
function evalRecentlyActive(item: FilterItem, app: AppOverview): boolean {
  const minMinutes = Number(item.params?.minMinutes ?? 1);
  const recent = Number(app.playtime_last_two_weeks ?? (app as any).minutes_playtime_last_two_weeks ?? 0);
  return recent >= minMinutes;
}

/* Neglected — played before but not in the last N days. Distinct from inverting
   playedWithinDays: never-played titles (a last-launch timestamp of 0) are NOT
   neglected, they are simply untouched, so they never match here. */
function evalNeglected(item: FilterItem, app: AppOverview): boolean {
  const days = Number(item.params?.days ?? 30);
  const last = lastPlayedOf(app);
  if (last <= 0) return false;
  const cutoff = Math.floor(Date.now() / 1000) - Math.floor(days * 86400);
  return last < cutoff;
}

function evalNameIncludes(item: FilterItem, app: AppOverview): boolean {
  const text = String(item.params?.text ?? "").toLowerCase();
  return !text || appNameOf(app).toLowerCase().includes(text);
}

function evalNameRegex(item: FilterItem, app: AppOverview): boolean {
  const pattern = String(item.params?.pattern ?? "");
  if (!pattern) return true;
  try { return new RegExp(pattern, "i").test(appNameOf(app)); }
  catch { return true; }
}

function evalCollection(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const colId = String(item.params?.collectionId ?? "").trim();
  if (!colId) return true; // half-configured: don't restrict
  /* Missing entry = lookup failed or returned 0 apps. Exclude (
     pass-through here previously leaked the entire library when Bazzite-shaped
     collectionStore returned empty). */
  const appSet = ctx?.collectionAppIds.get(colId);
  return appSet ? appSet.has(app.appid) : false;
}

function evalMerge(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const subItems: FilterItem[] = Array.isArray(item.params?.items) ? (item.params.items as FilterItem[]) : [];
  const subMode = ((item.params?.mode ?? "and") as "and" | "or");
  return evaluateFilterGroup({ mode: subMode, items: subItems }, [app], ctx).length > 0;
}

function evalDeveloper(item: FilterItem, app: AppOverview): boolean {
  const selected: string[] = Array.isArray(item.params?.developers) ? item.params.developers : [];
  if (!selected.length) return true;
  const dev = getAppDeveloperCached(app.appid);
  return selected.some((d) => d.toLowerCase() === dev.toLowerCase());
}

function evalPublisher(item: FilterItem, app: AppOverview): boolean {
  const selected: string[] = Array.isArray(item.params?.publishers) ? item.params.publishers : [];
  if (!selected.length) return true;
  const pub = getAppPublisherCached(app.appid);
  return selected.some((p) => p.toLowerCase() === pub.toLowerCase());
}

function evalAppIdList(item: FilterItem, app: AppOverview): boolean {
  const ids: number[] = Array.isArray(item.params?.appIds) ? item.params.appIds.map(Number).filter(Number.isFinite) : [];
  if (!ids.length) return true;
  return ids.includes(app.appid);
}

function evalControllerSupport(item: FilterItem, app: AppOverview): boolean {
  // nControllerSupport: 0 = none, 1 = partial, 2 = full
  const n = Number(app.controller_support ?? 0);
  const min = Number(item.params?.min ?? 1);
  return Number.isFinite(n) && n >= min;
}

// EAppType bit-flag enum (Steam client). Lookup table replaces the
// linear if-chain so adding a new kind drops to "one row".
const APP_TYPE_BY_KIND: Record<string, number> = {
  software: 2, application: 2,
  demo: 8, dlc: 32, guide: 64, driver: 128, config: 256, hardware: 512,
  video: 2048, music: 8192, soundtrack: 8192, comic: 32768, beta: 65536,
};

const NON_TOOL_APP_TYPES = new Set<number>([1, 2, 8, 32, 64, 128, 256, 512, 2048, 8192, 32768, 65536]);

function matchesShortcutKind(kind: string, app: AppOverview): boolean {
  const nonSteam = isNonSteamOf(app);
  if (kind === "link") return nonSteam;
  if (nonSteam) return false;
  const t = app.app_type;
  if (kind === "game") return t === undefined || t === 1;
  if (kind === "tool") {
    // Tool matches explicit type 4 OR any non-1/2/8/32/.../65536 Steam app
    // (legacy "anything not recognised" semantics).
    return t === 4 || (t !== undefined && !NON_TOOL_APP_TYPES.has(t));
  }
  const expected = APP_TYPE_BY_KIND[kind];
  return expected !== undefined && t === expected;
}

function evalShortcutType(item: FilterItem, app: AppOverview): boolean {
  const kinds: string[] = Array.isArray(item.params?.kinds) ? item.params.kinds : ["game"];
  return kinds.some((k) => matchesShortcutKind(k, app));
}

type PriceCacheEntry = { discount?: number; unpriced?: boolean; price?: number; currency?: string };

/* Memoise the parsed price cache keyed on the raw string: evalDiscount /
   evalPriceRange call this once per app, and re-parsing the whole cache each time
   blocked the UI ~2 s per shelf-resolution pass (100+ cards). One parse serves the
   pass; any write (raw string changes) self-invalidates it — no staleness. */
let _priceEntriesRaw: string | null = null;

let _priceEntriesParsed: Record<number, { ts: number; data: PriceCacheEntry }> | null = null;

function readPriceCacheEntry(appid: number): PriceCacheEntry | null | "bootstrap" {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("ds-price-cache-v1");
    if (raw !== _priceEntriesRaw) {
      _priceEntriesParsed = raw ? JSON.parse(raw) : null;
      _priceEntriesRaw = raw;
    }
    if (!_priceEntriesParsed) return "bootstrap";
    return _priceEntriesParsed[appid]?.data ?? null;
  } catch { return null; }
}

/* Price bounds in the user's own currency (the cache stores the final price in
   the store's minor unit — cents — localised via appdetails). min/max params are
   in whole currency units; unpriced/free titles never match. */
function priceInBounds(entry: PriceCacheEntry, item: FilterItem): boolean {
  if (entry.unpriced === true) return false;
  const price = Number(entry.price ?? 0) / 100;
  const min = item.params?.minPrice;
  const max = item.params?.maxPrice;
  if (min != null && price < Number(min)) return false;
  if (max != null && price > Number(max)) return false;
  return true;
}

function evalPriceRange(item: FilterItem, app: AppOverview): boolean {
  const appid = appIdOf(app);
  if (!appid) return false;
  const entry = readPriceCacheEntry(appid);
  if (entry === "bootstrap") return true;
  return !!entry && priceInBounds(entry, item);
}

function discountInBounds(entry: { discount?: number; unpriced?: boolean }, item: FilterItem): boolean {
  if (entry.unpriced === true) return false;
  const disc = entry.discount ?? 0;
  const min = Number(item.params?.minDiscount ?? 0);
  const max = Number(item.params?.maxDiscount ?? 100);
  return disc >= min && disc <= max;
}

function evalDiscount(item: FilterItem, app: AppOverview): boolean {
  const appid = appIdOf(app);
  if (!appid) return false;
  const entry = readPriceCacheEntry(appid);
  if (entry === "bootstrap") return true;
  return !!entry && discountInBounds(entry, item);
}

function evalFriendsPlayingNow(_item: FilterItem, app: AppOverview): boolean {
  try {
    const appid = appIdOf(app);
    if (!appid) return false;
    const { getFriendsPlayingAppIds } = require("../runtime/friendsState") as typeof import("../runtime/friendsState");
    return getFriendsPlayingAppIds().has(appid);
  } catch { return false; }
}

function evalFriendsPlayedRecently(item: FilterItem, app: AppOverview): boolean {
  try {
    const appid = appIdOf(app);
    if (!appid) return false;
    const days = Number(item.params?.days ?? 14);
    if (!Number.isFinite(days) || days <= 0) return false;
    const { getFriendsRecentlyPlayedAppIds } = require("../runtime/friendsState") as typeof import("../runtime/friendsState");
    return getFriendsRecentlyPlayedAppIds().has(appid);
  } catch { return false; }
}

/* Desktop Steam clients (macOS/Windows) never mark a non-native game's
   `available_on_current_platform` as `false` — only `true` or undefined — so an
   undefined value there is unreliable (unlike the Deck, where `false` IS given). */
const PLATFORM_LOCAL_ONESIDED = (() => {
  try { return /mac|win/i.test((globalThis as any).navigator?.platform ?? ""); } catch { return false; }
})();

const FILTER_EVALUATORS: Record<string, FilterEvaluator> = {
  installed:              (_i, app) => isInstalledOf(app),
  favorites:              (_i, app) => isFavoriteOf(app),
  nonSteam:               (_i, app) => isNonSteamOf(app),
  hidden:                 evalHidden,
  updatePending:          (_i, app) => app.update_pending === true,
  appStatus:              evalAppStatus,
  isNew:                  evalIsNew,
  deckCompatibility:      (item, app) => isDeckCompatMatch(app.deck_compatibility_category, item.params?.levels ?? []),
  // The rating of the device in use (Deck / Machine / Frame); everything else falls back to the Deck one.
  deviceCompatibility:    (item, app) => isDeckCompatMatch(compatCategoryForFamily(getDeviceProfile().family, {
    deckCompatCategory: app.deck_compatibility_category, machineCompatCategory: app.machine_compatibility_category, frameCompatCategory: app.frame_compatibility_category,
  }), item.params?.levels ?? []),
  steamosCompatibility:   (item, app) => isSteamOsCompatMatch(app.steamos_compatibility_category, item.params?.levels ?? []),
  machineCompatibility:   (item, app) => isDeckCompatMatch(app.machine_compatibility_category, item.params?.levels ?? []),
  frameCompatibility:     (item, app) => isDeckCompatMatch(app.frame_compatibility_category, item.params?.levels ?? []),
  playedWithinDays:       evalPlayedWithinDays,
  playtimeRange:          evalPlaytimeRange,
  recentlyActive:         evalRecentlyActive,
  neglected:              evalNeglected,
  nameIncludes:           evalNameIncludes,
  nameRegex:              evalNameRegex,
  collection:             evalCollection,
  merge:                  evalMerge,
  developer:              evalDeveloper,
  publisher:              evalPublisher,
  appIdList:              evalAppIdList,
  cloudAvailable:         (_i, app) => app.cloud_available === true,
  controllerSupport:      evalControllerSupport,
  systemCompatibility:    (_i, app) => {
    // Steam's own field first; then our private store-derived fill (macOS, where
    // Steam leaves it undefined). We never write Steam's field — store pages read it.
    let v = app.available_on_current_platform;
    if (typeof v !== "boolean") v = (app as any).__ds_available_on_platform;
    if (typeof v === "boolean") return v;
    return !PLATFORM_LOCAL_ONESIDED; // undefined: include on the Deck, exclude on desktop
  },
  remotePlayLocation:     evalRemotePlay,
  libraryLocation:        evalLibraryLocation,
  shortcutType:           evalShortcutType,
  discount:               evalDiscount,
  priceRange:             evalPriceRange,
  friendsPlayingNow:      evalFriendsPlayingNow,
  friendsPlayedRecently:  evalFriendsPlayedRecently,
};

function evalDefault(item: FilterItem, app: AppOverview): boolean {
  /* first-party Filter v3 evaluators live in a
     sibling module to keep `evaluateFilterItem` lean. Lookup hits
     before falling through to external plugin filters; v3 ids are
     first-party so their handler must take precedence. */
  try {
    const { FILTER_V3_EVALUATORS } = require("./v3Extensions") as typeof import("./v3Extensions");
    const v3 = FILTER_V3_EVALUATORS[item.type as string];
    // Pass the full evaluator so composite v3 filters can evaluate children of
    // ANY type (base + v3) without importing this module back.
    if (v3) return v3(item, app, (child, childApp) => evaluateFilterItem(child, childApp));
  } catch { /* fall through */ }
  // External plugin filter or unknown type. Unknown + unregistered →
  // pass-through (true) so an unregistered plugin filter doesn't hide
  // the user's entire library.
  try {
    if (hasExternalFilterType(item.type as string)) {
      return evaluateExternalFilter(item.type as string, toPublicAppMeta(app), item.params ?? {});
    }
  } catch { /* fall through */ }
  return true;
}

export function evaluateFilterItem(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const evaluator = FILTER_EVALUATORS[item.type] ?? evalDefault;
  const result = evaluator(item, app, ctx);
  return item.inverted ? !result : result;
}

export function evaluateFilterGroup(group: FilterGroup, apps: AppOverview[], ctx?: FilterEvalContext): AppOverview[] {
  if (!group.items || group.items.length === 0) return apps;
  const mode = group.mode ?? "and";
  if (mode === "or") {
    return apps.filter((app) => group.items.some((item) => evaluateFilterItem(item, app, ctx)));
  }
  return apps.filter((app) => group.items.every((item) => evaluateFilterItem(item, app, ctx)));
}
