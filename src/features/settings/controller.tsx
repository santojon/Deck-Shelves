import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentSettings, refreshSettings, saveSettings, subscribeSettings } from "../../settingsStore";
import type { Settings, Shelf, ShelfFilter, ShelfSource } from "../../types";
import { usePlatform } from "../../runtime/platformContext";
import type { PlatformCollection, PlatformTab } from "../../runtime/platform";
import { logDiagnostic } from "../../runtime/diagnostics";
import { logError, logInfo } from "../../runtime/logger";
import { addShelfToSettings, deleteShelfFromSettings, moveShelf, normalizeFilter, patchShelfInSettings } from "../../domain/settings";
import { createDefaultShelf, createDefaultSource, randomShelfId } from "../../domain/defaults";
import { DEFAULT_SHELF_TEMPLATES } from "../../domain/templates";

export function useSettingsController() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings() ?? { enabled: false, hideRecents: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, shelves: [] });
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
    const tabTimer = window.setInterval(refreshTabs, 30000);
    return () => {
      window.clearInterval(tabTimer);
      unsub();
    };
  }, [platform]);

  const shelves = settings?.shelves ?? [];

  // Always read the most recent settings, even if this closure is stale.
  const liveSettings = () => getCurrentSettings() ?? settings;

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
      const s = liveSettings();
      if (!s || s.enabled === enabled) return;
      await persist({ ...s, enabled });
    },
    async setHideRecents(hideRecents: boolean) {
      const s = liveSettings();
      if (!s || s.hideRecents === hideRecents) return;
      await persist({ ...s, hideRecents });
    },
    async setShelfHeroBackground(shelfHeroBackground: boolean) {
      const s = liveSettings();
      if (!s || s.shelfHeroBackground === shelfHeroBackground) return;
      await persist({ ...s, shelfHeroBackground });
    },
    async setGlobalMatchNativeSize(globalMatchNativeSize: boolean) {
      const s = liveSettings();
      if (!s || s.globalMatchNativeSize === globalMatchNativeSize) return;
      await persist({ ...s, globalMatchNativeSize });
    },
    async setGlobalHighlightFirst(globalHighlightFirst: boolean) {
      const s = liveSettings();
      if (!s || s.globalHighlightFirst === globalHighlightFirst) return;
      await persist({ ...s, globalHighlightFirst });
    },
    async addShelf() {
      const s = liveSettings();
      if (!s) return;
      const shelf: Shelf = { ...createDefaultShelf(collections[0]?.id ?? "", t("newShelf")), title: t("newShelf") };
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
    },
    async createDefaultShelves() {
      const s = liveSettings();
      if (!s) return;
      let next: Settings = { ...s, enabled: true };
      for (const tpl of DEFAULT_SHELF_TEMPLATES) {
        const shelf: Shelf = { ...createDefaultShelf(), title: t(tpl.titleKey), source: tpl.source };
        next = addShelfToSettings(next, shelf);
      }
      await persist(next);
      setSelectedId(next.shelves[0]?.id ?? null);
    },
    async addShelfWith(title: string, source: ShelfSource) {
      const s = liveSettings();
      if (!s) return;
      const shelf: Shelf = { ...createDefaultShelf(), title, source };
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
    },
    async patchShelf(id: string, patch: Partial<Shelf>) {
      const s = liveSettings();
      if (!s) return;
      const shelf = s.shelves.find((sh) => sh.id === id);
      if (!shelf) return;
      const patched = { ...shelf, ...patch };
      if (JSON.stringify(shelf) === JSON.stringify(patched)) return;
      await persist(patchShelfInSettings(s, id, patch));
    },
    async duplicateShelf(id: string) {
      const s = liveSettings();
      if (!s) return;
      const sourceShelf = s.shelves.find((item) => item.id === id);
      if (!sourceShelf) return;
      const duplicate: Shelf = JSON.parse(JSON.stringify(sourceShelf));
      duplicate.id = randomShelfId();
      duplicate.title = `${sourceShelf.title} ${t("copySuffix")}`.trim();
      await persist(addShelfToSettings(s, duplicate));
      setSelectedId(duplicate.id);
    },
    async removeShelf(id: string) {
      const s = liveSettings();
      if (!s) return;
      const next = deleteShelfFromSettings(s, id);
      await persist(next);
      if (selectedId === id) setSelectedId(next.shelves[0]?.id ?? null);
    },
    async moveShelf(id: string, dir: -1 | 1) {
      const s = liveSettings();
      if (!s) return;
      await persist(moveShelf(s, id, dir));
    },
    async reorderShelfIds(ids: string[]) {
      const s = liveSettings();
      if (!s) return;
      const byId = new Map(s.shelves.map((sh) => [sh.id, sh] as const));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as Shelf[];
      if (reordered.length !== s.shelves.length) return;
      await persist({ ...s, shelves: reordered });
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
