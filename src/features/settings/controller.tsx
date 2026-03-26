import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { refreshSettings, saveSettings, subscribeSettings } from "../../settingsStore";
import type { Settings, Shelf, ShelfFilter } from "../../types";
import { usePlatform } from "../../runtime/platformContext";
import type { PlatformCollection, PlatformTab } from "../../runtime/platform";
import { logDiagnostic } from "../../runtime/diagnostics";
import { logError, logInfo } from "../../runtime/logger";
import { addShelfToSettings, deleteShelfFromSettings, moveShelf, normalizeFilter, patchShelfInSettings } from "../../domain/settings";
import { createDefaultShelf, createDefaultSource, randomShelfId } from "../../domain/defaults";

export function useSettingsController() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings | null>({ enabled: false, shelves: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collections, setCollections] = useState<PlatformCollection[]>([]);
  const [tabs, setTabs] = useState<PlatformTab[]>([]);

  useEffect(() => {
    const refreshTabs = () => {
      logInfo("SETTINGS", "refreshTabs start");
      platform.listLibraryTabs().then((nextTabs) => {
        setTabs((current) => {
          const now = JSON.stringify(current.map((t) => ({ id: t.id, name: t.name })));
          const next = JSON.stringify(nextTabs.map((t) => ({ id: t.id, name: t.name })));
          if (now !== next) logInfo("SETTINGS", "tabs updated", { count: nextTabs.length, sample: nextTabs.slice(0, 8) });
          return now === next ? current : nextTabs;
        });
      }).catch((error) => {
        setTabs([]);
        logError("SETTINGS", "refreshTabs failed", String(error));
        logDiagnostic("error", "Failed to load tabs", String(error));
      });
    };

    const unsub = subscribeSettings((next) => {
      setSettings(next);
      setSelectedId((current) => current ?? next.shelves[0]?.id ?? null);
    });
    refreshSettings().catch((error) => logDiagnostic("error", "Failed to load settings", String(error)));
    platform.listCollections().then(setCollections).catch((error) => {
      setCollections([]);
      logDiagnostic("error", "Failed to load collections", String(error));
    });
    refreshTabs();
    const tabTimer = window.setInterval(refreshTabs, 5000);
    return () => {
      window.clearInterval(tabTimer);
      unsub();
    };
  }, [platform]);

  const shelves = settings?.shelves ?? [];

  const persist = async (next: Settings) => {
    if (settings && JSON.stringify(settings) === JSON.stringify(next)) {
      logInfo("SETTINGS", "persist skipped (unchanged)");
      return true;
    }
    logInfo("SETTINGS", "persist start", { enabled: next.enabled, shelfCount: next.shelves.length });
    setSettings(next);
    const ok = await saveSettings(next);
    if (!ok) {
      logError("SETTINGS", "persist failed", JSON.stringify(next));
      logDiagnostic("error", "Failed to save settings", JSON.stringify(next));
    } else {
      logInfo("SETTINGS", "persist success");
    }
    return ok;
  };

  const actions = {
    persist,
    selectShelf(id: string) {
      setSelectedId(id);
    },
    async setEnabled(enabled: boolean) {
      if (!settings || settings.enabled === enabled) return;
      await persist({ ...settings, enabled });
    },
    async addShelf() {
      if (!settings) return;
      const shelf: Shelf = { ...createDefaultShelf(collections[0]?.id ?? "", t("newShelf")), title: t("newShelf") };
      await persist(addShelfToSettings(settings, shelf));
      setSelectedId(shelf.id);
    },
    async patchShelf(id: string, patch: Partial<Shelf>) {
      if (!settings) return;
      const shelf = settings.shelves.find((s) => s.id === id);
      if (!shelf) return;
      const patched = { ...shelf, ...patch };
      if (JSON.stringify(shelf) === JSON.stringify(patched)) return;
      await persist(patchShelfInSettings(settings, id, patch));
    },
    async duplicateShelf(id: string) {
      if (!settings) return;
      const sourceShelf = shelves.find((item) => item.id === id);
      if (!sourceShelf) return;
      const duplicate: Shelf = JSON.parse(JSON.stringify(sourceShelf));
      duplicate.id = randomShelfId();
      duplicate.title = `${sourceShelf.title} ${t("copySuffix")}`.trim();
      await persist(addShelfToSettings(settings, duplicate));
      setSelectedId(duplicate.id);
    },
    async removeShelf(id: string) {
      if (!settings) return;
      const next = deleteShelfFromSettings(settings, id);
      await persist(next);
      if (selectedId === id) setSelectedId(next.shelves[0]?.id ?? null);
    },
    async moveShelf(id: string, dir: -1 | 1) {
      if (!settings) return;
      await persist(moveShelf(settings, id, dir));
    },
    async reorderShelfIds(ids: string[]) {
      if (!settings) return;
      const byId = new Map(settings.shelves.map((s) => [s.id, s] as const));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as Shelf[];
      if (reordered.length !== settings.shelves.length) return;
      await persist({ ...settings, shelves: reordered });
    },
    async toggleShelfHidden(id: string) {
      const shelf = shelves.find((item) => item.id === id);
      if (!shelf) return;
      await actions.patchShelf(id, { hidden: !shelf.hidden });
    },
    async patchFilter(id: string, patch: Partial<ShelfFilter>) {
      const shelf = shelves.find((item) => item.id === id);
      if (!shelf || shelf.source.type !== "filter") return;
      await actions.patchShelf(id, { source: { type: "filter", filter: { ...normalizeFilter(shelf.source), ...patch } } });
    },
    async setSourceType(id: string, type: "collection" | "tab" | "filter") {
      if (type === "collection") {
        const first = collections[0];
        await actions.patchShelf(id, { source: createDefaultSource("collection", first?.id ?? "") });
        return;
      }
      if (type === "tab") {
        const firstTab = tabs[0] ?? { id: "favorites", name: t("tabs_favorites") };
        await actions.patchShelf(id, { source: { type: "tab", tab: firstTab.id } });
        return;
      }
      await actions.patchShelf(id, { source: createDefaultSource("filter") });
    },
  };

  return {
    t,
    settings,
    shelves,
    collections,
    tabs,
    actions,
  };
}

export type SettingsController = ReturnType<typeof useSettingsController>;
