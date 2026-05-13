
import { Spinner } from "@decky/ui";
import { memo, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Shelf } from "../types";
import { usePlatform } from "../runtime/platformContext";
import type { PlatformAppMeta } from "../runtime/platform";
import { DeckRow, type DeckRowItem } from "./DeckRow";
import { shouldShowMoreCard, shouldShowRefreshCard } from "./shelf/trailingCards";
import { showGameMenu } from "../core/steamGameMenu";
import { saveFocusTarget } from "../core/focusRestore";
import { subscribeShelfRefresh } from "../core/shelfRefresh";
import { mark, measure } from "../core/perf";
import { logInfo } from "../runtime/logger";
import { applyManualOrder, invalidateRandomSortCache } from "../steam";
import { invalidateSmartShelfCache } from "../steam/smartShelves";

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

  const rowItems = useMemo((): DeckRowItem[] => {
    if (!appIds?.length) return [];
    const base = appIds.flatMap((appid): DeckRowItem[] => {
      const item = items.get(appid) ?? { appid, name: `App ${appid}` };
      if (/^App \d+$/.test(item.name)) return [];
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
      base.push({
        id: `${shelf.id}__refresh`,
        name: t('refresh'),
        isRefresh: true,
        onActivate: () => {
          if (isSmart) invalidateSmartShelfCache(shelf.id);
          else invalidateRandomSortCache(shelf.id);
          resolveRef.current();
        },
      });
    }
    if (shouldShowMoreCard(trailingInput)) {
      base.push({
        id: `${shelf.id}__more`,
        name: t('view_more'),
        isMoreLink: true,
        onActivate: () => platform.navigateToShelfSource?.(shelf.source, shelf.title),
      });
    }
    return base;
  }, [appIds, items, shelf.id, shelf.source, shelf.sort, shelf.title, platform, t, globalHideSeeMore, globalHideRefreshCard, (shelf as any).hideSeeMore, (shelf as any).hideRefreshCard]);

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

  const effectiveHide = globalHideStatusLine === true ? true : (shelf.hideStatusLine === true);
  const effectiveHideNewBadge = globalHideNewBadge === true ? true : (shelf.hideNewBadge === true);
  const effectiveHideCompatIcons = globalHideCompatIcons === true ? true : (shelf.hideCompatIcons === true);
  const effectiveHideNonSteamBadge = globalHideNonSteamBadge === true ? true : (shelf.hideNonSteamBadge === true);
  const effectiveHideShelfTitle = globalHideShelfTitle === true ? true : ((shelf as any).hideShelfTitle === true);
  const effectiveHideGameNames = globalHideGameNames === true ? true : ((shelf as any).hideGameNames === true);
  const effectiveHideInstallIndicator = globalHideInstallIndicator === true ? true : ((shelf as any).hideInstallIndicator === true);
  return <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} matchNativeSize={globalMatchNativeSize || shelf.matchNativeSize} highlightFirst={globalHighlightFirst || shelf.highlightFirst} highlightAll={globalHighlightAll || shelf.highlightAll} highlightedAppIds={shelf.highlightedAppIds} hideStatusLine={effectiveHide} hideNewBadge={effectiveHideNewBadge} hideCompatIcons={effectiveHideCompatIcons} hideNonSteamBadge={effectiveHideNonSteamBadge} hideShelfTitle={effectiveHideShelfTitle} hideGameNames={effectiveHideGameNames} hideInstallIndicator={effectiveHideInstallIndicator} forceExpanded={forceExpanded} />;
}

// Shallow-prop memo: settings changes in unrelated sections (e.g. toggling a
// behavior switch elsewhere) rebuild ShelvesContainer but produce identical
// shelf/global props for most shelves — skipping those cascades avoids
// re-resolving appIds and re-rendering DeckRow for every pass.
export const ShelfView = memo(ShelfViewImpl);
