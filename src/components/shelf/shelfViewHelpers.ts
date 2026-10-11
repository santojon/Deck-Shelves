import type { RefObject } from "react";
import type { Shelf } from "../../types";
import type { PlatformAppMeta } from "../../runtime/platform";
import type { DeckRowItem } from "../DeckRow";
import { STEAM_STORE_BASE, STEAM_CDN_AKAMAI } from "../../constants";
import { getFrontendLib } from "../../runtime/host/decky";
import { normalizeTitleForMatch } from "../../steam/dedupe";
import { showGameMenu, buildShelfContextMenu } from "../../core/steamGameMenu";
import { saveFocusTarget } from "../../core/focusRestore";
import { triggerShelfRefresh } from "../../core/shelfRefresh";
import { invalidateRandomSortCache } from "../../steam";
import { invalidateSmartShelfCache } from "../../steam/smartShelves";
import { clearOnlineShelfCache } from "../../core/shelfActions";

// Host-parametric UI lib — resolved by the one central resolver in the host
// adapter (loader global OR `__SHELVES_HOST__.ui`), aliased locally.
const resolveFrontendLib = getFrontendLib;

const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type SteamUrlOpener = (sc: any, url: string, steamUrl?: string) => boolean;
const STEAM_URL_OPENERS: SteamUrlOpener[] = [
  (sc, _url, steamUrl) => {
    if (steamUrl && typeof sc?.URL?.ExecuteSteamURL === 'function') { sc.URL.ExecuteSteamURL(steamUrl); return true; }
    return false;
  },
  (sc, url) => {
    if (typeof sc?.System?.OpenInSystemBrowser === 'function') { sc.System.OpenInSystemBrowser(url); return true; }
    return false;
  },
  (sc, url) => {
    if (typeof sc?.WebChat?.OpenURLInClient === 'function') { sc.WebChat.OpenURLInClient(url); return true; }
    return false;
  },
];

export function openSteamStoreUrl(url: string, steamUrl?: string): void {
  try {
    const sc = (globalThis as any).SteamClient;
    for (const opener of STEAM_URL_OPENERS) { if (opener(sc, url, steamUrl)) return; }
  } catch {}
}

export function openSteamStorePage(appid: number): void {
  openSteamStoreUrl(`${STEAM_STORE_BASE}/app/${appid}/`, `steam://store/${appid}`);
}

// Parsed once per distinct cache string: this is read per online card on
// every rowItems recompute, and parsing the whole price cache each time
// measured ~270 ms per Home rebuild on-device.
let priceCacheRaw: string | null = null;
let priceCacheParsed: Record<string, any> | null = null;
function readPriceCache(): Record<string, any> | null {
  const raw = (globalThis as any).localStorage?.getItem?.('ds-price-cache-v1') ?? null;
  if (raw !== priceCacheRaw) {
    priceCacheRaw = raw;
    priceCacheParsed = raw ? JSON.parse(raw) : null;
  }
  return priceCacheParsed;
}

export function getCachedDiscount(appid: number): number | null {
  try {
    const d = readPriceCache()?.[appid]?.data?.discount;
    return typeof d === 'number' ? d : null;
  } catch { return null; }
}

// Small value-normalizing helpers — kept separate so their branches don't
// count against the caller's own complexity (each is a plain, pure read).
export function joinOrEmpty(list: unknown[] | null | undefined): string {
  return list?.join(",") ?? "";
}

export function orEmpty(value: string | undefined): string {
  return value ?? "";
}

export function orEmptyArray<T>(list: T[] | null | undefined): T[] {
  return list ?? [];
}

export function jsonOrNull(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function flag01(value: boolean | undefined): 'r1' | 'r0' {
  return value ? 'r1' : 'r0';
}

export const SHELF_CACHE_PREFIX = 'ds-shelf-cache-';
export const SHELF_CACHE_TTL_MS = 86_400_000;

export function computeShelfCacheKey(shelf: Shelf): string {
  const sortPart = shelf.sort ?? '';
  return `${SHELF_CACHE_PREFIX}${shelf.id}-${sortPart}-${orEmpty((shelf as any).manualBaseSort)}-${flag01((shelf as any).sortReverse)}-${flag01((shelf as any).manualBaseSortReverse)}`;
}

/* A shelf's cached id list expires only when that exact key is READ again, so a
   key whose shelf no longer exists — renamed, deleted, or a throwaway from a
   benchmark run — is never read and lingers forever (found 52 such keys live). */
function shelfCacheStamp(ls: any, key: string): number {
  try { return Number(JSON.parse(ls.getItem(key) || '{}')?.ts) || 0; } catch { return 0; }
}

function expiredShelfCacheKeys(ls: any, now: number): string[] {
  const doomed: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key || key.indexOf(SHELF_CACHE_PREFIX) !== 0) continue;
    const ts = shelfCacheStamp(ls, key);
    if (!ts || now - ts > SHELF_CACHE_TTL_MS) doomed.push(key);
  }
  return doomed;
}

export function pruneShelfCaches(now: number = Date.now()): number {
  let removed = 0;
  try {
    const ls = (globalThis as any).localStorage;
    if (!ls) return 0;
    for (const key of expiredShelfCacheKeys(ls, now)) {
      try { ls.removeItem(key); removed++; } catch { /* quota/private mode */ }
    }
  } catch { /* storage unavailable */ }
  return removed;
}

export function shouldSkipShelf(shelf: Shelf): boolean {
  return !shelf.enabled || shelf.hidden === true;
}

export function resolveHighlightRandom(globalHighlightRandom: boolean, shelf: Shelf): boolean {
  return globalHighlightRandom || (shelf as any).highlightRandom;
}

export function computeEffectiveSort(shelf: Shelf): { effectiveSort: string | string[] | undefined; primaryEffectiveSort: string | undefined } {
  const effectiveSort = shelf.source?.type === "filter"
    ? (((shelf.source as any).filter?.sort as string | string[] | undefined) ?? shelf.sort)
    : shelf.sort;
  // Multi-key shelves treat the first array entry as primary.
  const primaryEffectiveSort = Array.isArray(effectiveSort) ? effectiveSort[0] : effectiveSort;
  return { effectiveSort, primaryEffectiveSort };
}

/* Asc/desc inversion. When manual, the base sort's reverse flag applies
   (also accepts boolean[] aligned with a multi-key chain); otherwise the
   top-level shelf flag applies. */
function computeResolveReverse(shelf: Shelf, isManual: boolean): boolean | boolean[] {
  const rawShelfReverse = (shelf as any).sortReverse;
  const rawBaseReverse = (shelf as any).manualBaseSortReverse;
  if (isManual) return Array.isArray(rawBaseReverse) ? rawBaseReverse : !!rawBaseReverse;
  return Array.isArray(rawShelfReverse) ? rawShelfReverse : !!rawShelfReverse;
}

/* When reverse is on but no explicit sort is persisted (regular shelf
   default = "alphabetical" stored as undefined), force `alphabetical` so the
   resolver actually calls `applySortToIds` and the reverse flag has
   somewhere to apply. */
function computeResolveSort(shelf: Shelf, isManual: boolean, baseSort: string | string[], resolveReverse: boolean | boolean[]): string | string[] | undefined {
  if (isManual) return baseSort;
  return shelf.sort ?? (resolveReverse ? "alphabetical" : undefined);
}

// Filter sources keep their sort inside `source.filter.sort`, so on manual
// sort the source is cloned with `filter.sort` swapped to the base sort.
function computeResolveSource(shelf: Shelf, isManual: boolean, baseSort: string | string[]): any {
  if (isManual && shelf.source?.type === "filter") {
    return { ...shelf.source, filter: { ...(shelf.source as any).filter, sort: baseSort } };
  }
  return shelf.source;
}

export function computeResolveParams(params: { shelf: Shelf; primaryEffectiveSort: string | undefined; globalDedupeByName: boolean }): {
  resolveSource: any;
  resolveSort: string | string[] | undefined;
  resolveReverse: boolean | boolean[];
  dedupeByName: boolean;
  hiddenAppIds: number[] | undefined;
} {
  const { shelf, primaryEffectiveSort, globalDedupeByName } = params;
  const baseSort: string | string[] = (shelf as any).manualBaseSort ?? "alphabetical";
  const isManual = primaryEffectiveSort === "manual";
  const resolveReverse = computeResolveReverse(shelf, isManual);
  const resolveSort = computeResolveSort(shelf, isManual, baseSort, resolveReverse);
  const resolveSource = computeResolveSource(shelf, isManual, baseSort);
  const dedupeByName = (shelf as any).dedupeByExactName === true || globalDedupeByName;
  const hiddenAppIds: number[] | undefined = (shelf as any).hiddenAppIds?.length ? (shelf as any).hiddenAppIds : undefined;
  return { resolveSource, resolveSort, resolveReverse, dedupeByName, hiddenAppIds };
}

export function startManualRefreshIndicator(
  refreshTimerRef: RefObject<ReturnType<typeof setTimeout> | null>,
  setRefreshing: (v: boolean) => void,
): void {
  setRefreshing(true);
  if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  refreshTimerRef.current = setTimeout(() => {
    refreshTimerRef.current = null;
    setRefreshing(false);
  }, 320);
}

// Diagnostic: lets CDP inspection confirm a shelf isn't stuck re-resolving.
export function traceResolveStart(shelfId: string, gen: number, currentGen: number, cancelled: boolean): number {
  const at = Date.now();
  try {
    const g = globalThis as any;
    g.__ds_resolve_trace = g.__ds_resolve_trace || {};
    g.__ds_resolve_trace[shelfId] = { state: "started", at, gen, currentGen, cancelled };
  } catch {}
  return at;
}

export function traceResolveThen(shelfId: string, startedAt: number, gen: number, currentGen: number, cancelled: boolean, idCount: number | undefined): void {
  try {
    (globalThis as any).__ds_resolve_trace[shelfId] = { state: "then", at: Date.now(), tookMs: Date.now() - startedAt, gen, currentGen, cancelled, idCount };
  } catch {}
}

export function traceResolveCatch(shelfId: string, startedAt: number, gen: number, currentGen: number, cancelled: boolean, err: unknown): void {
  try {
    (globalThis as any).__ds_resolve_trace[shelfId] = { state: "catch", at: Date.now(), tookMs: Date.now() - startedAt, gen, currentGen, cancelled, err: String(err).slice(0, 200) };
  } catch {}
}

export function bumpResolveGenCounter(shelfId: string): void {
  try {
    const g = globalThis as any;
    if (!g.__ds_resolve_gens) g.__ds_resolve_gens = {};
    g.__ds_resolve_gens[shelfId] = (g.__ds_resolve_gens[shelfId] ?? 0) + 1;
  } catch {}
}

// Composite per-shelf exclude-owned toggles live on the online child —
// read from the first online child so render-time name-dedup applies to
// composite shelves with an online child too.
function findOwnedSourceForToggles(shelf: Shelf, isOnlineShelf: boolean, compositeHasOnlineChild: boolean): any {
  if (isOnlineShelf) return shelf.source as any;
  if (!compositeHasOnlineChild) return null;
  return (shelf.source as any).sources?.find?.((c: any) => c?.type === 'wishlist' || c?.type === 'store') ?? null;
}

function computeExcludeOwnedFlags(ownedSourceForToggles: any): { excludeOwned: boolean; excludeOwnedNonSteam: boolean } {
  const excludeOwned = !!ownedSourceForToggles && ownedSourceForToggles.excludeOwned === true;
  const excludeOwnedNonSteam = excludeOwned && ownedSourceForToggles.excludeOwnedNonSteam === true;
  return { excludeOwned, excludeOwnedNonSteam };
}

export function computeOnlineSourceFlags(params: { shelf: Shelf; sourceIncludesNonOwned: boolean }): {
  isOnlineShelf: boolean;
  compositeHasOnlineChild: boolean;
  needsExternalNames: boolean;
  ownedSourceForToggles: any;
  excludeOwned: boolean;
  excludeOwnedNonSteam: boolean;
  perShelfHideOwnedCloud: boolean | undefined;
} {
  const { shelf, sourceIncludesNonOwned } = params;
  const isOnlineShelf = shelf.source.type === 'wishlist' || shelf.source.type === 'store';
  // Composite source with at least one online child (wishlist / store): the
  // composite itself isn't `type === 'wishlist'/'store'`, but the appids it
  // returns include non-owned ones from the online child.
  const compositeHasOnlineChild = shelf.source.type === 'composite' && Array.isArray((shelf.source as any).sources)
    && (shelf.source as any).sources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store');
  const needsExternalNames = isOnlineShelf || sourceIncludesNonOwned || compositeHasOnlineChild;
  const ownedSourceForToggles = findOwnedSourceForToggles(shelf, isOnlineShelf, compositeHasOnlineChild);
  const { excludeOwned, excludeOwnedNonSteam } = computeExcludeOwnedFlags(ownedSourceForToggles);
  const perShelfHideOwnedCloud = ownedSourceForToggles?.hideOwnedNonSteamCloud;
  return { isOnlineShelf, compositeHasOnlineChild, needsExternalNames, ownedSourceForToggles, excludeOwned, excludeOwnedNonSteam, perShelfHideOwnedCloud };
}

export function computeOwnedHideFlags(params: {
  isOnlineShelf: boolean;
  compositeHasOnlineChild: boolean;
  globalHideOwned: boolean;
  excludeOwned: boolean;
  globalHideOwnedNonSteam: boolean;
  excludeOwnedNonSteam: boolean;
  perShelfHideOwnedCloud: boolean | undefined;
  globalHideOwnedCloud: boolean;
}): { shouldHideOwned: boolean; effectiveNonSteam: boolean; effectiveCloud: boolean } {
  const {
    isOnlineShelf, compositeHasOnlineChild, globalHideOwned, excludeOwned,
    globalHideOwnedNonSteam, excludeOwnedNonSteam, perShelfHideOwnedCloud, globalHideOwnedCloud,
  } = params;
  const shouldHideOwned = (isOnlineShelf || compositeHasOnlineChild) && (globalHideOwned || excludeOwned);
  const effectiveNonSteam = (globalHideOwned && globalHideOwnedNonSteam) || (excludeOwned && excludeOwnedNonSteam);
  const effectiveCloud = effectiveNonSteam && (perShelfHideOwnedCloud === true || (perShelfHideOwnedCloud === undefined && globalHideOwnedCloud));
  return { shouldHideOwned, effectiveNonSteam, effectiveCloud };
}

export function isOnlineSourceForShelf(shelf: Shelf, sourceIncludesNonOwned: boolean): boolean {
  return shelf.source.type === 'wishlist' || shelf.source.type === 'store' || sourceIncludesNonOwned
    || (shelf.source.type === 'composite' && Array.isArray((shelf.source as any).sources)
        && (shelf.source as any).sources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store'));
}

export function shouldDropOwnedItem(params: { eligibleForOwnedHide: boolean; shouldHideOwned: boolean; ownedAppIds: Set<number> | null; appid: number }): boolean {
  const { eligibleForOwnedHide, shouldHideOwned, ownedAppIds, appid } = params;
  return eligibleForOwnedHide && shouldHideOwned && !!ownedAppIds && ownedAppIds.has(appid);
}

// Name-based dedup against truly-owned local titles — colon/dash differences
// between a Steam title and a non-Steam shortcut name don't block the match.
export function isHiddenByOwnedName(params: {
  shouldHideOwned: boolean; ownedNames: Set<string> | null; isOnlineSource: boolean; eligibleForOwnedHide: boolean;
  item: PlatformAppMeta; isStoreFallback: boolean; storeNames: Map<number, string>; appid: number;
}): boolean {
  const { shouldHideOwned, ownedNames, isOnlineSource, eligibleForOwnedHide, item, isStoreFallback, storeNames, appid } = params;
  if (!(shouldHideOwned && ownedNames && isOnlineSource && eligibleForOwnedHide)) return false;
  const rawName = item.name && !isStoreFallback ? item.name : storeNames.get(appid) ?? '';
  const itemName = normalizeTitleForMatch(rawName);
  return !!itemName && ownedNames.has(itemName);
}

/* Non-owned game from an online source: decorative card with CDN artwork.
   Uses the public Akamai CDN (better global availability than the Cloudflare
   edge for in-client requests); click opens the Steam Store page. */
export function buildOnlineFallbackRowItem(params: { appid: number; shelfId: string; storeNames: Map<number, string>; t: (key: string) => string }): DeckRowItem {
  const { appid, shelfId, storeNames, t } = params;
  const cdnPortrait = `${STEAM_CDN_AKAMAI}/steam/apps/${appid}/library_600x900.jpg`;
  const cdnHero = `${STEAM_CDN_AKAMAI}/steam/apps/${appid}/header.jpg`;
  const gameName = storeNames.get(appid) ?? `#${appid}`;
  const discountPct = getCachedDiscount(appid);
  // Online card menu: DS shelf actions only — no native Steam menu.
  const showOnlineMenu = () => {
    try {
      // Without the host fallback this online-card menu never opened in sole mode.
      const dfl = resolveFrontendLib();
      const R = (globalThis as any).SP_REACT;
      if (!dfl?.showContextMenu || !R || !dfl.MenuItem || !dfl.Menu) return;
      const items = buildShelfContextMenu(shelfId, appid, dfl, R);
      if (!items.length) return;
      const menu = R.createElement(dfl.Menu, { label: gameName, cancelText: t('cancel') }, ...items);
      dfl.showContextMenu(menu, null);
    } catch {}
  };
  return {
    id: appid,
    appid,
    name: gameName,
    portraitUrl: cdnPortrait,
    heroUrl: cdnHero,
    onActivate: () => openSteamStorePage(appid),
    onMenuButton: showOnlineMenu,
    discountPercent: discountPct ?? undefined,
    shelfId,
  } as DeckRowItem;
}

export function buildOwnedRowItem(params: { appid: number; item: PlatformAppMeta; shelf: Shelf; platform: any; t: (key: string) => string }): DeckRowItem {
  const { appid, item, shelf, platform, t } = params;
  // Pass `shelf.id` so the captured native menu gains a `Deck Shelves >
  // Shelf > […]` submenu via the afterPatch/HOC seam.
  const onMenuButton = () => showGameMenu(appid, shelf.id);
  const addedTs = (item as any).addedTimestamp;
  const addedMs = typeof addedTs === 'number' && addedTs > 0 ? (addedTs < 1e12 ? addedTs * 1000 : addedTs) : 0;
  const isNew = addedMs > 0 ? (Date.now() - addedMs) < NEW_GAME_WINDOW_MS : false;
  return {
    id: appid,
    appid,
    name: item.name,
    portraitUrl: item.portraitUrl,
    heroUrl: item.heroUrl,
    onActivate: () => { saveFocusTarget(appid, shelf.id); platform.navigateToApp(appid); },
    onMenuButton,
    deckCompatCategory: item.deckCompatCategory,
    controllerSupport: item.controllerSupport,
    playtimeMinutes: item.playtimeMinutes,
    isInstalled: item.installed,
    updatePending: item.updatePending,
    isSteam: item.isSteam,
    isNew,
    statusText: item.installed !== true ? t('status_not_installed') : undefined,
    shelfId: shelf.id,
  } as DeckRowItem;
}

export function buildRefreshRowItem(params: { shelf: Shelf; isOnlineShelf: boolean; t: (key: string) => string }): DeckRowItem {
  const { shelf, isOnlineShelf, t } = params;
  const isSmart = (shelf.source as any)?.type === 'smart';
  const refreshName = isOnlineShelf ? t('refresh_cache') : t('refresh');
  return {
    id: `${shelf.id}__refresh`,
    name: refreshName,
    isRefresh: true,
    onActivate: () => {
      if (isOnlineShelf) clearOnlineShelfCache();
      else if (isSmart) invalidateSmartShelfCache(shelf.id);
      else invalidateRandomSortCache(shelf.id);
      // Scopes the visual indicator to this shelf; every subscribed shelf
      // still re-resolves since online cache clears affect them all.
      triggerShelfRefresh({ manual: true, shelfId: shelf.id });
    },
  } as DeckRowItem;
}

export function buildMoreRowItem(params: { shelf: Shelf; isOnlineShelf: boolean; t: (key: string) => string; platform: any }): DeckRowItem {
  const { shelf, isOnlineShelf, t, platform } = params;
  const moreLabel = isOnlineShelf
    ? (shelf.source.type === 'wishlist' ? t('view_more_wishlist') : t('view_more_store'))
    : t('view_more');
  const moreActivate = isOnlineShelf
    ? () => {
        const url = shelf.source.type === 'wishlist'
          ? ((globalThis as any).urlStore?.m_steamUrls?.userwishlist?.url ?? `${STEAM_STORE_BASE}/wishlist/`)
          : `${STEAM_STORE_BASE}/specials/`;
        openSteamStoreUrl(url, `steam://openurl/${url}`);
      }
    : () => platform.navigateToShelfSource?.(shelf.source, shelf.title);
  return { id: `${shelf.id}__more`, name: moreLabel, isMoreLink: true, onActivate: moreActivate } as DeckRowItem;
}

// Interleaves synthetic cards at their fixed slots, order-preserving: a card
// with position N lands at index N of the final array (clamped to length).
export function insertSyntheticCards(base: DeckRowItem[], shelf: Shelf): void {
  const synth = (shelf as any).syntheticCards as Array<any> | undefined;
  if (!synth || !synth.length) return;
  // Keep the ORIGINAL index alongside so a synthetic card can address its
  // own entry for X (remove) / Y (toggle size) bindings after splicing.
  const indexed = synth.map((c, origIdx) => ({ c, origIdx }));
  indexed.sort((a, b) => (a.c.position ?? 0) - (b.c.position ?? 0));
  for (const { c, origIdx } of indexed) {
    const pos = Math.max(0, Math.min(base.length, Number(c.position) || 0));
    base.splice(pos, 0, {
      id: `${shelf.id}__synthetic__${pos}__${base.length}`,
      name: c.text ?? "",
      shelfId: shelf.id,
      synthetic: {
        image: c.image,
        text: c.text,
        link: c.link,
        size: c.size === "featured" ? "featured" : "normal",
        alpha: c.alpha,
        placeholder: c.placeholder === true,
        heroImage: c.heroImage,
        shadowMode: c.shadowMode,
        index: origIdx,
      },
    } as DeckRowItem);
  }
}

export function shouldShowMetaSpinner(rowItemsLength: number, itemsSize: number, metaVersion: number, isFirstLoad: boolean): boolean {
  return rowItemsLength === 0 && itemsSize > 0 && metaVersion < 5 && isFirstLoad;
}

function computeDeckRowHeroEnabled(params: { lightMode: boolean; forceExpanded: boolean; forceLayoutAsRecents: boolean; heroForced: boolean; globalHeroEnabled: boolean; shelfHeroEnabled: boolean | undefined }): boolean {
  const { lightMode, forceExpanded, forceLayoutAsRecents, heroForced, globalHeroEnabled, shelfHeroEnabled } = params;
  if (lightMode) return forceExpanded || forceLayoutAsRecents;
  return heroForced || globalHeroEnabled || shelfHeroEnabled === true;
}

export function computeDeckRowDerivedProps(params: {
  globalMatchNativeSize: boolean; shelfMatchNativeSize: boolean | undefined;
  globalHighlightFirst: boolean; shelfHighlightFirst: boolean | undefined;
  globalHighlightAll: boolean; shelfHighlightAll: boolean | undefined;
  forceExpanded: boolean; fullPageLayout: boolean;
  lightMode: boolean; forceLayoutAsRecents: boolean; heroForced: boolean; globalHeroEnabled: boolean; shelfHeroEnabled: boolean | undefined;
  globalGameInfoAbove: boolean; shelfGameInfoAbove: boolean | undefined;
  globalFriendsPlayingOverlay: boolean; shelfFriendsPlayingOverlay: boolean | undefined;
  globalFriendsPlayingOverlayRecent: boolean; shelfFriendsPlayingOverlayRecent: boolean | undefined;
}): {
  matchNativeSize: boolean | undefined; highlightFirst: boolean | undefined; highlightAll: boolean | undefined; pinScrollTop: boolean;
  heroEnabled: boolean; infoAbove: boolean; friendsOverlay: boolean; friendsOverlayRecent: boolean;
} {
  const {
    globalMatchNativeSize, shelfMatchNativeSize, globalHighlightFirst, shelfHighlightFirst,
    globalHighlightAll, shelfHighlightAll, forceExpanded, fullPageLayout,
    lightMode, forceLayoutAsRecents, heroForced, globalHeroEnabled, shelfHeroEnabled,
    globalGameInfoAbove, shelfGameInfoAbove, globalFriendsPlayingOverlay, shelfFriendsPlayingOverlay,
    globalFriendsPlayingOverlayRecent, shelfFriendsPlayingOverlayRecent,
  } = params;
  const heroEnabled = computeDeckRowHeroEnabled({ lightMode, forceExpanded, forceLayoutAsRecents, heroForced, globalHeroEnabled, shelfHeroEnabled });
  return {
    matchNativeSize: globalMatchNativeSize || shelfMatchNativeSize,
    highlightFirst: globalHighlightFirst || shelfHighlightFirst,
    highlightAll: globalHighlightAll || shelfHighlightAll,
    pinScrollTop: forceExpanded && !fullPageLayout,
    heroEnabled,
    infoAbove: globalGameInfoAbove || shelfGameInfoAbove === true,
    friendsOverlay: globalFriendsPlayingOverlay || shelfFriendsPlayingOverlay === true,
    friendsOverlayRecent: globalFriendsPlayingOverlayRecent || shelfFriendsPlayingOverlayRecent === true,
  };
}
