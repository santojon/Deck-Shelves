
import { Spinner } from "@decky/ui";
import { memo, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Shelf } from "../types";
import { usePlatform } from "../runtime/platformContext";
import type { PlatformAppMeta } from "../runtime/platform";
import { DeckRow, type DeckRowItem } from "./DeckRow";
import { shouldShowMoreCard, shouldShowRefreshCard } from "./shelf/trailingCards";
import { showGameMenu, buildShelfContextMenu } from "../core/steamGameMenu";
import { saveFocusTarget } from "../core/focusRestore";
import { subscribeShelfRefresh } from "../core/shelfRefresh";
import { mark, measure } from "../core/perf";
import { logInfo } from "../runtime/logger";
import { applyManualOrder, invalidateRandomSortCache, getAllAppOverviews } from "../steam";
import { invalidateSmartShelfCache } from "../steam/smartShelves";
import { clearOnlineShelfCache, dispatchShelfModal, toggleShelfHiddenById, moveShelfById, duplicateShelfById } from "../core/shelfActions";
import { fetchGameNames } from "../core/onlineStore";
import { getCurrentSettings } from "../store/settingsStore";

/** Opens the Steam Store page for an appid using the best available method.
 *  Tries the steam:// protocol first since it is the only path that works
 *  reliably in Big Picture / Gaming Mode — WebChat.OpenURLInClient exists in
 *  Gaming Mode but silently routes to the (hidden) chat window. */
function openSteamStorePage(appid: number) {
  try {
    const sc = (globalThis as any).SteamClient;
    if (typeof sc?.URL?.ExecuteSteamURL === 'function') {
      sc.URL.ExecuteSteamURL(`steam://store/${appid}`);
      return;
    }
    if (typeof sc?.System?.OpenInSystemBrowser === 'function') {
      sc.System.OpenInSystemBrowser(`https://store.steampowered.com/app/${appid}/`);
      return;
    }
    if (typeof sc?.WebChat?.OpenURLInClient === 'function') {
      sc.WebChat.OpenURLInClient(`https://store.steampowered.com/app/${appid}/`);
      return;
    }
  } catch {}
}

/** Opens an arbitrary Steam Store URL. Same precedence as openSteamStorePage. */
function openSteamStoreUrl(url: string, steamUrl?: string) {
  try {
    const sc = (globalThis as any).SteamClient;
    if (steamUrl && typeof sc?.URL?.ExecuteSteamURL === 'function') {
      sc.URL.ExecuteSteamURL(steamUrl);
      return;
    }
    if (typeof sc?.System?.OpenInSystemBrowser === 'function') {
      sc.System.OpenInSystemBrowser(url);
      return;
    }
    if (typeof sc?.WebChat?.OpenURLInClient === 'function') {
      sc.WebChat.OpenURLInClient(url);
      return;
    }
  } catch {}
}

/** Reads discount% from the price cache for a given appid, or null. */
function getCachedDiscount(appid: number): number | null {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.('ds-price-cache-v1');
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const d = cache[appid]?.data?.discount;
    return typeof d === 'number' ? d : null;
  } catch { return null; }
}

const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function ShelfViewImpl({ shelf, globalMatchNativeSize = false, globalHighlightFirst = false, globalHighlightAll = false, globalHideStatusLine = false, globalHideNewBadge = false, globalHideCompatIcons = false, globalHideNonSteamBadge = false, globalHideShelfTitle = false, globalHideGameNames = false, globalHideInstallIndicator = false, globalHideSeeMore = false, globalHideRefreshCard = false, globalDedupeByName = false, forceExpanded = false }: { shelf: Shelf; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; globalHideGameNames?: boolean; globalHideInstallIndicator?: boolean; globalHideSeeMore?: boolean; globalHideRefreshCard?: boolean; globalDedupeByName?: boolean; forceExpanded?: boolean }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const cacheKey = `ds-shelf-cache-${shelf.id}-${shelf.sort ?? ''}-${(shelf as any).manualBaseSort ?? ''}-${(shelf as any).sortReverse ? 'r1' : 'r0'}-${(shelf as any).manualBaseSortReverse ? 'r1' : 'r0'}`;
  const effectiveSort = shelf.source?.type === "filter"
    ? (((shelf.source as any).filter?.sort as string | undefined) ?? shelf.sort)
    : shelf.sort;
  const [appIds, setAppIds] = useState<number[] | null>(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { ts, ids } = JSON.parse(raw);
        if (Date.now() - ts < 86400000) return effectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder) : ids; // 24h expiry
      }
    } catch (e) { logInfo("HOME", "shelf cache read failed", String(e)); }
    return null;
  });
  const [items, setItems] = useState<Map<number, PlatformAppMeta>>(new Map());
  const [storeNames, setStoreNames] = useState<Map<number, string>>(new Map());
  const [ownedNames, setOwnedNames] = useState<Set<string> | null>(null);
  const firstLoad = useRef(true);
  const [metaVersion, setMetaVersion] = useState(0);
  // Increments on every `resolve()` call; each in-flight promise captures
  // the id at start and bails on completion if the id has advanced —
  // prevents a slow resolve from overwriting a newer one (e.g. user
  // rapid-toggles sort or edits the filter while the previous fetch is
  // still pending).
  const resolveGenRef = useRef(0);
  // Exposed so the in-row refresh card (smart shelves with a refresh interval)
  // can re-trigger this shelf's resolve() without going through the global
  // refresh emitter — only this shelf's appIds need to flip.
  const resolveRef = useRef<() => void>(() => {});

  const sourceKey = useMemo(() => JSON.stringify({ source: shelf.source, sort: shelf.sort }), [shelf.source, shelf.sort]);

  useEffect(() => {
    let cancelled = false;
    if (!shelf.enabled) return;

    const resolve = () => {
      if (cancelled) return;
      const gen = ++resolveGenRef.current;
      try {
        mark(`shelf.resolve:${shelf.id}:start`);
        // On manual sort, resolve using the configured base sort (default
        // alphabetical) so items not in `manualOrder` follow the user-chosen
        // natural order. For filter sources the sort lives inside
        // `source.filter.sort` (the third arg is ignored by that branch),
        // so we clone the source and swap `filter.sort` to the base sort.
        const baseSort = (shelf as any).manualBaseSort ?? "alphabetical";
        const isManual = effectiveSort === "manual";
        // Asc/desc inversion. When manual, the base sort's reverse flag
        // applies. Otherwise the top-level shelf flag applies. `manual` and
        // `random` are skipped at the resolver level regardless.
        const resolveReverse = isManual
          ? !!(shelf as any).manualBaseSortReverse
          : !!(shelf as any).sortReverse;
        // When reverse is on but no explicit sort is persisted (regular shelf
        // default = "alphabetical" stored as undefined), force `alphabetical`
        // so the resolver actually calls `applySortToIds` and the reverse
        // flag has somewhere to apply. Without this, no-sort + reverse leaves
        // the source's natural order untouched.
        const resolveSort = isManual
          ? baseSort
          : (shelf.sort ?? (resolveReverse ? "alphabetical" : undefined));
        let resolveSource: any = shelf.source;
        if (isManual && shelf.source?.type === "filter") {
          resolveSource = { ...shelf.source, filter: { ...(shelf.source as any).filter, sort: baseSort } };
        }
        const dedupeByName = (shelf as any).dedupeByExactName === true || globalDedupeByName
        const hiddenAppIds: number[] | undefined = (shelf as any).hiddenAppIds?.length ? (shelf as any).hiddenAppIds : undefined
        platform.resolveShelfAppIds(resolveSource, shelf.limit, resolveSort, shelf.id, resolveReverse, { hiddenAppIds, dedupeByName: dedupeByName || undefined })
          .then((ids) => {
            if (cancelled || gen !== resolveGenRef.current) return;
            const finalIds = effectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder) : ids;
            setAppIds(finalIds);
            setMetaVersion((v) => v + 1);
            firstLoad.current = false;
            try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), ids })); } catch (e) { logInfo("HOME", "shelf cache write failed", String(e)); }
          })
          .catch(() => {
            if (cancelled || gen !== resolveGenRef.current) return;
            if (firstLoad.current) setAppIds([]);
          })
          .finally(() => {
            measure(`shelf.resolve:${shelf.id}`, `shelf.resolve:${shelf.id}:start`);
          });
      } catch {
        if (!cancelled && firstLoad.current) setAppIds([]);
      }
    };

    // Initial load
    resolve();
    resolveRef.current = resolve;

    // Subscribe to global refresh emitter (replaces per-shelf polling timer)
    const unsubRefresh = subscribeShelfRefresh(resolve);

    // Immediate re-resolve on settings change (source or limit changed)
    const onSettings = () => { if (!cancelled) resolve(); };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettings);

    return () => {
      cancelled = true;
      unsubRefresh();
      globalThis.removeEventListener("deck-shelves-settings-changed", onSettings);
    };
  }, [platform, shelf.enabled, shelf.limit, shelf.sort, sourceKey, (shelf as any).manualOrder?.join(",") ?? "", (shelf as any).manualBaseSort ?? "", (shelf as any).sortReverse === true, (shelf as any).manualBaseSortReverse === true]);

  useEffect(() => {
    let cancelled = false;
    if (!appIds || !appIds.length) {
      setItems(new Map());
      return;
    }
    (async () => {
      // Parallelize metadata lookups so cold-start (Steam restart) populates
      // the shelf in roughly one round-trip per shelf instead of N. Each
      // getAppMeta is independent and the underlying GetAllAppOverviews
      // fallback is already memoized for 10s, so concurrent callers share
      // work rather than duplicating it.
      const results = await Promise.all(appIds.map(async (appid): Promise<[number, PlatformAppMeta]> => {
        try { return [appid, await platform.getAppMeta(appid)]; }
        catch { return [appid, { appid, name: `App ${appid}` }]; }
      }));
      if (!cancelled) setItems(new Map(results));
    })();
    return () => { cancelled = true; };
  }, [platform, appIds?.join(","), metaVersion]);

  // Async name fetch for online-source items not in the local appStore.
  // Uses the public Steam Store API (appdetails?filters=basic) which works
  // from the browser without authentication.
  const isOnlineShelf = shelf.source.type === 'wishlist' || shelf.source.type === 'store';
  const excludeOwned = isOnlineShelf && (shelf.source as any).excludeOwned === true;
  const excludeOwnedNonSteam = excludeOwned && (shelf.source as any).excludeOwnedNonSteam === true;

  const [globalHideOwned, setGlobalHideOwned] = useState(() => getCurrentSettings()?.onlineHideOwnedGames === true);
  const [globalHideOwnedNonSteam, setGlobalHideOwnedNonSteam] = useState(() => getCurrentSettings()?.onlineHideOwnedNonSteam === true);

  useEffect(() => {
    const handler = () => {
      const s = getCurrentSettings();
      setGlobalHideOwned(s?.onlineHideOwnedGames === true);
      setGlobalHideOwnedNonSteam(s?.onlineHideOwnedNonSteam === true);
    };
    globalThis.addEventListener("deck-shelves-settings-changed", handler);
    return () => globalThis.removeEventListener("deck-shelves-settings-changed", handler);
  }, []);

  // Effective filter flags: true if either global or per-shelf toggle is active.
  const shouldHideOwned = isOnlineShelf && (globalHideOwned || excludeOwned);
  const effectiveNonSteam = (globalHideOwned && globalHideOwnedNonSteam) || (excludeOwned && excludeOwnedNonSteam);

  // Build a Set of locally-owned game names. Active when either filter is on.
  // Non-Steam shortcuts are included when the corresponding sub-toggle is on.
  useEffect(() => {
    if (!shouldHideOwned) { setOwnedNames(null); return; }
    let cancelled = false;
    getAllAppOverviews().then((apps) => {
      if (cancelled) return;
      const names = new Set<string>();
      for (const a of apps) {
        const nonSteam = !!(a as any)?.is_non_steam || (a as any)?.is_steam === false ||
          (a as any)?.m_eAppType === 1073741824 || (a as any)?.app_type === 1073741824;
        if (!effectiveNonSteam && nonSteam) continue;
        const n = (a as any)?.display_name ?? (a as any)?.name;
        if (typeof n === 'string' && n) names.add(n.trim().toLowerCase());
      }
      setOwnedNames(names);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [shouldHideOwned, effectiveNonSteam]);
  useEffect(() => {
    if (!isOnlineShelf || !appIds?.length) return;
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
    (async () => {
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
    return () => { cancelled = true; };
  }, [isOnlineShelf, appIds?.join(','), items]);

  const rowItems = useMemo((): DeckRowItem[] => {
    if (!appIds?.length) return [];
    const base = appIds.flatMap((appid): DeckRowItem[] => {
      const item = items.get(appid) ?? { appid, name: `App ${appid}` };
      const isStoreFallback = /^App \d+$/.test(item.name);
      const isOnlineSource = shelf.source.type === 'wishlist' || shelf.source.type === 'store';

      // Hide library games from online shelves when either the global or per-shelf toggle is on.
      if (!isStoreFallback && isOnlineSource && shouldHideOwned) return [];
      if (isStoreFallback && !isOnlineSource) return [];

      // Name-based filter: drops games whose name matches a locally-owned title.
      // Covers non-Steam shortcuts that share a name with a store entry (different
      // appid, so the appid check above misses them). Applies when either toggle is on.
      if (shouldHideOwned && ownedNames && isOnlineSource) {
        const n = (storeNames.get(appid) ?? '').trim().toLowerCase();
        if (n && ownedNames.has(n)) return [];
      }

      // Non-owned game from an online source: decorative card with CDN artwork.
      // Artwork URL: use the public Akamai CDN which has better global availability
      // than the Cloudflare edge for in-client requests. Clicking opens the Steam
      // Store page for the game (works natively in Big Picture via /library/app/).
      if (isStoreFallback && isOnlineSource) {
        const cdnPortrait = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
        const cdnHero = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
        const gameName = storeNames.get(appid) ?? `#${appid}`;
        const discountPct = getCachedDiscount(appid);
        // Online card menu: DS shelf actions only — no native Steam menu.
        // Uses buildShelfContextMenu for structure parity with regular shelves.
        const showOnlineMenu = () => {
          try {
            const dfl = (globalThis as any).DFL ?? (globalThis as any).deckyFrontendLib;
            const R = (globalThis as any).SP_REACT;
            if (!dfl?.showContextMenu || !R || !dfl.MenuItem || !dfl.Menu) return;
            const items = buildShelfContextMenu(shelf.id, appid, dfl, R);
            if (!items.length) return;
            const menu = R.createElement(dfl.Menu, { label: t('menu_shelf'), cancelText: t('cancel') }, ...items);
            dfl.showContextMenu(menu, null);
          } catch {}
        };
        return [{
          id: appid,
          appid,
          name: gameName,
          portraitUrl: cdnPortrait,
          heroUrl: cdnHero,
          onActivate: () => openSteamStorePage(appid),
          onMenuButton: showOnlineMenu,
          discountPercent: discountPct ?? undefined,
          shelfId: shelf.id,
        }];
      }

      // Pass `shelf.id` so the captured native menu (and the DFL fallback)
      // gain a `Deck Shelves > Shelf > […]` submenu — same afterPatch / HOC
      // afterPatch / HOC seam. Non-shelf game cards still get the
      // unmodified native menu via `showGameMenu(appid)`.
      const onMenuButton = () => showGameMenu(appid, shelf.id);
      const addedTs = (item as any).addedTimestamp;
      const addedMs = typeof addedTs === 'number' && addedTs > 0 ? (addedTs < 1e12 ? addedTs * 1000 : addedTs) : 0;
      const isNew = addedMs > 0 ? (Date.now() - addedMs) < NEW_GAME_WINDOW_MS : false;
      return [{
        id: appid,
        appid,
        name: item.name,
        portraitUrl: item.portraitUrl,
        heroUrl: item.heroUrl,
        onActivate: () => { saveFocusTarget(appid, shelf.id); platform.navigateToApp(appid); },
        onMenuButton,
        deckCompatCategory: item.deckCompatCategory,
        playtimeMinutes: item.playtimeMinutes,
        isInstalled: item.installed,
        updatePending: item.updatePending,
        isSteam: item.isSteam,
        isNew,
        statusText: item.installed != true ? t('status_not_installed') : undefined,
        discountPercent: getCachedDiscount(appid) ?? undefined,
        shelfId: shelf.id,
      }];
    });
    if (!base.length) return base;
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
    };
    if (shouldShowRefreshCard(trailingInput)) {
      const isSmart = (shelf.source as any)?.type === 'smart';
      const refreshName = isOnlineShelf ? t('refresh_cache') : t('refresh');
      base.push({
        id: `${shelf.id}__refresh`,
        name: refreshName,
        isRefresh: true,
        onActivate: () => {
          if (isOnlineShelf) {
            clearOnlineShelfCache();
          } else if (isSmart) {
            invalidateSmartShelfCache(shelf.id);
          } else {
            invalidateRandomSortCache(shelf.id);
          }
          resolveRef.current();
        },
      });
    }
    if (shouldShowMoreCard(trailingInput)) {
      const moreLabel = isOnlineShelf
        ? (shelf.source.type === 'wishlist' ? t('view_more_wishlist') : t('view_more_store'))
        : t('view_more');
      // Online "see more": open the wishlist or Steam Store browse page.
      const moreActivate = isOnlineShelf
        ? () => {
            const url = shelf.source.type === 'wishlist'
              ? ((globalThis as any).urlStore?.m_steamUrls?.userwishlist?.url
                  ?? 'https://store.steampowered.com/wishlist/')
              : 'https://store.steampowered.com/specials/';
            openSteamStoreUrl(url, `steam://openurl/${url}`);
          }
        : () => platform.navigateToShelfSource?.(shelf.source, shelf.title);
      base.push({
        id: `${shelf.id}__more`,
        name: moreLabel,
        isMoreLink: true,
        onActivate: moreActivate,
      });
    }
    return base;
  }, [appIds, items, storeNames, ownedNames, shouldHideOwned, shelf.id, shelf.source, shelf.sort, shelf.title, platform, t, globalHideSeeMore, globalHideRefreshCard, (shelf as any).hideSeeMore, (shelf as any).hideRefreshCard]);

  if (!shelf.enabled || shelf.hidden) return null;
  if (appIds === null) return <div style={{ padding: 10 }}><Spinner /></div>;
  if (!appIds.length) return null;

  // Spinner during the meta-fetch transition is gated to first load only.
  // Without this gate, every refresh that updates `appIds` faster than the
  // meta lookup briefly empties `rowItems` (new ids haven't landed in the
  // `items` map yet) and the shelf flashes a 30 px spinner band — visible
  // as a loading-space gap between shelves whenever the global refresh
  // emitter fires (game launch, install/uninstall, 30 s poll). After the
  // first successful render, transitions just keep the prior content
  // visible until the new meta lands.
  if (!rowItems.length && items.size > 0 && metaVersion < 5 && firstLoad.current) {
    return <div style={{ padding: 10 }}><Spinner /></div>;
  }
  if (!rowItems.length) return null;

  const effectiveHide = globalHideStatusLine === true ? true : (shelf.hideStatusLine === true) || isOnlineShelf;
  const effectiveHideNewBadge = globalHideNewBadge === true ? true : (shelf.hideNewBadge === true);
  const effectiveHideCompatIcons = globalHideCompatIcons === true ? true : (shelf.hideCompatIcons === true);
  const effectiveHideNonSteamBadge = globalHideNonSteamBadge === true ? true : (shelf.hideNonSteamBadge === true);
  const effectiveHideShelfTitle = globalHideShelfTitle === true ? true : ((shelf as any).hideShelfTitle === true);
  const effectiveHideGameNames = globalHideGameNames === true ? true : ((shelf as any).hideGameNames === true);
  const effectiveHideInstallIndicator = globalHideInstallIndicator === true ? true : ((shelf as any).hideInstallIndicator === true) || isOnlineShelf;
  return <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} matchNativeSize={globalMatchNativeSize || shelf.matchNativeSize} highlightFirst={globalHighlightFirst || shelf.highlightFirst} highlightAll={globalHighlightAll || shelf.highlightAll} highlightedAppIds={shelf.highlightedAppIds} hideStatusLine={effectiveHide} hideNewBadge={effectiveHideNewBadge} hideCompatIcons={effectiveHideCompatIcons} hideNonSteamBadge={effectiveHideNonSteamBadge} hideShelfTitle={effectiveHideShelfTitle} hideGameNames={effectiveHideGameNames} hideInstallIndicator={effectiveHideInstallIndicator} forceExpanded={forceExpanded} heroEnabled={(shelf as any).heroEnabled === true} />;
}

// Shallow-prop memo: settings changes in unrelated sections (e.g. toggling a
// behavior switch elsewhere) rebuild ShelvesContainer but produce identical
// shelf/global props for most shelves — skipping those cascades avoids
// re-resolving appIds and re-rendering DeckRow for every pass.
export const ShelfView = memo(ShelfViewImpl);
