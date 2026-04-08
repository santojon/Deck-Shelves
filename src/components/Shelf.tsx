
import { Spinner } from "@decky/ui";
import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Shelf } from "../types";
import { usePlatform } from "../runtime/platformContext";
import type { PlatformAppMeta } from "../runtime/platform";
import { DeckRow, type DeckRowItem } from "./DeckRow";
import { showGameMenu } from "../core/steamGameMenu";
import { saveFocusTarget } from "../core/focusRestore";
import { subscribeShelfRefresh } from "../core/shelfRefresh";

export function ShelfView({ shelf }: { shelf: Shelf }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [appIds, setAppIds] = useState<number[] | null>(() => {
    try {
      const raw = localStorage.getItem(`ds-shelf-cache-${shelf.id}`);
      if (raw) {
        const { ts, ids } = JSON.parse(raw);
        if (Date.now() - ts < 86400000) return ids; // 24h expiry
      }
    } catch {}
    return null;
  });
  const [items, setItems] = useState<Map<number, PlatformAppMeta>>(new Map());
  const firstLoad = useRef(true);
  const [metaVersion, setMetaVersion] = useState(0);

  const sourceKey = useMemo(() => JSON.stringify(shelf.source), [shelf.source]);

  useEffect(() => {
    let cancelled = false;
    if (!shelf.enabled) return;

    const resolve = () => {
      if (cancelled) return;
      platform.resolveShelfAppIds(shelf.source, shelf.limit)
        .then((ids) => {
          if (!cancelled) {
            setAppIds(ids);
            setMetaVersion((v) => v + 1);
            firstLoad.current = false;
            try { localStorage.setItem(`ds-shelf-cache-${shelf.id}`, JSON.stringify({ ts: Date.now(), ids })); } catch {}
          }
        })
        .catch(() => {
          if (!cancelled && firstLoad.current) setAppIds([]);
        });
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
  }, [platform, shelf.enabled, shelf.limit, sourceKey]);

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

  if (!shelf.enabled || shelf.hidden) return null;
  if (appIds === null) return <div style={{ padding: 10 }}><Spinner /></div>;
  if (!appIds.length) return null;

  const rowItems: DeckRowItem[] = appIds.flatMap((appid): DeckRowItem[] => {
    const item = items.get(appid) ?? { appid, name: `App ${appid}` };
    if (/^App \d+$/.test(item.name)) return [];
    const onMenuButton = () => showGameMenu(appid);
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
      statusText: item.installed != true ? t('status_not_installed') : undefined,
      shelfId: shelf.id,
    }];
  });

  if (!rowItems.length && items.size > 0 && metaVersion < 5) {
    return <div style={{ padding: 10 }}><Spinner /></div>;
  }
  if (!rowItems.length) return null;

  rowItems.push({
    id: `${shelf.id}__more`,
    name: t('view_more'),
    isMoreLink: true,
    onActivate: () => platform.navigateToShelfSource?.(shelf.source, shelf.title),
  });

  return <DeckRow title={shelf.title} items={rowItems} shelfId={shelf.id} matchNativeSize={shelf.matchNativeSize} highlightFirst={shelf.highlightFirst} />;
}
