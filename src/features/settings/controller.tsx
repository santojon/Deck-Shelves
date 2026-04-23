import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentSettings, refreshSettings, saveSettings, subscribeSettings, writeJsonFile, readJsonFile } from "../../settingsStore";
import type { Settings, Shelf, ShelfFilter, ShelfSource, SmartShelf, SmartShelfMode } from "../../types";
import { usePlatform } from "../../runtime/platformContext";
import type { PlatformCollection, PlatformTab } from "../../runtime/platform";
import { logDiagnostic } from "../../runtime/diagnostics";
import { logError, logInfo } from "../../runtime/logger";
import { toaster } from "../../shims/decky-api";
import { addShelfToSettings, deleteShelfFromSettings, moveShelf, normalizeFilter, patchShelfInSettings } from "../../domain/settings";
import { createDefaultShelf, createDefaultSource, createDefaultSmartShelf, randomShelfId } from "../../domain/defaults";
import { DEFAULT_SHELF_TEMPLATES } from "../../domain/templates";

export function useSettingsController() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings() ?? { enabled: false, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0 });
  
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
      // Prevent enabling hideRecents when there are no visible shelves
      // or when visible shelves resolve to zero items.
      if (hideRecents) {
        const visible = (s.shelves ?? []).filter((sh) => sh.enabled && !sh.hidden);
        if (!visible.length) {
          logInfo("SETTINGS", "setHideRecents blocked — no visible shelves");
          return;
        }
        try {
          const resolved = await Promise.all(visible.map((sh) => platform.resolveShelfAppIds(sh.source, sh.limit).catch(() => [])));
          const anyHas = resolved.some((r) => Array.isArray(r) && r.length > 0);
          if (!anyHas) {
            logInfo("SETTINGS", "setHideRecents blocked — visible shelves have no items");
            return;
          }
        } catch (e) {
          // If platform fails, be conservative and allow the change to proceed.
          logDiagnostic("warn", "setHideRecents: platform resolve failed", String(e));
        }
      }
      await persist({ ...s, hideRecents });
    },
    async setHideHomeTabs(hideHomeTabs: boolean) {
      const s = liveSettings();
      if (!s || s.hideHomeTabs === hideHomeTabs) return;
      await persist({ ...s, hideHomeTabs });
    },
    async setRecentsReplaceSource(recentsReplaceSource: boolean) {
      const s = liveSettings();
      if (!s || s.recentsReplaceSource === recentsReplaceSource) return;
      await persist({ ...s, recentsReplaceSource });
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
    async setGlobalHideStatusLine(globalHideStatusLine: boolean) {
      const s = liveSettings();
      if (!s || s.globalHideStatusLine === globalHideStatusLine) return;
      await persist({ ...s, globalHideStatusLine });
    },
    async setGlobalHighlightFirst(globalHighlightFirst: boolean) {
      const s = liveSettings();
      if (!s || s.globalHighlightFirst === globalHighlightFirst) return;
      await persist({ ...s, globalHighlightFirst });
    },
    async setGlobalHighlightAll(globalHighlightAll: boolean) {
      const s = liveSettings();
      if (!s || s.globalHighlightAll === globalHighlightAll) return;
      await persist({ ...s, globalHighlightAll });
    },
    async setGlobalHideNewBadge(globalHideNewBadge: boolean) {
      const s = liveSettings();
      if (!s || s.globalHideNewBadge === globalHideNewBadge) return;
      await persist({ ...s, globalHideNewBadge });
    },
    async setGlobalHideCompatIcons(globalHideCompatIcons: boolean) {
      const s = liveSettings();
      if (!s || s.globalHideCompatIcons === globalHideCompatIcons) return;
      await persist({ ...s, globalHideCompatIcons });
    },
    async setGlobalHideNonSteamBadge(globalHideNonSteamBadge: boolean) {
      const s = liveSettings();
      if (!s || s.globalHideNonSteamBadge === globalHideNonSteamBadge) return;
      await persist({ ...s, globalHideNonSteamBadge });
    },
    async addShelf(): Promise<Shelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      const shelf: Shelf = { ...createDefaultShelf(collections[0]?.id ?? "", t("newShelf")), title: t("newShelf") };
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
      return shelf;
    },
    async exportShelves(destPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      return writeJsonFile(destPath, JSON.stringify({ state: { shelves: s.shelves } }, null, 2));
    },
    async importShelves(srcPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const raw = await readJsonFile(srcPath);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        const imported = parsed?.state?.shelves ?? parsed?.shelves;
        if (!Array.isArray(imported)) return false;
        await persist({ ...s, shelves: imported });
        if (imported[0]?.id) setSelectedId(imported[0].id);
        return true;
      } catch { return false; }
    },
    async exportSmartShelves(destPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      return writeJsonFile(destPath, JSON.stringify({ state: { smartShelves: s.smartShelves ?? [], smartShelvesEnabled: s.smartShelvesEnabled === true, smartShelvesAtBottom: s.smartShelvesAtBottom === true, smartSurpriseMe: s.smartSurpriseMe === true, smartSurpriseMeCount: s.smartSurpriseMeCount ?? 0 } }, null, 2));
    },
    async resetShelves() {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, shelves: [] });
      setSelectedId(null);
      toaster.toast({ title: t("pluginName"), body: t("toast_shelves_reset") });
    },
    async resetSmartShelves() {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, smartShelves: [], smartShelvesEnabled: false, smartSurpriseMe: false, smartSurpriseMeCount: 0 });
      toaster.toast({ title: t("pluginName"), body: t("toast_smart_shelves_reset") });
    },
    async importSmartShelves(srcPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const raw = await readJsonFile(srcPath);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        const src = parsed?.state ?? parsed ?? {};
        const next: Settings = { ...s };
        if (Array.isArray(src.smartShelves)) next.smartShelves = src.smartShelves;
        if (typeof src.smartShelvesEnabled === "boolean") next.smartShelvesEnabled = src.smartShelvesEnabled;
        if (typeof src.smartShelvesAtBottom === "boolean") next.smartShelvesAtBottom = src.smartShelvesAtBottom;
        if (typeof src.smartSurpriseMe === "boolean") next.smartSurpriseMe = src.smartSurpriseMe;
        if (typeof src.smartSurpriseMeCount === "number") next.smartSurpriseMeCount = src.smartSurpriseMeCount;
        await persist(next);
        return true;
      } catch { return false; }
    },
    async resetAll() {
      const empty: Settings = { enabled: false, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0 };
      try {
        const ls = globalThis.localStorage;
        if (ls) {
          const drop: string[] = [];
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (k && (k.startsWith('ds-') || k.startsWith('ds_') || k.startsWith('deck-shelves-'))) drop.push(k);
          }
          for (const k of drop) { try { ls.removeItem(k); } catch {} }
        }
      } catch {}
      await persist(empty);
      toaster.toast({ title: t("pluginName"), body: t("toast_settings_reset") });
      setSelectedId(null);
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
    async addShelfWith(title: string, source: ShelfSource): Promise<Shelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      const shelf: Shelf = { ...createDefaultShelf(), title, source };
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
      return shelf;
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
      await persist(addShelfToSettings(s, duplicate, id));
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
    async setSmartShelvesEnabled(enabled: boolean) {
      const s = liveSettings();
      if (!s || s.smartShelvesEnabled === enabled) return;
      await persist({ ...s, smartShelvesEnabled: enabled });
    },
    async setSmartShelvesAtBottom(atBottom: boolean) {
      const s = liveSettings();
      if (!s || s.smartShelvesAtBottom === atBottom) return;
      await persist({ ...s, smartShelvesAtBottom: atBottom });
    },
    async reorderSmartShelfIds(ids: string[]) {
      const s = liveSettings();
      if (!s) return;
      const byId = new Map((s.smartShelves ?? []).map((sh) => [sh.id, sh] as const));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as SmartShelf[];
      if (reordered.length !== (s.smartShelves ?? []).length) return;
      await persist({ ...s, smartShelves: reordered });
    },
    async addSmartShelf(mode: SmartShelfMode, title: string): Promise<SmartShelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      const shelf = createDefaultSmartShelf(mode, title);
      await persist({ ...s, smartShelves: [shelf, ...(s.smartShelves ?? [])] });
      return shelf;
    },
    async removeSmartShelf(id: string) {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, smartShelves: (s.smartShelves ?? []).filter((sh) => sh.id !== id) });
    },
    async toggleSmartShelfHidden(id: string) {
      const s = liveSettings();
      if (!s) return;
      const updated = (s.smartShelves ?? []).map((sh) => sh.id === id ? { ...sh, hidden: !sh.hidden } : sh);
      await persist({ ...s, smartShelves: updated });
    },
    async setSmartSurpriseMe(enabled: boolean) {
      const s = liveSettings();
      if (!s || s.smartSurpriseMe === enabled) return;
      await persist({ ...s, smartSurpriseMe: enabled });
    },
    async setSmartSurpriseMeCount(count: number) {
      const s = liveSettings();
      if (!s || s.smartSurpriseMeCount === count) return;
      await persist({ ...s, smartSurpriseMeCount: Math.max(0, Math.min(5, count)) });
    },
    async moveSmartShelf(id: string, dir: -1 | 1) {
      const s = liveSettings();
      if (!s) return;
      const list = [...(s.smartShelves ?? [])];
      const idx = list.findIndex((sh) => sh.id === id);
      if (idx < 0) return;
      const target = idx + dir;
      if (target < 0 || target >= list.length) return;
      [list[idx], list[target]] = [list[target], list[idx]];
      await persist({ ...s, smartShelves: list });
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
