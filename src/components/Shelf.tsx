import { memo, useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { resolveDiscountBadgeModes } from './shelf/discountBadge';
import { withDefaults } from "./withDefaults";
import { useTranslation } from "react-i18next";
import type { Shelf } from "../types";
import { usePlatform } from "../runtime/platformContext";
import type { PlatformAppMeta } from "../runtime/platform";
import { DeckRow, type DeckRowItem } from "./DeckRow";
import { shouldShowMoreCard, shouldShowRefreshCard } from "./shelf/trailingCards";
import { subscribeShelfRefresh } from "../core/shelfRefresh";
import { shelfDependencies, depsIntersect } from "../domain/shelfDeps";
import { maybeSubscribeContextInvalidation } from "../core/contextAwareShelves";
import { hasExternalSource } from "../core/pluginApi";
import { mark, measure } from "../core/perf";
import { recordMountFetch, recordMountCardsProcessed } from "../core/perfMetrics";
import { logInfo } from "../runtime/logger";
import { applyManualOrder, getAllAppOverviews, getLocalLibraryAppIds, manualResolveLimit } from "../steam";
import { normalizeTitleForMatch } from "../steam/dedupe";
import { fetchGameNames } from "../core/onlineStore";
import { decodeHtmlEntities } from "../domain/sourceUtils";
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
import { readShelfMetaCache, writeShelfMetaCache } from "./shelf/shelfMetaCache";
import { ShelfSkeleton } from "./shelf/ShelfSkeleton";
import { stabilizeRowItems } from "./shelf/rowItemsStable";
import { recallShelfHeight } from "./shelf/shelfViewportGate";
import { getPendingFocusTarget } from "../core/focusRestore";

function ownedNameKey(a: any): string | null {
  const n = (a as any)?.display_name ?? (a as any)?.name;
  if (typeof n !== 'string' || !n) return null;
  return normalizeTitleForMatch(n) || null;
}

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
  logoPosition: 'left' | 'center' | 'right' | undefined;
  descriptionPosition: 'left' | 'center' | 'right' | undefined;
  logoSize: number | undefined;
  logoTopOffset: number | undefined;
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
function resolveBoolFlag(globalVal: boolean, shelfVal: unknown, forceOn = false): boolean {
  if (globalVal === true) return true;
  return shelfVal === true || forceOn;
}
function resolveEnableFlag(lightMode: boolean, globalVal: boolean, shelfVal: unknown): boolean {
  return !lightMode && (globalVal === true || shelfVal === true);
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

export function computeEffectiveShelfDisplayProps(shelf: any, isOnlineShelf: boolean, g: ShelfDisplayGlobals) {
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
    effectiveEnableLogo: resolveEnableFlag(lightMode, g.enableLogo, shelf.enableLogo),
    effectiveEnableIcon: resolveEnableFlag(lightMode, g.enableIcon, shelf.enableIcon),
    effectiveEnableDescription: resolveEnableFlag(lightMode, g.enableDescription, shelf.enableDescription),
    effectiveDescriptionScale: descriptionScalePercent / 100,
    effectiveDescriptionBelowLogo: resolveBoolFlag(g.descriptionBelowLogo, shelf.descriptionBelowLogo),
    effectiveLogoBelowShelf: resolveBoolFlag(g.logoBelowShelf, shelf.logoBelowShelf),
    effectiveLogoPosition: resolvePosition(isValidPos, g.logoPosition, shelf.logoPosition, 'left'),
    effectiveDescriptionPosition: resolvePosition(isValidPos, g.descriptionPosition, shelf.descriptionPosition, 'left'),
    effectiveLogoSize: resolveClampedNumber(g.logoSize, shelf.logoSize, 50, 200, 100),
    effectiveLogoTopOffset: resolveClampedNumber(g.logoTopOffset, shelf.logoTopOffset, -50, 100, 20),
    fullPageLayout: resolveBoolFlag(g.fullPageShelf, shelf.fullPageShelf),
    effectiveIconVerticalAlign: resolvePosition(isValidVAlign, g.iconVerticalAlign, shelf.iconVerticalAlign, 'top'),
    effectiveShelfTitlePosition: resolvePosition(isValidPos, g.shelfTitlePosition, shelf.shelfTitlePosition, 'left'),
    effectiveGameNamePosition: resolvePosition(isValidPos, g.gameNamePosition, shelf.gameNamePosition, 'left'),
    effectivePlaytimePosition: resolvePosition(isValidPos, g.playtimePosition, shelf.playtimePosition, 'left'),
    effectiveDescriptionHeight: resolveClampedNumber(g.descriptionHeight, shelf.descriptionHeight, 1, 3, 2),
    effectiveDescriptionLogoGap: resolveClampedNumber(readGlobalSetting('globalDescriptionLogoGap'), shelf.descriptionLogoGap, -40, 80, 10),
    effectiveDiscountBadgeMode: resolveDiscountBadgeModes(getCurrentSettings(), shelf).normal,
  };
}

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

type HPos = 'left' | 'center' | 'right';

type ShelfViewProps = {
  shelf: Shelf; eagerRender?: boolean; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean;
  globalHighlightRandom?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideDiscountBadge?: boolean;
  globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; globalHideGameNames?: boolean;
  globalHideInstallIndicator?: boolean; globalHideSeeMore?: boolean; globalHideRefreshCard?: boolean; globalHeroEnabled?: boolean;
  globalGameInfoAbove?: boolean; globalFriendsPlayingOverlay?: boolean; globalFriendsPlayingOverlayRecent?: boolean; globalDedupeByName?: boolean;
  globalEnableLogo?: boolean; globalEnableIcon?: boolean; globalEnableDescription?: boolean; globalDescriptionBelowLogo?: boolean;
  globalLogoBelowShelf?: boolean; globalLogoPosition?: HPos; globalDescriptionPosition?: HPos; globalLogoSize?: number; globalLogoTopOffset?: number;
  globalFullPageShelf?: boolean; globalIconVerticalAlign?: 'top' | 'center' | 'bottom' | null; globalShelfTitlePosition?: HPos | null;
  globalGameNamePosition?: HPos | null; globalPlaytimePosition?: HPos | null; globalDescriptionHeight?: number | null;
  heroForced?: boolean; heroLabelMount?: boolean; forceExpanded?: boolean; forceLayoutAsRecents?: boolean; forceCollapsed?: boolean;
  autoCollapseWhenEmpty?: boolean;
};

const SHELF_VIEW_DEFAULTS = {
  globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHighlightRandom: false,
  globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false,
  globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false,
  globalHideSeeMore: false, globalHideRefreshCard: false, globalHeroEnabled: false, globalGameInfoAbove: false,
  globalFriendsPlayingOverlay: false, globalFriendsPlayingOverlayRecent: false, globalDedupeByName: false,
  globalEnableLogo: false, globalEnableIcon: false, globalEnableDescription: false, globalDescriptionBelowLogo: false,
  globalLogoBelowShelf: false,
  globalFullPageShelf: false, heroForced: false, heroLabelMount: false, forceExpanded: false, forceLayoutAsRecents: false,
  forceCollapsed: false, autoCollapseWhenEmpty: false, eagerRender: true,
} as const satisfies Partial<ShelfViewProps>;

function pendingRestoreShelf(shelfId: string): boolean {
  try { return getPendingFocusTarget()?.shelfId === shelfId; } catch { return false; }
}

type PlaceholderArgs = {
  shelf: Shelf; appIds: number[] | null; rowItemCount: number; itemCount: number; metaVersion: number; firstLoad: boolean;
  near: boolean; onNear: () => void; hideTitle: boolean; t: ReturnType<typeof useTranslation>["t"];
};

function shelfPlaceholder(a: PlaceholderArgs): ReactNode | undefined {
  const { shelf, appIds, hideTitle } = a;
  if (appIds === null) return <ShelfSkeleton shelf={shelf} count={Math.min(shelf.limit ?? 8, 8)} hideTitle={hideTitle} />;
  if (!appIds.length) return null;
  if (shouldShowMetaSpinner(a.rowItemCount, a.itemCount, a.metaVersion, a.firstLoad)) {
    return <ShelfSkeleton shelf={shelf} count={Math.min(appIds.length, 10)} hideTitle={hideTitle} />;
  }
  if (!a.rowItemCount) {
    return unavailableExternalSourceId(shelf) ? renderUnavailableSourceNotice(shelf.title, a.t('shelf_source_unavailable')) : null;
  }
  if (!a.near) return <ShelfSkeleton shelf={shelf} count={Math.min(a.rowItemCount, 10)} hideTitle={hideTitle} onNear={a.onNear} heightHint={recallShelfHeight(shelf.id)} />;
  return undefined;
}

function ShelfViewImpl(props: ShelfViewProps) {
  const {
    shelf, globalMatchNativeSize, globalHighlightFirst, globalHighlightAll, globalHighlightRandom, globalHideStatusLine, globalHideNewBadge,
    globalHideDiscountBadge, globalHideCompatIcons, globalHideNonSteamBadge, globalHideShelfTitle, globalHideGameNames, globalHideInstallIndicator,
    globalHideSeeMore, globalHideRefreshCard, globalHeroEnabled, globalGameInfoAbove, globalFriendsPlayingOverlay, globalFriendsPlayingOverlayRecent,
    globalDedupeByName, globalEnableLogo, globalEnableIcon, globalEnableDescription, globalDescriptionBelowLogo, globalLogoBelowShelf,
    globalLogoPosition, globalDescriptionPosition, globalLogoSize, globalLogoTopOffset, globalFullPageShelf, globalIconVerticalAlign,
    globalShelfTitlePosition, globalGameNamePosition, globalPlaytimePosition, globalDescriptionHeight, heroForced, heroLabelMount,
    forceExpanded, forceLayoutAsRecents, forceCollapsed, autoCollapseWhenEmpty, eagerRender,
  } = withDefaults(props, SHELF_VIEW_DEFAULTS);
  const { t } = useTranslation();
  const platform = usePlatform();
  const cacheKey = computeShelfCacheKey(shelf);
  const { primaryEffectiveSort } = computeEffectiveSort(shelf);
  const warmRef = useRef<ShelfWarmEntry | null | undefined>(undefined);
  if (warmRef.current === undefined) warmRef.current = getShelfWarmEntry(shelf.id);
  const warm = warmRef.current;
  const diskSeededRef = useRef(false);
  const [appIds, setAppIds] = useState<number[] | null>(() => {
    if (warm) return warm.appIds;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { ts, ids } = JSON.parse(raw);
        if (Date.now() - ts < SHELF_CACHE_TTL_MS) {
          diskSeededRef.current = true;
          return primaryEffectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder, (shelf as any).hiddenAppIds) : ids;
        }
      }
    } catch (e) { logInfo("HOME", "shelf cache read failed", String(e)); }
    return null;
  });
  const [items, setItems] = useState<Map<number, PlatformAppMeta>>(() => {
    if (warm) return new Map(warm.items);
    return (diskSeededRef.current && appIds?.length ? readShelfMetaCache(cacheKey, appIds) : null) ?? new Map();
  });
  const [sourceIds, setSourceIds] = useState<number[] | null>(() => warm ? warm.sourceIds : null);
  const [storeNames, setStoreNames] = useState<Map<number, string>>(() => warm ? new Map(warm.storeNames) : new Map());
  const [priceVersion, setPriceVersion] = useState(0);
  const [ownedNames, setOwnedNames] = useState<Set<string> | null>(null);
  const firstLoad = useRef(!warm && items.size === 0);
  useEffect(() => { if (diskSeededRef.current) markShelfResolved(shelf.id); }, [shelf.id]);
  const [near, setNear] = useState(() => eagerRender || pendingRestoreShelf(shelf.id));
  const onNear = useCallback(() => setNear(true), []);
  const [metaVersion, setMetaVersion] = useState(0);
  // Lets a slow resolve bail when a newer one has started.
  const resolveGenRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedTotalRef = useRef<number | undefined>(warm ? warm.resolvedTotal : undefined);

  const sourceKey = useMemo(() => JSON.stringify({ source: shelf.source, sort: shelf.sort }), [shelf.source, shelf.sort]);

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
        const resolveLimit = primaryEffectiveSort === "manual" ? manualResolveLimit(shelf.limit, (shelf as any).manualOrder) : shelf.limit;
        platform.resolveShelfAppIds(resolveSource, resolveLimit, resolveSort, shelf.id, resolveReverse, { hiddenAppIds, dedupeByName: dedupeByName || undefined, onResolveTotal: (n) => { resolvedTotalRef.current = n; } })
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

    resolve();
    bumpResolveGenCounter(shelf.id);

    const deps = shelfDependencies(shelf.source, shelf.sort as any);
    const unsubRefresh = subscribeShelfRefresh((opts) => {
      if (!opts?.manual && !depsIntersect(deps, opts?.deps)) return;
      const showVisual = !!opts?.manual && (!opts.shelfId || opts.shelfId === shelf.id);
      resolve(showVisual ? { manual: true } : undefined);
    });

    let settingsTimer: ReturnType<typeof setTimeout> | null = null;
    const onSettings = () => {
      if (cancelled) return;
      if (settingsTimer !== null) clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => { settingsTimer = null; resolve(); }, 200);
    };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettings);

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
  // shelf.sort stays out of the deps: an array sort is a new reference on every render.

  useEffect(() => {
    let cancelled = false;
    if (!appIds || !appIds.length) {
      setItems(new Map());
      return;
    }
    // Warming descriptions for every card at mount blocks the main thread; load them on demand.
    void (async () => {
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
      if (cancelled) return;
      writeShelfMetaCache(cacheKey, appIds, new Map(results));
      setItems((prev) => {
        const next = new Map(prev);
        for (const [id, meta] of results) next.set(id, meta);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [platform, joinOrEmpty(appIds), metaVersion]);

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

  const { shouldHideOwned, effectiveNonSteam, effectiveCloud } = computeOwnedHideFlags({
    isOnlineShelf, compositeHasOnlineChild, globalHideOwned, excludeOwned,
    globalHideOwnedNonSteam, excludeOwnedNonSteam, perShelfHideOwnedCloud, globalHideOwnedCloud,
  });

  const [ownedAppIds, setOwnedAppIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (!shouldHideOwned) { setOwnedAppIds(null); setOwnedNames(null); return; }
    setOwnedAppIds(getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud));
    let cancelled = false;
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
    const NAME_CACHE_KEY = 'ds-game-name-cache-v1';
    const nameCache: Record<number, string> = (() => {
      try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}'); } catch { return {}; }
    })();
    const cached = new Map<number, string>();
    for (const id of appIds) {
      if (nameCache[id]) cached.set(id, decodeHtmlEntities(nameCache[id]));
    }
    if (cached.size) setStoreNames(prev => { const n = new Map(prev); cached.forEach((v, k) => n.set(k, v)); return n; });
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

  const prevRowItemsRef = useRef<DeckRowItem[]>([]);
  const rowItems = useMemo((): DeckRowItem[] => {
    const stable = stabilizeRowItems(prevRowItemsRef.current, buildRowItems());
    prevRowItemsRef.current = stable;
    return stable;
  }, [appIds, items, storeNames, ownedNames, ownedAppIds, shouldHideOwned, shelf.id, shelf.limit, shelf.source, shelf.sort, shelf.title, platform, t, globalHideSeeMore, globalHideRefreshCard, (shelf as any).hideSeeMore, (shelf as any).hideRefreshCard, jsonOrNull((shelf as any).syntheticCards), priceVersion]);

  function buildRowItems(): DeckRowItem[] {
    if (!appIds?.length) return [];
    const isOnlineSource = isOnlineSourceForShelf(shelf, sourceIncludesNonOwned);
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
    // Cap after filtering; the resolver overshoots so filters don't leave the shelf short.
    if (base.length > shelf.limit) base.length = shelf.limit;
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
    insertSyntheticCards(base, shelf);
    return base;
  }

  const manualOrder: number[] = orEmptyArray((shelf as any).manualOrder);
  const removableSet = useMemo(() => {
    if (!manualOrder.length || !sourceIds) return undefined;
    const inSrc = new Set(sourceIds);
    const tail = manualOrder.filter((id) => !inSrc.has(id));
    return tail.length ? new Set(tail) : undefined;
  }, [manualOrder, sourceIds]);

  if (shouldSkipShelf(shelf)) return null;
  const hideSkeletonTitle = globalHideShelfTitle || (shelf as any).hideShelfTitle === true;
  const placeholder = shelfPlaceholder({
    shelf, appIds, rowItemCount: rowItems.length, itemCount: items.size, metaVersion, firstLoad: firstLoad.current,
    near, onNear, hideTitle: hideSkeletonTitle, t,
  });
  if (placeholder !== undefined) return placeholder;

  const effectiveHighlightedAppIds = computeEffectiveHighlightedAppIds(
    shelf.highlightedAppIds,
    appIds,
    shelf.id,
    resolveHighlightRandom(globalHighlightRandom, shelf),
  );
  const {
    lightMode, effectiveHide, effectiveHideNewBadge, effectiveHideDiscountBadge, effectiveHideCompatIcons,
    effectiveHideNonSteamBadge, effectiveHideShelfTitle, effectiveHideGameNames, effectiveHideInstallIndicator,
    effectiveEnableLogo, effectiveEnableIcon, effectiveEnableDescription, effectiveDescriptionScale,
    effectiveDescriptionBelowLogo, effectiveLogoBelowShelf, effectiveLogoPosition, effectiveDescriptionPosition,
    effectiveLogoSize, effectiveLogoTopOffset, fullPageLayout, effectiveIconVerticalAlign,
    effectiveShelfTitlePosition, effectiveGameNamePosition, effectivePlaytimePosition, effectiveDescriptionHeight,
    effectiveDescriptionLogoGap, effectiveDiscountBadgeMode,
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
  const row = <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} removableSet={removableSet} matchNativeSize={deckRowDerived.matchNativeSize} highlightFirst={deckRowDerived.highlightFirst} highlightAll={deckRowDerived.highlightAll} highlightedAppIds={effectiveHighlightedAppIds} hideStatusLine={effectiveHide} hideNewBadge={effectiveHideNewBadge} hideDiscountBadge={effectiveHideDiscountBadge} discountBadgeMode={effectiveDiscountBadgeMode} hideCompatIcons={effectiveHideCompatIcons} hideNonSteamBadge={effectiveHideNonSteamBadge} hideShelfTitle={effectiveHideShelfTitle} hideGameNames={effectiveHideGameNames} hideInstallIndicator={effectiveHideInstallIndicator} enableLogo={effectiveEnableLogo} enableIcon={effectiveEnableIcon} enableDescription={effectiveEnableDescription} descriptionBelowLogo={effectiveDescriptionBelowLogo} logoBelowShelf={effectiveLogoBelowShelf} logoPosition={effectiveLogoPosition} descriptionPosition={effectiveDescriptionPosition} logoSize={effectiveLogoSize} logoTopOffset={effectiveLogoTopOffset} iconVerticalAlign={effectiveIconVerticalAlign} shelfTitlePosition={effectiveShelfTitlePosition} gameNamePosition={effectiveGameNamePosition} playtimePosition={effectivePlaytimePosition} descriptionHeight={effectiveDescriptionHeight} descriptionLogoGap={effectiveDescriptionLogoGap} descriptionScale={effectiveDescriptionScale} forceExpanded={forceExpanded} fullPageLayoutOnly={fullPageLayout} pinScrollTop={deckRowDerived.pinScrollTop} forceLayoutAsRecents={forceLayoutAsRecents} heroEnabled={deckRowDerived.heroEnabled} heroLabelMount={heroLabelMount} infoAbove={deckRowDerived.infoAbove} friendsOverlay={deckRowDerived.friendsOverlay} friendsOverlayRecent={deckRowDerived.friendsOverlayRecent} forceCollapsed={forceCollapsed} autoCollapseWhenEmpty={autoCollapseWhenEmpty} />;
  if (!refreshing) return row;
  return <div style={{ opacity: 0.45, transition: 'opacity 0.18s ease' }}>{row}</div>;
}

export const ShelfView = memo(ShelfViewImpl);
