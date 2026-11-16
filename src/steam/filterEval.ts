import { APP_STATUS_GROUPS, EAppDisplayStatus } from "./appDisplayStatus";
import { type FilterGroup, type FilterItem, isKnownFilterType } from "../types";
import { compatCategoryForFamily } from "../domain/deviceProfile";
import { evaluateExternalFilter, hasExternalFilterType, isInternalFilterType, toPublicAppMeta } from "../core/pluginApi";
import { getDeviceProfile, getLibraryCategoryOf, getLibraryIdOf } from "../runtime/deviceState";
import { type AppOverview, appIdOf, appNameOf, isFavoriteOf, isHiddenOf, isInstalledOf, isNonSteamOf, lastPlayedOf } from "./appOverview";
import { getAppDeveloperCached, getAppPublisherCached } from "./publisherDeveloper";
import { FILTER_V3_EVALUATORS } from "./v3Extensions";

export function isDeckCompatMatch(cat: number | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const map: Record<string, number[]> = {
    verified: [3], playable: [2], unsupported: [1], unknown: [0]
  };
  const cats = allowed.flatMap((k) => map[k] ?? []);
  if (cats.length === 0) return true;
  return cat != null && cats.includes(cat);
}

// SteamOS compat uses the same 0..3 scale as Deck compat.
function isSteamOsCompatMatch(cat: number | undefined, allowed: string[] | undefined): boolean {
  return isDeckCompatMatch(cat, allowed);
}

export type FilterEvalContext = {
  collectionAppIds: Map<string, Set<number>>;
};

type FilterEvaluator = (item: FilterItem, app: AppOverview, ctx?: FilterEvalContext) => boolean;

function evalHidden(item: FilterItem, app: AppOverview): boolean {
  const mode = item.params?.mode ?? "exclude";
  if (mode === "only") return isHiddenOf(app);
  if (mode === "exclude") return !isHiddenOf(app);
  return true;
}

// Non-Steam shortcuts have no per-client data, so they only match `local`.
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
  // An empty `libraryIds` means not narrowed yet; a missing one is an older single-category save.
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
  // Non-Steam shortcuts usually carry no display_status, so derive it from the install check.
  if ((ds === undefined || ds === 0) && isNonSteamOf(app)) {
    ds = isInstalledOf(app) ? EAppDisplayStatus.ReadyToLaunch : EAppDisplayStatus.ReadyToInstall;
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

function evalRecentlyActive(item: FilterItem, app: AppOverview): boolean {
  const minMinutes = Number(item.params?.minMinutes ?? 1);
  const recent = Number(app.playtime_last_two_weeks ?? (app as any).minutes_playtime_last_two_weeks ?? 0);
  return recent >= minMinutes;
}

// Never-played titles are untouched, not neglected.
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
  if (!colId) return true;
  // A missing set means the lookup failed; matching everything would leak the whole library.
  const appSet = ctx?.collectionAppIds.get(colId);
  return appSet ? appSet.has(app.appid) : false;
}

function childrenOf(item: FilterItem): FilterItem[] {
  return Array.isArray(item.params?.children) ? (item.params.children as FilterItem[]) : [];
}

function evalWeighted(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const threshold = Number(item.params?.threshold ?? 1);
  let sum = 0;
  for (const child of childrenOf(item)) if (evaluateFilterItem(child, app, ctx)) sum += Number((child as any).weight ?? 1);
  return sum >= threshold;
}

function evalAnyChild(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  return childrenOf(item).some((child) => evaluateFilterItem(child, app, ctx));
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
  const n = Number(app.controller_support ?? 0);
  const min = Number(item.params?.min ?? 1);
  return Number.isFinite(n) && n >= min;
}

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

// Parsed once per raw string; re-parsing per app blocked the UI for seconds.
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

// The cache stores minor units (cents); the params are whole units.
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

// Desktop clients never set `available_on_current_platform` to false, so undefined is unreliable there.
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
  weightedFilter:         evalWeighted,
  priorityFilter:         evalAnyChild,
  exclusionGroup:         (item, app, ctx) => !evalAnyChild(item, app, ctx),
  developer:              evalDeveloper,
  publisher:              evalPublisher,
  appIdList:              evalAppIdList,
  cloudAvailable:         (_i, app) => app.cloud_available === true,
  controllerSupport:      evalControllerSupport,
  systemCompatibility:    (_i, app) => {
    // Never write Steam's own field; store pages read it.
    let v = app.available_on_current_platform;
    if (typeof v !== "boolean") v = (app as any).__ds_available_on_platform;
    if (typeof v === "boolean") return v;
    return !PLATFORM_LOCAL_ONESIDED;
  },
  remotePlayLocation:     evalRemotePlay,
  libraryLocation:        evalLibraryLocation,
  shortcutType:           evalShortcutType,
  discount:               evalDiscount,
  priceRange:             evalPriceRange,
  friendsPlayingNow:      evalFriendsPlayingNow,
  friendsPlayedRecently:  evalFriendsPlayedRecently,
};

// Resolvers refuse unknown types first, so this never widens a shelf.
function evalExternal(item: FilterItem, app: AppOverview): boolean {
  try {
    if (hasExternalFilterType(item.type)) {
      return evaluateExternalFilter(item.type, toPublicAppMeta(app), item.params ?? {});
    }
  } catch {}
  return false;
}

function isEvaluable(type: string): boolean {
  if (isKnownFilterType(type)) return true;
  return hasExternalFilterType(type) && !isInternalFilterType(type);
}

export function flattenItems(items: unknown, out: FilterItem[] = []): FilterItem[] {
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    out.push(item as FilterItem);
    flattenItems((item as FilterItem).params?.items, out);
    flattenItems((item as FilterItem).params?.children, out);
  }
  return out;
}

export function unsupportedFilterType(group: FilterGroup | null | undefined): string | null {
  const bad = flattenItems(group?.items).find((item) => !isEvaluable(String(item.type ?? "")));
  return bad ? String(bad.type ?? "") || "(empty)" : null;
}

export function evaluateFilterItem(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  // Looked up per call: the catalog module sits in an import cycle with this one.
  const evaluator = FILTER_EVALUATORS[item.type] ?? FILTER_V3_EVALUATORS[item.type] ?? evalExternal;
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
