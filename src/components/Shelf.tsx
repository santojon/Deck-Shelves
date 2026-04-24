
import { Spinner } from "@decky/ui";
import { memo, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Shelf } from "../types";
import { usePlatform } from "../runtime/platformContext";
import type { PlatformAppMeta } from "../runtime/platform";
import { DeckRow, type DeckRowItem } from "./DeckRow";
import { showGameMenu } from "../core/steamGameMenu";
import { saveFocusTarget } from "../core/focusRestore";
import { subscribeShelfRefresh } from "../core/shelfRefresh";
import { mark, measure } from "../core/perf";
import { logInfo } from "../runtime/logger";
import { applyManualOrder } from "../steam";

const NEW_GAME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function ShelfViewImpl({ shelf, globalMatchNativeSize = false, globalHighlightFirst = false, globalHighlightAll = false, globalHideStatusLine = false, globalHideNewBadge = false, globalHideCompatIcons = false, globalHideNonSteamBadge = false, forceExpanded = false }: { shelf: Shelf; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; forceExpanded?: boolean }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const cacheKey = `ds-shelf-cache-${shelf.id}-${shelf.sort ?? ''}-${(shelf as any).manualBaseSort ?? ''}`;
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

  const sourceKey = useMemo(() => JSON.stringify({ source: shelf.source, sort: shelf.sort }), [shelf.source, shelf.sort]);

  useEffect(() => {
    let cancelled = false;
    if (!shelf.enabled) return;

    const resolve = () => {
      if (cancelled) return;
      try {
        mark(`shelf.resolve:${shelf.id}:start`);
        // On manual sort, resolve using the configured base sort (default
        // alphabetical) so items not in `manualOrder` follow the user-chosen
        // natural order. For filter sources the sort lives inside
        // `source.filter.sort` (the third arg is ignored by that branch),
        // so we clone the source and swap `filter.sort` to the base sort.
        const baseSort = (shelf as any).manualBaseSort ?? "alphabetical";
        const isManual = effectiveSort === "manual";
        const resolveSort = isManual ? baseSort : shelf.sort;
        let resolveSource: any = shelf.source;
        if (isManual && shelf.source?.type === "filter") {
          resolveSource = { ...shelf.source, filter: { ...(shelf.source as any).filter, sort: baseSort } };
        }
        platform.resolveShelfAppIds(resolveSource, shelf.limit, resolveSort)
          .then((ids) => {
            if (!cancelled) {
              const finalIds = effectiveSort === "manual" ? applyManualOrder(ids, (shelf as any).manualOrder) : ids;
              setAppIds(finalIds);
              setMetaVersion((v) => v + 1);
              firstLoad.current = false;
              try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), ids })); } catch (e) { logInfo("HOME", "shelf cache write failed", String(e)); }
            }
          })
          .catch(() => {
            if (!cancelled && firstLoad.current) setAppIds([]);
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
  }, [platform, shelf.enabled, shelf.limit, shelf.sort, sourceKey, (shelf as any).manualOrder?.join(",") ?? "", (shelf as any).manualBaseSort ?? ""]);

  useEffect(() => {
    let cancelled = false;
    if (!appIds || !appIds.length) {
      setItems(new Map());
      return;
    }
    (async () => {
      const next = new Map<number, PlatformAppMeta>();
      for (const appid of appIds) {
        try {
          next.set(appid, await platform.getAppMeta(appid));
        } catch {
          next.set(appid, { appid, name: `App ${appid}` });
        }
      }
      if (!cancelled) setItems(next);
    })();
    return () => { cancelled = true; };
  }, [platform, appIds?.join(","), metaVersion]);

  const rowItems = useMemo((): DeckRowItem[] => {
    if (!appIds?.length) return [];
    const base = appIds.flatMap((appid): DeckRowItem[] => {
      const item = items.get(appid) ?? { appid, name: `App ${appid}` };
      if (/^App \d+$/.test(item.name)) return [];
      const onMenuButton = () => showGameMenu(appid);
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
    base.push({
      id: `${shelf.id}__more`,
      name: t('view_more'),
      isMoreLink: true,
      onActivate: () => platform.navigateToShelfSource?.(shelf.source, shelf.title),
    });
    return base;
  }, [appIds, items, shelf.id, shelf.source, shelf.title, platform, t]);

  if (!shelf.enabled || shelf.hidden) return null;
  if (appIds === null) return <div style={{ padding: 10 }}><Spinner /></div>;
  if (!appIds.length) return null;

  if (!rowItems.length && items.size > 0 && metaVersion < 5) {
    return <div style={{ padding: 10 }}><Spinner /></div>;
  }
  if (!rowItems.length) return null;

  const effectiveHide = globalHideStatusLine === true ? true : (shelf.hideStatusLine === true);
  const effectiveHideNewBadge = globalHideNewBadge === true ? true : (shelf.hideNewBadge === true);
  const effectiveHideCompatIcons = globalHideCompatIcons === true ? true : (shelf.hideCompatIcons === true);
  const effectiveHideNonSteamBadge = globalHideNonSteamBadge === true ? true : (shelf.hideNonSteamBadge === true);
  return <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} matchNativeSize={globalMatchNativeSize || shelf.matchNativeSize} highlightFirst={globalHighlightFirst || shelf.highlightFirst} highlightAll={globalHighlightAll || shelf.highlightAll} highlightedAppIds={shelf.highlightedAppIds} hideStatusLine={effectiveHide} hideNewBadge={effectiveHideNewBadge} hideCompatIcons={effectiveHideCompatIcons} hideNonSteamBadge={effectiveHideNonSteamBadge} forceExpanded={forceExpanded} />;
}

// Shallow-prop memo: settings changes in unrelated sections (e.g. toggling a
// behavior switch elsewhere) rebuild ShelvesContainer but produce identical
// shelf/global props for most shelves — skipping those cascades avoids
// re-resolving appIds and re-rendering DeckRow for every pass.
export const ShelfView = memo(ShelfViewImpl);
