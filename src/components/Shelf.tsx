
import { Spinner } from "../runtime/host/decky";
import { memo, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Shelf } from "../types";
import { usePlatform } from "../runtime/platformContext";
import type { PlatformAppMeta } from "../runtime/platform";
import { DeckRow, type DeckRowItem } from "./DeckRow";
import { shouldShowMoreCard, shouldShowRefreshCard } from "./shelf/trailingCards";
import { subscribeShelfRefresh } from "../core/shelfRefresh";
import { maybeSubscribeContextInvalidation } from "../core/contextAwareShelves";
import { hasExternalSource } from "../core/pluginApi";
import { mark, measure } from "../core/perf";
import { recordMountFetch, recordMountCardsProcessed } from "../core/perfMetrics";
import { logInfo } from "../runtime/logger";
import { applyManualOrder, getAllAppOverviews, getLocalLibraryAppIds } from "../steam";
import { normalizeTitleForMatch } from "../steam/dedupe";
import { fetchGameNames } from "../core/onlineStore";
import { getCurrentSettings } from "../store/settingsStore";
import { publishShelf, unpublishShelf } from "../features/search/shelfRegistry";
import {
  computeEffectiveSort, computeResolveParams, startManualRefreshIndicator,
  traceResolveStart, traceResolveThen, traceResolveCatch, bumpResolveGenCounter,
  computeOnlineSourceFlags, computeOwnedHideFlags, isOnlineSourceForShelf,
  shouldDropOwnedItem, isHiddenByOwnedName, buildOnlineFallbackRowItem, buildOwnedRowItem,
  buildRefreshRowItem, buildMoreRowItem, insertSyntheticCards, shouldShowMetaSpinner,
  computeDeckRowDerivedProps, joinOrEmpty, orEmpty, orEmptyArray, jsonOrNull,
  computeShelfCacheKey, SHELF_CACHE_TTL_MS, shouldSkipShelf, resolveHighlightRandom,
} from "./shelf/shelfViewHelpers";
import { getShelfWarmEntry, setShelfWarmEntry, markShelfResolved, type ShelfWarmEntry } from "./shelf/shelfWarmState";

// Cross-source name key: same normalisation as the wishlist compare so
// "Kingdom Come Deliverance" (non-Steam) matches "Kingdom Come: Deliverance".
function ownedNameKey(a: any): string | null {
  const n = (a as any)?.display_name ?? (a as any)?.name;
  if (typeof n !== 'string' || !n) return null;
  return normalizeTitleForMatch(n) || null;
}

// FNV-1a-style hash. Stable, fast, no deps.
function fnvSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function mixInt(seed: number, n: number): number {
  let h = seed ^ n;
  h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  return h;
}

function computeEffectiveHighlightedAppIds(
  explicit: number[] | undefined,
  pool: number[] | null | undefined,
  shelfId: string,
  randomOn: boolean | undefined,
): number[] | undefined {
  const explicitList = explicit ?? [];
  if (!randomOn) return explicitList.length ? explicitList : undefined;
  if (!pool || !pool.length) return explicitList.length ? explicitList : undefined;
  const targetCount = Math.max(1, Math.round(pool.length * 0.25));
  const seed = fnvSeed(shelfId || "shelf");
  const scored = pool.map((id) => ({ id, h: mixInt(seed, id) }));
  scored.sort((a, b) => a.h - b.h);
  const picked = new Set(scored.slice(0, targetCount).map((s) => s.id));
  for (const id of explicitList) picked.add(id);
  return Array.from(picked);
}

type ShelfDisplayGlobals = {
  hideStatusLine: boolean;
  hideNewBadge: boolean;
  hideDiscountBadge: boolean;
  hideCompatIcons: boolean;
  hideNonSteamBadge: boolean;
  hideShelfTitle: boolean;
  hideGameNames: boolean;
  hideInstallIndicator: boolean;
  enableLogo: boolean;
  enableIcon: boolean;
  enableDescription: boolean;
  descriptionBelowLogo: boolean;
  logoBelowShelf: boolean;
  logoPosition: 'left' | 'center' | 'right';
  descriptionPosition: 'left' | 'center' | 'right';
  logoSize: number;
  logoTopOffset: number;
  fullPageShelf: boolean;
  iconVerticalAlign: 'top' | 'center' | 'bottom' | null | undefined;
  shelfTitlePosition: 'left' | 'center' | 'right' | null | undefined;
  gameNamePosition: 'left' | 'center' | 'right' | null | undefined;
  playtimePosition: 'left' | 'center' | 'right' | null | undefined;
  descriptionHeight: number | null | undefined;
};

function isValidPos(v: unknown): v is 'left' | 'center' | 'right' {
  return v === 'left' || v === 'center' || v === 'right';
}
function isValidVAlign(v: unknown): v is 'top' | 'center' | 'bottom' {
  return v === 'top' || v === 'center' || v === 'bottom';
}
function readGlobalSetting(key: string): unknown {
  return (getCurrentSettings() as any)?.[key];
}
// Global wins outright; otherwise fall back to the per-shelf value.
// `forceOn` covers the two flags that ALSO force on for online shelves.
function resolveBoolFlag(globalVal: boolean, shelfVal: unknown, forceOn = false): boolean {
  if (globalVal === true) return true;
  return shelfVal === true || forceOn;
}
function resolveEnableFlag(lightMode: boolean, globalVal: boolean): boolean {
  return !lightMode && globalVal === true;
}
function resolveClampedNumber(globalVal: unknown, shelfVal: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof globalVal === 'number') return Math.max(lo, Math.min(hi, globalVal));
  if (typeof shelfVal === 'number') return Math.max(lo, Math.min(hi, shelfVal));
  return fallback;
}
function resolvePosition<T extends string>(valid: (v: unknown) => v is T, globalVal: unknown, shelfVal: unknown, fallback: T): T {
  if (valid(globalVal)) return globalVal;
  if (valid(shelfVal)) return shelfVal;
  return fallback;
}

/* Pulled out to keep ShelfViewImpl's render complexity under the lint cap.
   Every field follows "global wins, else per-shelf, else default" via the
   small resolvers above; `g` is already-defaulted (applied at destructuring
   in ShelfViewImpl). No behaviour change — every rule is copied verbatim
   from the body it replaced, just table-driven instead of inlined. */
function computeEffectiveShelfDisplayProps(shelf: any, isOnlineShelf: boolean, g: ShelfDisplayGlobals) {
  const lightMode = readGlobalSetting('lightModeEnabled') === true;
  const descriptionScalePercent = resolveClampedNumber(readGlobalSetting('globalDescriptionScale'), shelf.descriptionScale, 100, 200, 100);
  return {
    lightMode,
    effectiveHide: resolveBoolFlag(g.hideStatusLine, shelf.hideStatusLine, isOnlineShelf),
    effectiveHideNewBadge: resolveBoolFlag(g.hideNewBadge, shelf.hideNewBadge),
    effectiveHideDiscountBadge: resolveBoolFlag(g.hideDiscountBadge, shelf.hideDiscountBadge),
    effectiveHideCompatIcons: resolveBoolFlag(g.hideCompatIcons, shelf.hideCompatIcons),
    effectiveHideNonSteamBadge: resolveBoolFlag(g.hideNonSteamBadge, shelf.hideNonSteamBadge),
    effectiveHideShelfTitle: resolveBoolFlag(g.hideShelfTitle, shelf.hideShelfTitle),
    effectiveHideGameNames: resolveBoolFlag(g.hideGameNames, shelf.hideGameNames),
    effectiveHideInstallIndicator: resolveBoolFlag(g.hideInstallIndicator, shelf.hideInstallIndicator, isOnlineShelf),
    effectiveEnableLogo: resolveEnableFlag(lightMode, g.enableLogo),
    effectiveEnableIcon: resolveEnableFlag(lightMode, g.enableIcon),
    effectiveEnableDescription: resolveEnableFlag(lightMode, g.enableDescription),
    effectiveDescriptionScale: descriptionScalePercent / 100,
    effectiveDescriptionBelowLogo: resolveBoolFlag(g.descriptionBelowLogo, shelf.descriptionBelowLogo),
    effectiveLogoBelowShelf: resolveBoolFlag(g.logoBelowShelf, shelf.logoBelowShelf),
    effectiveLogoPosition: resolvePosition(isValidPos, g.logoPosition, shelf.logoPosition, 'left'),
    effectiveDescriptionPosition: resolvePosition(isValidPos, g.descriptionPosition, shelf.descriptionPosition, 'left'),
    effectiveLogoSize: resolveClampedNumber(g.logoSize, shelf.logoSize, 50, 200, 100),
    effectiveLogoTopOffset: resolveClampedNumber(g.logoTopOffset, shelf.logoTopOffset, 0, 100, 20),
    fullPageLayout: resolveBoolFlag(g.fullPageShelf, shelf.fullPageShelf),
    effectiveIconVerticalAlign: resolvePosition(isValidVAlign, g.iconVerticalAlign, shelf.iconVerticalAlign, 'top'),
    effectiveShelfTitlePosition: resolvePosition(isValidPos, g.shelfTitlePosition, shelf.shelfTitlePosition, 'left'),
    effectiveGameNamePosition: resolvePosition(isValidPos, g.gameNamePosition, shelf.gameNamePosition, 'left'),
    effectivePlaytimePosition: resolvePosition(isValidPos, g.playtimePosition, shelf.playtimePosition, 'left'),
    effectiveDescriptionHeight: resolveClampedNumber(g.descriptionHeight, shelf.descriptionHeight, 1, 3, 2),
    effectiveDescriptionLogoGap: resolveClampedNumber(readGlobalSetting('globalDescriptionLogoGap'), shelf.descriptionLogoGap, -40, 80, 10),
  };
}

// True when this shelf's external source id references a provider that
// isn't currently registered (uninstalled/disabled) — distinguishes that
// from a source genuinely resolving to zero results, which stays silent.
function unavailableExternalSourceId(shelf: Shelf): boolean {
  const source = shelf.source as any;
  if (source?.type !== 'external') return false;
  const sourceId = String(source.sourceId ?? '');
  return !!sourceId && !hasExternalSource(sourceId);
}

function renderUnavailableSourceNotice(title: string, message: string) {
  return (
    <div style={{ padding: '10px 16px', opacity: 0.75 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12 }}>⚠️ {message}</div>
    </div>
  );
}

function ShelfViewImpl({ shelf, globalMatchNativeSize = false, globalHighlightFirst = false, globalHighlightAll = false, globalHighlightRandom = false, globalHideStatusLine = false, globalHideNewBadge = false, globalHideDiscountBadge = false, globalHideCompatIcons = false, globalHideNonSteamBadge = false, globalHideShelfTitle = false, globalHideGameNames = false, globalHideInstallIndicator = false, globalHideSeeMore = false, globalHideRefreshCard = false, globalHeroEnabled = false, globalGameInfoAbove = false, globalFriendsPlayingOverlay = false, globalFriendsPlayingOverlayRecent = false, globalDedupeByName = false, globalEnableLogo = false, globalEnableIcon = false, globalEnableDescription = false, globalDescriptionBelowLogo = false, globalLogoBelowShelf = false, globalLogoPosition = 'left', globalDescriptionPosition = 'left', globalLogoSize = 100, globalLogoTopOffset = 20, globalFullPageShelf = false, globalIconVerticalAlign, globalShelfTitlePosition, globalGameNamePosition, globalPlaytimePosition, globalDescriptionHeight, heroForced = false, heroLabelMount = false, forceExpanded = false, forceLayoutAsRecents = false, forceCollapsed = false, autoCollapseWhenEmpty = false }: { shelf: Shelf; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHighlightRandom?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideDiscountBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; globalHideGameNames?: boolean; globalHideInstallIndicator?: boolean; globalHideSeeMore?: boolean; globalHideRefreshCard?: boolean; globalHeroEnabled?: boolean; globalGameInfoAbove?: boolean; globalFriendsPlayingOverlay?: boolean; globalFriendsPlayingOverlayRecent?: boolean; globalDedupeByName?: boolean; globalEnableLogo?: boolean; globalEnableIcon?: boolean; globalEnableDescription?: boolean; globalDescriptionBelowLogo?: boolean; globalLogoBelowShelf?: boolean; globalLogoPosition?: 'left' | 'center' | 'right'; globalDescriptionPosition?: 'left' | 'center' | 'right'; globalLogoSize?: number; globalLogoTopOffset?: number; globalFullPageShelf?: boolean; globalIconVerticalAlign?: 'top' | 'center' | 'bottom' | null; globalShelfTitlePosition?: 'left' | 'center' | 'right' | null; globalGameNamePosition?: 'left' | 'center' | 'right' | null; globalPlaytimePosition?: 'left' | 'center' | 'right' | null; globalDescriptionHeight?: number | null; heroForced?: boolean; heroLabelMount?: boolean; forceExpanded?: boolean; forceLayoutAsRecents?: boolean; forceCollapsed?: boolean; autoCollapseWhenEmpty?: boolean }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const cacheKey = computeShelfCacheKey(shelf);
  // Manual order applies only when the PRIMARY sort key is "manual".
  const { primaryEffectiveSort } = computeEffectiveSort(shelf);
  // Read once per mount: the warm entry from the previous mount of this
  // shelf (route-away/return), so the rebuild paints complete on its first
  // commit — see shelfWarmState.ts. Falls through to the persisted id cache.
  const warmRef = useRef<ShelfWarmEntry | null | undefined>(undefined);
  if (warmRef.current === undefined) warmRef.current = getShelfWarmEntry(shelf.id);
  const warm = warmRef.current;
  const [appIds, setAppIds] = useState<number[] | null>(() => {
    if (warm) return warm.appIds;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { ts, ids } = JSON.parse(raw);
        if (Date.now() - ts < SHELF_CACHE_TTL_MS) return primaryEffectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder, (shelf as any).hiddenAppIds) : ids;
      }
    } catch (e) { logInfo("HOME", "shelf cache read failed", String(e)); }
    return null;
  });
  const [items, setItems] = useState<Map<number, PlatformAppMeta>>(() => warm ? new Map(warm.items) : new Map());
  // Resolver's pre-applyManualOrder ids — used to compute the X-button
  /* "Remove from shelf" set on the home shelf. Cards in manualOrder but
     NOT in `sourceIds` are the menu-added games (truly removable);
     drag-ordered manualOrder entries that ARE in sourceIds get X=hide
     instead so removing them doesn't just bounce them back to the
     source-default slot. */
  const [sourceIds, setSourceIds] = useState<number[] | null>(() => warm ? warm.sourceIds : null);
  const [storeNames, setStoreNames] = useState<Map<number, string>>(() => warm ? new Map(warm.storeNames) : new Map());
  // Bumped when the price cache is warmed for non-owned smart-shelf cards —
  // forces rowItems to re-read `getCachedDiscount` so the badge appears.
  const [priceVersion, setPriceVersion] = useState(0);
  const [ownedNames, setOwnedNames] = useState<Set<string> | null>(null);
  // A warm-seeded mount already has a complete first render; it must not
  // show the first-load meta spinner or blank itself on a failed re-resolve.
  const firstLoad = useRef(!warm);
  const [metaVersion, setMetaVersion] = useState(0);
  /* Increments on every `resolve()` call; each in-flight promise captures
     the id at start and bails on completion if the id has advanced —
     prevents a slow resolve from overwriting a newer one (e.g. user
     rapid-toggles sort or edits the filter while the previous fetch is
     still pending). */
  const resolveGenRef = useRef(0);
  // Visual "I just refreshed" indicator. Driven by `manual: true` arriving
  /* from `triggerShelfRefresh()` (user-clicked refresh card, context-menu
     "Refresh cache", manage page). Held for at least 320 ms even when the
     resolver is instant so the user perceives the action when the data
     hasn't actually changed. Auto-poll refreshes (every 30 s) and Steam-
     event-driven refreshes pass no `manual` flag and remain silent. */
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pre-limit match count reported by the resolver (undefined when the
  // resolver doesn't report it) — drives the dynamic "See more" decision.
  const resolvedTotalRef = useRef<number | undefined>(warm ? warm.resolvedTotal : undefined);

  const sourceKey = useMemo(() => JSON.stringify({ source: shelf.source, sort: shelf.sort }), [shelf.source, shelf.sort]);

  // Publish the latest resolved state for the next mount of this shelf
  // (references only — no copying, no DOM).
  useEffect(() => {
    if (!appIds?.length) return;
    setShelfWarmEntry(shelf.id, { appIds, sourceIds, items, storeNames, resolvedTotal: resolvedTotalRef.current });
  }, [shelf.id, appIds, sourceIds, items, storeNames]);

  useEffect(() => {
    let cancelled = false;
    if (!shelf.enabled) return;

    const resolve = (opts?: { manual?: boolean }) => {
      if (cancelled) return;
      const gen = ++resolveGenRef.current;
      if (opts?.manual) startManualRefreshIndicator(refreshTimerRef, setRefreshing);
      try {
        mark(`shelf.resolve:${shelf.id}:start`);
        const { resolveSource, resolveSort, resolveReverse, dedupeByName, hiddenAppIds } =
          computeResolveParams({ shelf, primaryEffectiveSort, globalDedupeByName });
        const __traceStart = traceResolveStart(shelf.id, gen, resolveGenRef.current, cancelled);
        recordMountFetch();
        platform.resolveShelfAppIds(resolveSource, shelf.limit, resolveSort, shelf.id, resolveReverse, { hiddenAppIds, dedupeByName: dedupeByName || undefined, onResolveTotal: (n) => { resolvedTotalRef.current = n; } })
          .then((ids) => {
            traceResolveThen(shelf.id, __traceStart, gen, resolveGenRef.current, cancelled, ids?.length);
            if (cancelled || gen !== resolveGenRef.current) return;
            recordMountCardsProcessed(ids?.length ?? 0);
            const finalIds = primaryEffectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder, hiddenAppIds) : ids;
            setAppIds(finalIds);
            setSourceIds(ids);
            setMetaVersion((v) => v + 1);
            firstLoad.current = false;
            try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), ids })); } catch (e) { logInfo("HOME", "shelf cache write failed", String(e)); }
          })
          .catch((err) => {
            traceResolveCatch(shelf.id, __traceStart, gen, resolveGenRef.current, cancelled, err);
            if (cancelled || gen !== resolveGenRef.current) return;
            if (firstLoad.current) setAppIds([]);
          })
          .finally(() => {
            measure(`shelf.resolve:${shelf.id}`, `shelf.resolve:${shelf.id}:start`);
            markShelfResolved(shelf.id);
          });
      } catch {
        if (!cancelled && firstLoad.current) setAppIds([]);
        markShelfResolved(shelf.id);
      }
    };

    // Initial load
    resolve();
    // Diagnostic: track per-shelf resolve activity so we can see (via CDP)
    // whether a shelf is stuck in a cancellation loop. Keys the same shelf
    // across re-mounts so the counter actually means something.
    bumpResolveGenCounter(shelf.id);

    /* Subscribe to global refresh emitter (replaces per-shelf polling
       timer). The wrapper scopes the `manual` visual indicator: every
       shelf still re-resolves, but only the one matching `opts.shelfId`
       (or all when no shelfId is set, as a defensive fallback for any
       future caller that doesn't carry a scope) shows the dim flash. */
    const unsubRefresh = subscribeShelfRefresh((opts) => {
      const showVisual = !!opts?.manual && (!opts.shelfId || opts.shelfId === shelf.id);
      resolve(showVisual ? { manual: true } : undefined);
    });

    /* Debounced re-resolve on settings change (200 ms). Toggling
       multiple QAM switches in quick succession used to fan out one
       resolve per shelf per toggle; the debounce coalesces a burst
       into a single re-resolve once the user pauses. */
    let settingsTimer: ReturnType<typeof setTimeout> | null = null;
    const onSettings = () => {
      if (cancelled) return;
      if (settingsTimer !== null) clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => { settingsTimer = null; resolve(); }, 200);
    };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettings);

    /* Context-aware re-resolve: no-op for every shelf except one whose
       external source declared it needs the focused game — see
       `maybeSubscribeContextInvalidation`. Reuses the SAME `resolve()`
       closure (generation counter included), so a focus change is just
       another debounced trigger alongside the refresh emitter above. */
    /* `manual: true` reuses the existing brief opacity-dip (no layout jump,
       no new UI) so a context-driven re-resolve gives the same "updating"
       cue a manual refresh does — old contents stay visible the whole time. */
    const unsubContext = maybeSubscribeContextInvalidation(shelf.source as any, () => resolve({ manual: true }));

    return () => {
      cancelled = true;
      unsubRefresh();
      unsubContext?.();
      globalThis.removeEventListener("deck-shelves-settings-changed", onSettings);
      if (settingsTimer !== null) { clearTimeout(settingsTimer); settingsTimer = null; }
      if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }
    };
  }, [platform, shelf.enabled, shelf.limit, sourceKey, joinOrEmpty((shelf as any).manualOrder), orEmpty((shelf as any).manualBaseSort), (shelf as any).sortReverse === true, (shelf as any).manualBaseSortReverse === true, joinOrEmpty((shelf as any).hiddenAppIds)]);
  // NOTE: `shelf.sort` is intentionally absent from this dep array. When
  // `sort` is an array (multi-key, e.g. composite shelves with
  /* ["discount_high", "original_price_high"]), the parent passes a fresh
     array reference on every render — that re-fired this effect every
     render, gen-cancelling every in-flight resolve before its .then could
     call setAppIds. `sourceKey` (a memoised JSON.stringify of source +
     sort) covers the same value-change without the reference churn. */

  useEffect(() => {
    let cancelled = false;
    if (!appIds || !appIds.length) {
      setItems(new Map());
      return;
    }
    // NOTE: descriptions are NOT auto-warmed here. Firing
    // `RequestDescriptionsData` for every card on every shelf at mount
    // overwhelms the main thread (110+ store fetches + 100 ms-interval
    /* polling timers each), producing a boot-time freeze. Features that
       genuinely need the snippet/full description should call
       `preloadAppDescriptions(appid)` on-demand (e.g. on focus, on
       tooltip open) so the cost is paid only for the cards the user
       actually interacts with. */
    void (async () => {
      // Batched meta lookup: ONE catalog walk for every appid instead
      // of N per-id calls. Collapses ~1 s of cold-mount blocking work
      // into ~50 ms on a 1k-game library.
      let results: Array<[number, PlatformAppMeta]>;
      if (typeof platform.getAppMetaBatch === "function") {
        try {
          const map = await platform.getAppMetaBatch(appIds);
          results = appIds.map((id) => [id, map.get(id) ?? { appid: id, name: `App ${id}` }] as [number, PlatformAppMeta]);
        } catch {
          results = appIds.map((id) => [id, { appid: id, name: `App ${id}` }] as [number, PlatformAppMeta]);
        }
      } else {
        results = await Promise.all(appIds.map(async (appid): Promise<[number, PlatformAppMeta]> => {
          try { return [appid, await platform.getAppMeta(appid)]; }
          catch { return [appid, { appid, name: `App ${appid}` }]; }
        }));
      }
      // Merge instead of replace so cards don't flash to placeholder
      // while the new results land.
      if (!cancelled) setItems((prev) => {
        const next = new Map(prev);
        for (const [id, meta] of results) next.set(id, meta);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [platform, joinOrEmpty(appIds), metaVersion]);

  /* Async name fetch (Steam Store appdetails) for online-source items not in
     the local appStore. Smart shelves like `friends_playing` may also surface
     non-owned appids via `includesNonOwned`; hide-owned/view-more stay gated
     on `isOnlineShelf` so friends_playing keeps owned cards interactive. */
  const sourceIncludesNonOwned = (shelf.source as any).includesNonOwned === true;
  const {
    isOnlineShelf, compositeHasOnlineChild, needsExternalNames,
    excludeOwned, excludeOwnedNonSteam, perShelfHideOwnedCloud,
  } = computeOnlineSourceFlags({ shelf, sourceIncludesNonOwned });

  const [globalHideOwned, setGlobalHideOwned] = useState(() => getCurrentSettings()?.onlineHideOwnedGames === true);
  const [globalHideOwnedNonSteam, setGlobalHideOwnedNonSteam] = useState(() => getCurrentSettings()?.onlineHideOwnedNonSteam === true);
  const [globalHideOwnedCloud, setGlobalHideOwnedCloud] = useState(() => getCurrentSettings()?.onlineHideOwnedNonSteamCloud === true);

  useEffect(() => {
    const handler = () => {
      const s = getCurrentSettings();
      setGlobalHideOwned(s?.onlineHideOwnedGames === true);
      setGlobalHideOwnedNonSteam(s?.onlineHideOwnedNonSteam === true);
      setGlobalHideOwnedCloud(s?.onlineHideOwnedNonSteamCloud === true);
    };
    globalThis.addEventListener("deck-shelves-settings-changed", handler);
    return () => globalThis.removeEventListener("deck-shelves-settings-changed", handler);
  }, []);

  /* Effective filter flags: true if either global or per-shelf toggle is active.
     Composite shelves with any online child are eligible too — without
     this gate, the wishlist child's `excludeOwned: true` would only take
     effect via the resolver's appid-based dedup, missing same-name games
     owned via non-Steam shortcuts (no Steam appid match). */
  const { shouldHideOwned, effectiveNonSteam, effectiveCloud } = computeOwnedHideFlags({
    isOnlineShelf, compositeHasOnlineChild, globalHideOwned, excludeOwned,
    globalHideOwnedNonSteam, excludeOwnedNonSteam, perShelfHideOwnedCloud, globalHideOwnedCloud,
  });

  // Owned appid set from collectionStore — matches the resolver's logic so
  // render and resolver agree on what counts as owned.
  const [ownedAppIds, setOwnedAppIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (!shouldHideOwned) { setOwnedAppIds(null); setOwnedNames(null); return; }
    setOwnedAppIds(getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud));
    let cancelled = false;
    // Name-dedup mirrors the scope toggles used for appid-dedup so
    // cloud-play shortcuts don't hide wishlist items the user doesn't own.
    getAllAppOverviews().then((apps) => {
      if (cancelled) return;
      const ownedSetForNames = getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud);
      const names = new Set<string>();
      for (const a of apps) {
        const id = Number((a as any)?.appid);
        if (!ownedSetForNames.has(id)) continue;
        const key = ownedNameKey(a);
        if (key) names.add(key);
      }
      setOwnedNames(names);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [shouldHideOwned, effectiveNonSteam, effectiveCloud]);
  useEffect(() => {
    if (!needsExternalNames || !appIds?.length) return;
    // Read previously-fetched names from localStorage cache to show instantly.
    const NAME_CACHE_KEY = 'ds-game-name-cache-v1';
    const nameCache: Record<number, string> = (() => {
      try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}'); } catch { return {}; }
    })();
    // Pre-populate storeNames from cache immediately — no async needed.
    const cached = new Map<number, string>();
    for (const id of appIds) {
      if (nameCache[id]) cached.set(id, nameCache[id]);
    }
    if (cached.size) setStoreNames(prev => { const n = new Map(prev); cached.forEach((v, k) => n.set(k, v)); return n; });
    // Fetch names for IDs not yet cached.
    const toFetch = appIds.filter((id) => {
      const meta = items.get(id);
      return (!meta || /^App \d+$/.test(meta.name)) && !nameCache[id];
    });
    if (!toFetch.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const names = await fetchGameNames(toFetch);
        if (!cancelled && names.size) {
          try {
            const merged = { ...nameCache };
            names.forEach((v, k) => { merged[k] = v; });
            localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(merged));
          } catch {}
          setStoreNames(prev => { const n = new Map(prev); names.forEach((v, k) => n.set(k, v)); return n; });
        }
      } catch {}
    })();
    /* Warm the price cache for non-owned ids so discount badges can appear
       on smart-shelf cards (friends_playing / composite with online child).
       Wishlist/store sources already do this during resolve; smart shelves
       don't, so without this the discount data is never fetched. */
    if (sourceIncludesNonOwned) {
      void (async () => {
        try {
          const { getPriceMap } = await import("../core/onlineStore");
          await getPriceMap(toFetch);
          if (!cancelled) setPriceVersion(v => v + 1);
        } catch {}
      })();
    }
    return () => { cancelled = true; };
  }, [needsExternalNames, joinOrEmpty(appIds), items, sourceIncludesNonOwned]);

  /* Publish resolved items into a global registry so Quick Search can
     match against EVERY game in the shelf, not just the cards currently
     mounted in the DOM. Without this, items below the fold (or recycled
     out by virtualisation) silently miss every query. */
  useEffect(() => {
    if (!appIds?.length) {
      unpublishShelf(shelf.id);
      return;
    }
    const list = appIds.map((id) => {
      const meta = items.get(id);
      return { appid: id, name: meta?.name ?? "" };
    }).filter((x) => x.name && !/^App \d+$/.test(x.name));
    publishShelf(shelf.id, shelf.title, list);
    return () => { unpublishShelf(shelf.id); };
  }, [shelf.id, shelf.title, appIds, items]);

  const rowItems = useMemo((): DeckRowItem[] => {
    if (!appIds?.length) return [];
    // Online treatment also applies when the shelf is a composite whose
    // children include a wishlist / store source — shelf-invariant, so
    // computed once rather than per item.
    const isOnlineSource = isOnlineSourceForShelf(shelf, sourceIncludesNonOwned);
    // For composite shelves, only hide owned ids that came from an online
    // child — `isStoreFallback` proxies "no local overview".
    const onlyHideOnlineOriginated = shelf.source.type === 'composite';
    const base = appIds.flatMap((appid): DeckRowItem[] => {
      const item = items.get(appid) ?? { appid, name: `App ${appid}` };
      const isStoreFallback = /^App \d+$/.test(item.name);
      const eligibleForOwnedHide = onlyHideOnlineOriginated ? isStoreFallback : isOnlineSource;
      if (shouldDropOwnedItem({ eligibleForOwnedHide, shouldHideOwned, ownedAppIds, appid })) return [];
      if (isStoreFallback && !isOnlineSource) return [];
      if (isHiddenByOwnedName({ shouldHideOwned, ownedNames, isOnlineSource, eligibleForOwnedHide, item, isStoreFallback, storeNames, appid })) return [];
      if (isStoreFallback && isOnlineSource) return [buildOnlineFallbackRowItem({ appid, shelfId: shelf.id, storeNames, t })];
      return [buildOwnedRowItem({ appid, item, shelf, platform, t })];
    });
    if (!base.length) return base;
    // Cap to shelf.limit AFTER filtering — the resolver overshoots so the
    // render-time filters can drop items without leaving the shelf short.
    if (base.length > shelf.limit) base.length = shelf.limit;
    // Trailing card rules live in `shelf/trailingCards.ts` so the modal
    // preview renders the same set as the home shelf. Cache-invalidation
    // handler picks the right path based on smart vs random-sort.
    const trailingInput = {
      source: shelf.source,
      sort: shelf.sort,
      hideSeeMore: (shelf as any).hideSeeMore === true,
      hideRefreshCard: (shelf as any).hideRefreshCard === true,
      globalHideSeeMore,
      globalHideRefreshCard,
      resolvedTotal: resolvedTotalRef.current,
      limit: shelf.limit,
      isOnline: isOnlineShelf,
    };
    if (shouldShowRefreshCard(trailingInput)) base.push(buildRefreshRowItem({ shelf, isOnlineShelf, t }));
    if (shouldShowMoreCard(trailingInput)) base.push(buildMoreRowItem({ shelf, isOnlineShelf, t, platform }));
    // Interleave synthetic cards at their fixed slots, after trailing cards
    // so a position past the last game still lands in the visible row.
    insertSyntheticCards(base, shelf);
    return base;
  }, [appIds, items, storeNames, ownedNames, ownedAppIds, shouldHideOwned, shelf.id, shelf.limit, shelf.source, shelf.sort, shelf.title, platform, t, globalHideSeeMore, globalHideRefreshCard, (shelf as any).hideSeeMore, (shelf as any).hideRefreshCard, jsonOrNull((shelf as any).syntheticCards), priceVersion]);

  /* Menu-added games (in manualOrder, not in resolved source) — DeckRow uses
     this to bind X=Remove on those cards (vs X=Hide on the rest). Kept above
     the early returns below (Rules of Hooks): manualOrder/sourceIds are both
     available before shelf/appIds/rowItems are known. */
  const manualOrder: number[] = orEmptyArray((shelf as any).manualOrder);
  const removableSet = useMemo(() => {
    if (!manualOrder.length || !sourceIds) return undefined;
    const inSrc = new Set(sourceIds);
    const tail = manualOrder.filter((id) => !inSrc.has(id));
    return tail.length ? new Set(tail) : undefined;
  }, [manualOrder, sourceIds]);

  if (shouldSkipShelf(shelf)) return null;
  if (appIds === null) return <div style={{ padding: 10 }}><Spinner /></div>;
  if (!appIds.length) return null;

  // Spinner during the meta-fetch transition is gated to first load only.
  // Without this gate, every refresh that updates `appIds` faster than the
  // meta lookup briefly empties `rowItems` (new ids haven't landed in the
  /* `items` map yet) and the shelf flashes a 30 px spinner band — visible
     as a loading-space gap between shelves whenever the global refresh
     emitter fires (game launch, install/uninstall, 30 s poll). After the
     first successful render, transitions just keep the prior content
     visible until the new meta lands. */
  if (shouldShowMetaSpinner(rowItems.length, items.size, metaVersion, firstLoad.current)) {
    return <div style={{ padding: 10 }}><Spinner /></div>;
  }
  if (!rowItems.length) {
    return unavailableExternalSourceId(shelf)
      ? renderUnavailableSourceNotice(shelf.title, t('shelf_source_unavailable'))
      : null;
  }

  // Random-featured rule: stable per shelf id, ~25 % of cards. Implementation
  // pulled out to `computeRandomHighlightSet` to keep render complexity under
  // the lint cap.
  const effectiveHighlightedAppIds = computeEffectiveHighlightedAppIds(
    shelf.highlightedAppIds,
    appIds,
    shelf.id,
    resolveHighlightRandom(globalHighlightRandom, shelf),
  );
  /* Global is the master switch for logo/icon/description/hide flags and
     position/size overrides; light mode additionally strips per-shelf
     decorations. Pulled out to `computeEffectiveShelfDisplayProps` (same
     reasoning as above) — see that function for the field-by-field rules. */
  const {
    lightMode, effectiveHide, effectiveHideNewBadge, effectiveHideDiscountBadge, effectiveHideCompatIcons,
    effectiveHideNonSteamBadge, effectiveHideShelfTitle, effectiveHideGameNames, effectiveHideInstallIndicator,
    effectiveEnableLogo, effectiveEnableIcon, effectiveEnableDescription, effectiveDescriptionScale,
    effectiveDescriptionBelowLogo, effectiveLogoBelowShelf, effectiveLogoPosition, effectiveDescriptionPosition,
    effectiveLogoSize, effectiveLogoTopOffset, fullPageLayout, effectiveIconVerticalAlign,
    effectiveShelfTitlePosition, effectiveGameNamePosition, effectivePlaytimePosition, effectiveDescriptionHeight,
    effectiveDescriptionLogoGap,
  } = computeEffectiveShelfDisplayProps(shelf, isOnlineShelf, {
    hideStatusLine: globalHideStatusLine, hideNewBadge: globalHideNewBadge, hideDiscountBadge: globalHideDiscountBadge,
    hideCompatIcons: globalHideCompatIcons, hideNonSteamBadge: globalHideNonSteamBadge, hideShelfTitle: globalHideShelfTitle,
    hideGameNames: globalHideGameNames, hideInstallIndicator: globalHideInstallIndicator, enableLogo: globalEnableLogo,
    enableIcon: globalEnableIcon, enableDescription: globalEnableDescription, descriptionBelowLogo: globalDescriptionBelowLogo,
    logoBelowShelf: globalLogoBelowShelf, logoPosition: globalLogoPosition, descriptionPosition: globalDescriptionPosition,
    logoSize: globalLogoSize, logoTopOffset: globalLogoTopOffset, fullPageShelf: globalFullPageShelf,
    iconVerticalAlign: globalIconVerticalAlign, shelfTitlePosition: globalShelfTitlePosition,
    gameNamePosition: globalGameNamePosition, playtimePosition: globalPlaytimePosition,
    descriptionHeight: globalDescriptionHeight,
  });
  const deckRowDerived = computeDeckRowDerivedProps({
    globalMatchNativeSize, shelfMatchNativeSize: shelf.matchNativeSize,
    globalHighlightFirst, shelfHighlightFirst: shelf.highlightFirst,
    globalHighlightAll, shelfHighlightAll: shelf.highlightAll,
    forceExpanded, fullPageLayout,
    lightMode, forceLayoutAsRecents, heroForced, globalHeroEnabled, shelfHeroEnabled: (shelf as any).heroEnabled,
    globalGameInfoAbove, shelfGameInfoAbove: (shelf as any).gameInfoAbove,
    globalFriendsPlayingOverlay, shelfFriendsPlayingOverlay: (shelf as any).friendsPlayingOverlay,
    globalFriendsPlayingOverlayRecent, shelfFriendsPlayingOverlayRecent: (shelf as any).friendsPlayingOverlayRecent,
  });
  const row = <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} removableSet={removableSet} matchNativeSize={deckRowDerived.matchNativeSize} highlightFirst={deckRowDerived.highlightFirst} highlightAll={deckRowDerived.highlightAll} highlightedAppIds={effectiveHighlightedAppIds} hideStatusLine={effectiveHide} hideNewBadge={effectiveHideNewBadge} hideDiscountBadge={effectiveHideDiscountBadge} hideCompatIcons={effectiveHideCompatIcons} hideNonSteamBadge={effectiveHideNonSteamBadge} hideShelfTitle={effectiveHideShelfTitle} hideGameNames={effectiveHideGameNames} hideInstallIndicator={effectiveHideInstallIndicator} enableLogo={effectiveEnableLogo} enableIcon={effectiveEnableIcon} enableDescription={effectiveEnableDescription} descriptionBelowLogo={effectiveDescriptionBelowLogo} logoBelowShelf={effectiveLogoBelowShelf} logoPosition={effectiveLogoPosition} descriptionPosition={effectiveDescriptionPosition} logoSize={effectiveLogoSize} logoTopOffset={effectiveLogoTopOffset} iconVerticalAlign={effectiveIconVerticalAlign} shelfTitlePosition={effectiveShelfTitlePosition} gameNamePosition={effectiveGameNamePosition} playtimePosition={effectivePlaytimePosition} descriptionHeight={effectiveDescriptionHeight} descriptionLogoGap={effectiveDescriptionLogoGap} descriptionScale={effectiveDescriptionScale} forceExpanded={forceExpanded} fullPageLayoutOnly={fullPageLayout} pinScrollTop={deckRowDerived.pinScrollTop} forceLayoutAsRecents={forceLayoutAsRecents} heroEnabled={deckRowDerived.heroEnabled} heroLabelMount={heroLabelMount} infoAbove={deckRowDerived.infoAbove} friendsOverlay={deckRowDerived.friendsOverlay} friendsOverlayRecent={deckRowDerived.friendsOverlayRecent} forceCollapsed={forceCollapsed} autoCollapseWhenEmpty={autoCollapseWhenEmpty} />;
  /* Brief opacity dip while a user-triggered refresh is in flight so the
     click is never ambiguous — even when the resolver returns identical
     data, the shelf visibly fades and recovers, signalling that the
     refresh actually fired. */
  if (!refreshing) return row;
  return <div style={{ opacity: 0.45, transition: 'opacity 0.18s ease' }}>{row}</div>;
}

/* Shallow-prop memo: settings changes in unrelated sections (e.g. toggling a
   behavior switch elsewhere) rebuild ShelvesContainer but produce identical
   shelf/global props for most shelves — skipping those cascades avoids
   re-resolving appIds and re-rendering DeckRow for every pass. */
export const ShelfView = memo(ShelfViewImpl);
