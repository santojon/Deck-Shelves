import { PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useEffect, useMemo, useState } from "react";
import { useDeckShelvesSettings } from "../state/settings";
import { onRefreshRequested } from "../state/refresh";
import type { ShelfDefinition } from "../types";
import { getAllOwnedApps, getCollectionAppIds, hasSteamClient } from "../lib/steam";
import { startLibraryWatcher } from "../lib/libraryWatcher";
import { matchesFilters, matchesTab, sortDefault } from "../lib/filters";
import { GameRow } from "./GameRow";

export function DeckShelvesHost() {
  const { settings } = useDeckShelvesSettings();
  const [allApps, setAllApps] = useState<Awaited<ReturnType<typeof getAllOwnedApps>> | null>(null);

  useEffect(() => {
    let alive = true;
    let stopWatcher: (() => void) | undefined;
    let stopRefreshReq: (() => void) | undefined;

    const refresh = async () => {
      try {
        const apps = await getAllOwnedApps();
        if (alive) setAllApps(apps);
      } catch (e) {
        console.error("Deck Shelves: refresh failed", e);
      }
    };

    (async () => {
      if (!hasSteamClient()) {
        if (alive) setAllApps([]);
        return;
      }

      await refresh();

      // Hot refresh without restarting Steam:
      // - Events when available (SteamClient varies by build)
      // - Adaptive polling fallback (faster on Home, slower elsewhere)
      stopWatcher = startLibraryWatcher(() => refresh());

      // Manual refresh from Settings
      stopRefreshReq = onRefreshRequested(() => refresh());
    })();

    return () => {
      alive = false;
      stopWatcher?.();
      stopRefreshReq?.();
    };
  }, []);

  const enabledShelves = useMemo(() => {
    return (settings.shelves ?? []).filter((s) => s.enabled);
  }, [settings.shelves]);

  const [collectionAppIds, setCollectionAppIds] = useState<Record<string, number[]>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      const next: Record<string, number[]> = {};

      const needed = new Set<string>();
      for (const shelf of enabledShelves) {
        if (shelf.sourceType === "collection") needed.add(shelf.collectionId);
        if (shelf.sourceType === "filter") {
          for (const f of shelf.filters ?? []) {
            if (f.enabled && f.type === "collection") needed.add(f.collectionId);
          }
        }
      }

      for (const collectionId of needed) {
        if (!collectionId) continue;
        try {
          next[collectionId] = await getCollectionAppIds(collectionId);
        } catch {
          next[collectionId] = [];
        }
      }

      if (alive) setCollectionAppIds(next);
    })();

    return () => {
      alive = false;
    };
  }, [enabledShelves]);

  const rows = useMemo(() => {
    if (!settings.enabled) return null;
    if (!allApps) return null;

    const byId = new Map(allApps.map((a) => [a.appid, a]));

    const resolveShelf = (shelf: ShelfDefinition): number[] => {
      const limit = Math.max(1, shelf.limit ?? 20);

      if (shelf.sourceType === "collection") {
        const ids = (collectionAppIds[shelf.collectionId] ?? []).filter((id) => byId.has(id));
        return ids.slice(0, limit);
      }

      if (shelf.sourceType === "tab") {
        const ids = allApps
          .filter((a) => matchesTab(a, shelf.tab))
          .sort(sortDefault)
          .map((a) => a.appid);
        return ids.slice(0, limit);
      }

      // filter
      const ids = allApps
        .filter((a) => matchesFilters(a, shelf.mode, shelf.filters ?? [], { collections: collectionAppIds }))
        .sort(sortDefault)
        .map((a) => a.appid);
      return ids.slice(0, limit);
    };

    const rendered = enabledShelves.map((s) => {
      const ids = resolveShelf(s);
      if (!ids.length) return null;
      return <GameRow key={s.id} title={s.name} appids={ids} limit={s.limit} />;
    });

    return rendered.filter(Boolean);
  }, [settings.enabled, settings.shelves, enabledShelves, allApps, collectionAppIds]);

  if (!settings.enabled) return null;

  return (
    <PanelSection title="Deck Shelves">
      <PanelSectionRow>
        {!hasSteamClient() ? (
          <div style={{ padding: "8px 0" }}>
            SteamClient API não está disponível neste contexto.
          </div>
        ) : !rows ? (
          <Spinner />
        ) : (
          <div className="deck-shelves-container">{rows}</div>
        )}
      </PanelSectionRow>
    </PanelSection>
  );
}
