
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
import { subscribeShelfRefresh, triggerShelfRefresh } from "../core/shelfRefresh";
import { mark, measure } from "../core/perf";
import { logInfo } from "../runtime/logger";
import { applyManualOrder, invalidateRandomSortCache, getAllAppOverviews, getLocalLibraryAppIds } from "../steam";
import { normalizeTitleForMatch } from "../steam/dedupe";
import { invalidateSmartShelfCache } from "../steam/smartShelves";
import { clearOnlineShelfCache } from "../core/shelfActions";
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

function ShelfViewImpl({ shelf, globalMatchNativeSize = false, globalHighlightFirst = false, globalHighlightAll = false, globalHideStatusLine = false, globalHideNewBadge = false, globalHideDiscountBadge = false, globalHideCompatIcons = false, globalHideNonSteamBadge = false, globalHideShelfTitle = false, globalHideGameNames = false, globalHideInstallIndicator = false, globalHideSeeMore = false, globalHideRefreshCard = false, globalHeroEnabled = false, globalDedupeByName = false, heroForced = false, heroLabelMount = false, forceExpanded = false, forceLayoutAsRecents = false }: { shelf: Shelf; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideDiscountBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; globalHideGameNames?: boolean; globalHideInstallIndicator?: boolean; globalHideSeeMore?: boolean; globalHideRefreshCard?: boolean; globalHeroEnabled?: boolean; globalDedupeByName?: boolean; heroForced?: boolean; heroLabelMount?: boolean; forceExpanded?: boolean; forceLayoutAsRecents?: boolean }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const cacheKey = `ds-shelf-cache-${shelf.id}-${shelf.sort ?? ''}-${(shelf as any).manualBaseSort ?? ''}-${(shelf as any).sortReverse ? 'r1' : 'r0'}-${(shelf as any).manualBaseSortReverse ? 'r1' : 'r0'}`;
  const effectiveSort = shelf.source?.type === "filter"
    ? (((shelf.source as any).filter?.sort as string | string[] | undefined) ?? shelf.sort)
    : shelf.sort;
  // Manual order applies only when the PRIMARY sort key is "manual".
  // Multi-key shelves treat the first array entry as primary.
  const primaryEffectiveSort = Array.isArray(effectiveSort) ? effectiveSort[0] : effectiveSort;
  const [appIds, setAppIds] = useState<number[] | null>(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { ts, ids } = JSON.parse(raw);
        if (Date.now() - ts < 86400000) return primaryEffectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder, (shelf as any).hiddenAppIds) : ids; // 24h expiry
      }
    } catch (e) { logInfo("HOME", "shelf cache read failed", String(e)); }
    return null;
  });
  const [items, setItems] = useState<Map<number, PlatformAppMeta>>(new Map());
  // Resolver's pre-applyManualOrder ids — used to compute the X-button
  // "Remove from shelf" set on the home shelf. Cards in manualOrder but
  // NOT in `sourceIds` are the menu-added games (truly removable);
  // drag-ordered manualOrder entries that ARE in sourceIds get X=hide
  // instead so removing them doesn't just bounce them back to the
  // source-default slot.
  const [sourceIds, setSourceIds] = useState<number[] | null>(null);
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
  // Visual "I just refreshed" indicator. Driven by `manual: true` arriving
  // from `triggerShelfRefresh()` (user-clicked refresh card, context-menu
  // "Refresh cache", manage page). Held for at least 320 ms even when the
  // resolver is instant so the user perceives the action when the data
  // hasn't actually changed. Auto-poll refreshes (every 30 s) and Steam-
  // event-driven refreshes pass no `manual` flag and remain silent.
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceKey = useMemo(() => JSON.stringify({ source: shelf.source, sort: shelf.sort }), [shelf.source, shelf.sort]);

  useEffect(() => {
    let cancelled = false;
    if (!shelf.enabled) return;

    const resolve = (opts?: { manual?: boolean }) => {
      if (cancelled) return;
      const gen = ++resolveGenRef.current;
      if (opts?.manual) {
        setRefreshing(true);
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          setRefreshing(false);
        }, 320);
      }
      try {
        mark(`shelf.resolve:${shelf.id}:start`);
        // On manual sort, resolve using the configured base sort (default
        // alphabetical) so items not in `manualOrder` follow the user-chosen
        // natural order. For filter sources the sort lives inside
        // `source.filter.sort` (the third arg is ignored by that branch),
        // so we clone the source and swap `filter.sort` to the base sort.
        // Base sort can be a string OR a multi-key chain (string[]).
        const baseSort: string | string[] = (shelf as any).manualBaseSort ?? "alphabetical";
        const isManual = primaryEffectiveSort === "manual";
        // Asc/desc inversion. When manual, the base sort's reverse flag
        // applies (now also accepts boolean[] aligned with the multi-key
        // chain). Otherwise the top-level shelf flag applies. `manual`
        // and `random` are skipped at the resolver level regardless.
        const rawShelfReverse = (shelf as any).sortReverse;
        const rawBaseReverse = (shelf as any).manualBaseSortReverse;
        const resolveReverse: boolean | boolean[] = isManual
          ? (Array.isArray(rawBaseReverse) ? rawBaseReverse : !!rawBaseReverse)
          : (Array.isArray(rawShelfReverse) ? rawShelfReverse : !!rawShelfReverse);
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
            const finalIds = primaryEffectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder, hiddenAppIds) : ids;
            setAppIds(finalIds);
            setSourceIds(ids);
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

    // Subscribe to global refresh emitter (replaces per-shelf polling
    // timer). The wrapper scopes the `manual` visual indicator: every
    // shelf still re-resolves, but only the one matching `opts.shelfId`
    // (or all when no shelfId is set, as a defensive fallback for any
    // future caller that doesn't carry a scope) shows the dim flash.
    const unsubRefresh = subscribeShelfRefresh((opts) => {
      const showVisual = !!opts?.manual && (!opts.shelfId || opts.shelfId === shelf.id);
      resolve(showVisual ? { manual: true } : undefined);
    });

    // Immediate re-resolve on settings change (source or limit changed)
    const onSettings = () => { if (!cancelled) resolve(); };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettings);

    return () => {
      cancelled = true;
      unsubRefresh();
      globalThis.removeEventListener("deck-shelves-settings-changed", onSettings);
      if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }
    };
  }, [platform, shelf.enabled, shelf.limit, shelf.sort, sourceKey, (shelf as any).manualOrder?.join(",") ?? "", (shelf as any).manualBaseSort ?? "", (shelf as any).sortReverse === true, (shelf as any).manualBaseSortReverse === true, (shelf as any).hiddenAppIds?.join(",") ?? ""]);

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
      // Merge instead of replace: keeps the prior meta for any appid that
      // survived the refresh visible during the brief gap before the new
      // results arrive. Without this, the regular branch in `rowItems`
      // strips cards whose meta name still matches `App \d+` (the synthetic
      // fallback) while waiting — visible to the user as cards vanishing
      // mid-refresh and only reappearing on scroll/reflow.
      if (!cancelled) setItems((prev) => {
        const next = new Map(prev);
        for (const [id, meta] of results) next.set(id, meta);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [platform, appIds?.join(","), metaVersion]);

  // Async name fetch for online-source items not in the local appStore.
  // Uses the public Steam Store API (appdetails?filters=basic) which works
  // from the browser without authentication.
  const isOnlineShelf = shelf.source.type === 'wishlist' || shelf.source.type === 'store';
  const excludeOwned = isOnlineShelf && (shelf.source as any).excludeOwned === true;
  const excludeOwnedNonSteam = excludeOwned && (shelf.source as any).excludeOwnedNonSteam === true;
  const perShelfHideOwnedCloud = (shelf.source as any).hideOwnedNonSteamCloud;

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

  // Effective filter flags: true if either global or per-shelf toggle is active.
  const shouldHideOwned = isOnlineShelf && (globalHideOwned || excludeOwned);
  const effectiveNonSteam = (globalHideOwned && globalHideOwnedNonSteam) || (excludeOwned && excludeOwnedNonSteam);
  // Cloud-play sub-toggle: per-shelf overrides global. Only meaningful
  // when non-Steam hiding is also on.
  const effectiveCloud = effectiveNonSteam && (perShelfHideOwnedCloud === true || (perShelfHideOwnedCloud === undefined && globalHideOwnedCloud));

  // Owned appid set from collectionStore — matches the resolver's logic so
  // render and resolver agree on what counts as owned.
  const [ownedAppIds, setOwnedAppIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (!shouldHideOwned) { setOwnedAppIds(null); setOwnedNames(null); return; }
    setOwnedAppIds(getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud));
    let cancelled = false;
    // Name-based dedup must honor the same scope toggles the appid-based
    // dedup does. Earlier this used `getLocalLibraryAppIds(true, true)`
    // unconditionally, on the rationale that "if the user owns Hades
    // anywhere, they don't want it on the wishlist". On devices with a
    // large Unifideck Microsoft library (cloud-play shortcuts the user
    // does NOT actually own) that broad scope hid wishlist items the
    // user genuinely doesn't have — exactly the symptom of "games I
    // don't own are being hidden". Scoping the name set with the same
    // effective flags keeps the heuristic for real local titles while
    // letting the cloud-play sub-toggle suppress the over-aggressive
    // matches.
    getAllAppOverviews().then((apps) => {
      if (cancelled) return;
      const ownedSetForNames = getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud);
      const names = new Set<string>();
      for (const a of apps) {
        const id = Number((a as any)?.appid);
        if (!ownedSetForNames.has(id)) continue;
        const n = (a as any)?.display_name ?? (a as any)?.name;
        // Cross-source name matching: same normalisation as the wishlist
        // compare below so "Kingdom Come Deliverance" (non-Steam local)
        // matches "Kingdom Come: Deliverance" (Steam wishlist). The
        // previous `n.trim().toLowerCase()` left punctuation intact and
        // silently leaked owned titles through to the row.
        if (typeof n === 'string' && n) {
          const key = normalizeTitleForMatch(n);
          if (key) names.add(key);
        }
      }
      setOwnedNames(names);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [shouldHideOwned, effectiveNonSteam, effectiveCloud]);
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
      // Online treatment also applies when the shelf is a composite
      // whose children include a wishlist / store source — those
      // children return remote-only appids that won't be in the local
      // appStore, so the stub `App {id}` name is legitimate and the
      // CDN-art branch below must render them instead of dropping them.
      const isOnlineSource =
        shelf.source.type === 'wishlist' ||
        shelf.source.type === 'store' ||
        (shelf.source.type === 'composite' && Array.isArray((shelf.source as any).sources)
          && (shelf.source as any).sources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store'));

      // Hide owned games on online shelves via the collectionStore-based set.
      if (isOnlineSource && shouldHideOwned && ownedAppIds && ownedAppIds.has(appid)) return [];
      if (isStoreFallback && !isOnlineSource) return [];

      // Name-based dedup against the truly-owned local titles.
      // normalizeTitleForMatch strips punctuation so colon / dash
      // differences between Steam's official title and the user's
      // non-Steam shortcut name don't block the match.
      if (shouldHideOwned && ownedNames && isOnlineSource) {
        const rawName = item.name && !isStoreFallback ? item.name : storeNames.get(appid) ?? '';
        const itemName = normalizeTitleForMatch(rawName);
        if (itemName && ownedNames.has(itemName)) return [];
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
            const menu = R.createElement(dfl.Menu, { label: gameName, cancelText: t('cancel') }, ...items);
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
        shelfId: shelf.id,
      }];
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
          // Single unified refresh path — same as the context-menu
          // "Refresh cache" action. Every subscribed shelf still receives
          // the trigger so online cache clears (which affect every online
          // shelf at once) reload consistently across the home — but
          // `shelfId` scopes the visual indicator to this shelf so a
          // single-shelf click doesn't dim the entire home.
          triggerShelfRefresh({ manual: true, shelfId: shelf.id });
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
    // interleave synthetic cards at their fixed slots.
    // Insert is order-preserving: a card with position N lands at index
    // N of the final array (clamped to the array length). Multiple
    // syntheticCards with the same position are inserted in declaration
    // order, each pushing the next one forward. Positions are applied
    // AFTER trailing cards so a position past the last game still lands
    // in the visible row.
    const synth = (shelf as any).syntheticCards as Array<any> | undefined;
    if (synth && synth.length) {
      const sorted = synth.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      for (const c of sorted) {
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
          },
        });
      }
    }
    return base;
  }, [appIds, items, storeNames, ownedNames, ownedAppIds, shouldHideOwned, shelf.id, shelf.limit, shelf.source, shelf.sort, shelf.title, platform, t, globalHideSeeMore, globalHideRefreshCard, (shelf as any).hideSeeMore, (shelf as any).hideRefreshCard, JSON.stringify((shelf as any).syntheticCards ?? null)]);

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
  const effectiveHideDiscountBadge = globalHideDiscountBadge === true ? true : ((shelf as any).hideDiscountBadge === true);
  const effectiveHideCompatIcons = globalHideCompatIcons === true ? true : (shelf.hideCompatIcons === true);
  const effectiveHideNonSteamBadge = globalHideNonSteamBadge === true ? true : (shelf.hideNonSteamBadge === true);
  const effectiveHideShelfTitle = globalHideShelfTitle === true ? true : ((shelf as any).hideShelfTitle === true);
  const effectiveHideGameNames = globalHideGameNames === true ? true : ((shelf as any).hideGameNames === true);
  const effectiveHideInstallIndicator = globalHideInstallIndicator === true ? true : ((shelf as any).hideInstallIndicator === true) || isOnlineShelf;
  // Menu-added games (in manualOrder, not in resolved source) — DeckRow
  // uses this to bind X=Remove on those cards (vs X=Hide on the rest).
  const removableSet = (() => {
    const manual: number[] = (shelf as any).manualOrder ?? [];
    if (!manual.length || !sourceIds) return undefined;
    const inSrc = new Set(sourceIds);
    const tail = manual.filter((id) => !inSrc.has(id));
    return tail.length ? new Set(tail) : undefined;
  })();
  const row = <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} removableSet={removableSet} matchNativeSize={globalMatchNativeSize || shelf.matchNativeSize} highlightFirst={globalHighlightFirst || shelf.highlightFirst} highlightAll={globalHighlightAll || shelf.highlightAll} highlightedAppIds={shelf.highlightedAppIds} hideStatusLine={effectiveHide} hideNewBadge={effectiveHideNewBadge} hideDiscountBadge={effectiveHideDiscountBadge} hideCompatIcons={effectiveHideCompatIcons} hideNonSteamBadge={effectiveHideNonSteamBadge} hideShelfTitle={effectiveHideShelfTitle} hideGameNames={effectiveHideGameNames} hideInstallIndicator={effectiveHideInstallIndicator} forceExpanded={forceExpanded} forceLayoutAsRecents={forceLayoutAsRecents} heroEnabled={heroForced || globalHeroEnabled || (shelf as any).heroEnabled === true} heroLabelMount={heroLabelMount} />;
  // Brief opacity dip while a user-triggered refresh is in flight so the
  // click is never ambiguous — even when the resolver returns identical
  // data, the shelf visibly fades and recovers, signalling that the
  // refresh actually fired.
  if (!refreshing) return row;
  return <div style={{ opacity: 0.45, transition: 'opacity 0.18s ease' }}>{row}</div>;
}

// Shallow-prop memo: settings changes in unrelated sections (e.g. toggling a
// behavior switch elsewhere) rebuild ShelvesContainer but produce identical
// shelf/global props for most shelves — skipping those cascades avoids
// re-resolving appIds and re-rendering DeckRow for every pass.
export const ShelfView = memo(ShelfViewImpl);
