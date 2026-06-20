import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentSettings, refreshSettings, saveSettings, subscribeSettings } from "../../settingsStore";
import type { Settings } from "../../types";
import { usePlatform } from "../../runtime/platformContext";
import type { PlatformCollection, PlatformTab } from "../../runtime/platform";
import { logDiagnostic } from "../../runtime/diagnostics";
import { logError, logInfo } from "../../runtime/logger";
import { toaster } from "../../shims/decky-api";
import { createSavedFilterActions } from "./controller/savedFilters";
import { createSmartShelfActions } from "./controller/smartShelves";
import { createOnlineActions } from "./controller/online";
import { createGlobalVisualActions } from "./controller/globalVisual";
import { createShelfActions } from "./controller/shelves";
import { createProfileActions } from "./controller/profiles";

export function useSettingsController() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings() ?? { enabled: false, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalDedupeByName: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [], savedSmartFilters: [], updateNotifyEnabled: true, onlineFeaturesEnabled: false, onlineWishlistEnabled: true, onlinePriceSortEnabled: true, onlinePrivacyAccepted: false, onlineHideOwnedGames: false, onlineHideOwnedNonSteam: false, onlineHideOwnedNonSteamCloud: false, forceCssLoaderThemes: false, globalHeroEnabled: false, qamHiddenToggles: [], qamHiddenSections: [], unifiedListEnabled: false, allShelvesOrder: [], lightModeEnabled: false, offlineModeEnabled: false, featureToggles: {}, profiles: [], integrationsEnabled: {}, buttonBindings: {}, buttonBindingsDisabled: [] });
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collections, setCollections] = useState<PlatformCollection[]>([]);
  // Initialise tabs from the localStorage cache so the shelf editor shows the
  // correct tab list instantly on every QAM open (the QAM remounts each time,
  // so useState([]) would show an empty dropdown for the 200–500ms while the
  // async listLibraryTabs() IPC round-trip completes).
  const [tabs, setTabs] = useState<PlatformTab[]>(() => {
    try {
      const raw = localStorage.getItem('ds-tabs-cache-v1');
      if (raw) return JSON.parse(raw) as PlatformTab[];
    } catch {}
    return [];
  });

  useEffect(() => {
    // The 5 native library tabs Steam exposes by default. Used whenever the
    // discovery chain in `listLibraryTabs` returns nothing — covers both
    // promise rejection (unhandled throw inside one of the integrations)
    // AND the legit-resolved-but-empty case (no TabMaster, no fiber ctx,
    // no DOM tabs). Without this the EditShelfModal's tab dropdown ends up
    // empty whenever the host-window-walk hits a Proxy that throws.
    const NATIVE_DEFAULT_TABS: PlatformTab[] = [
      { id: "all",       name: "All Games" },
      { id: "favorites", name: "Favorites" },
      { id: "installed", name: "Installed" },
      { id: "hidden",    name: "Hidden" },
      { id: "nonsteam",  name: "Non-Steam" },
    ];
    const refreshTabs = () => {
      logInfo("SETTINGS", "refreshTabs start");
      let p: Promise<PlatformTab[]>;
      try {
        p = platform.listLibraryTabs();
      } catch (e) {
        // `listLibraryTabs` is async so this only fires if the function
        // ref itself is missing (broken platform wiring). Swallow and
        // surface defaults.
        logError("SETTINGS", "refreshTabs sync throw", String(e));
        setTabs((current) => current.length ? current : NATIVE_DEFAULT_TABS);
        return;
      }
      p.then((nextTabs) => {
        const finalTabs = (Array.isArray(nextTabs) && nextTabs.length > 0) ? nextTabs : NATIVE_DEFAULT_TABS;
        setTabs((current) => {
          const now = JSON.stringify(current.map((t) => ({ id: t.id, name: t.name })));
          const next = JSON.stringify(finalTabs.map((t) => ({ id: t.id, name: t.name })));
          if (now !== next) {
            logInfo("SETTINGS", "tabs updated", { count: finalTabs.length, sample: finalTabs.slice(0, 8) });
            try { localStorage.setItem('ds-tabs-cache-v1', JSON.stringify(finalTabs)); } catch {}
          }
          return now === next ? current : finalTabs;
        });
      }).catch((error) => {
        // Never zero out — keep the previous list if we had one, else
        // fall back to native defaults so the picker is always usable.
        setTabs((current) => current.length ? current : NATIVE_DEFAULT_TABS);
        logError("SETTINGS", "refreshTabs failed", String(error));
        logDiagnostic("error", "Failed to load tabs", String(error));
      });
    };

    const unsub = subscribeSettings((next) => {
      setSettings(next);
      setSelectedId((current) => current ?? next.shelves[0]?.id ?? null);
    });
    refreshSettings().catch((error) => logDiagnostic("error", "Failed to load settings", String(error)));
    // Collection refresh — same shape as tabs. Steam's collectionStore is
    // a MobX store that races plugin boot: a single call at mount time
    // sometimes returned [] (computed not ready), leaving the Edit Shelf
    // modal's collection picker permanently empty. The periodic refresh
    // fills the picker as soon as Steam exposes the data, and survives
    // QAM hot-reloads / settings round-trips. The setter no-ops when the
    // new list matches the current one so React doesn't churn.
    const refreshCollections = () => {
      platform.listCollections().then((next) => {
        setCollections((current) => {
          const a = JSON.stringify(current.map((c) => ({ id: c.id, name: c.name })));
          const b = JSON.stringify(next.map((c) => ({ id: c.id, name: c.name })));
          return a === b ? current : next;
        });
      }).catch((error) => {
        // Keep the previous list if any — never zero out a working picker.
        logDiagnostic("error", "Failed to load collections", String(error));
      });
    };
    refreshCollections();
    refreshTabs();
    const tabTimer = window.setInterval(refreshTabs, 30000);
    const colTimer = window.setInterval(refreshCollections, 30000);
    return () => {
      window.clearInterval(tabTimer);
      window.clearInterval(colTimer);
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

  // Extracted action slices — composed into the final `actions` object
  // below so every call site keeps working through the same name.
  const savedFilterActions = createSavedFilterActions({ liveSettings, persist });
  const smartShelfActions = createSmartShelfActions({ liveSettings, persist, t });
  const onlineActions = createOnlineActions({ liveSettings, persist });
  const globalVisualActions = createGlobalVisualActions({ liveSettings, persist });
  const shelfActions = createShelfActions({ liveSettings, persist, setSelectedId, selectedId, collections, tabs, shelves, t });
  const profileActions = createProfileActions({ liveSettings, persist });

  const actions = {
    persist,
    selectShelf(id: string) {
      setSelectedId(id);
    },
    ...savedFilterActions,
    ...smartShelfActions,
    ...onlineActions,
    ...globalVisualActions,
    ...shelfActions,
    ...profileActions,
    async setEnabled(enabled: boolean) {
      const s = liveSettings();
      if (!s || s.enabled === enabled) return;
      await persist({ ...s, enabled });
    },
    async setUpdateNotifyEnabled(updateNotifyEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s.updateNotifyEnabled ?? true) === updateNotifyEnabled) return;
      // Re-enabling the toggle clears the "dismissed version" pin so the
      // banner / toast can surface again — otherwise a user who dismissed
      // a release (or accidentally hit dismiss) had no way to make the
      // notification reappear short of editing localStorage. The OFF → ON
      // edge is the closest natural signal we have to "I want to see
      // update notifications again".
      const next = updateNotifyEnabled
        ? { ...s, updateNotifyEnabled, updateNotifyDismissedVersion: undefined }
        : { ...s, updateNotifyEnabled };
      await persist(next as any);
    },
    async dismissUpdateNotice(version: string) {
      const s = liveSettings();
      if (!s || s.updateNotifyDismissedVersion === version) return;
      await persist({ ...s, updateNotifyDismissedVersion: version });
    },
    async setHideRecents(hideRecents: boolean) {
      const s = liveSettings();
      if (!s || s.hideRecents === hideRecents) return;
      // Only the hard "no shelves at all" case blocks — without this the
      // user would lock themselves out of the home with nothing on screen.
      // We deliberately do NOT resolve every shelf's appIds here anymore:
      // online sources (wishlist / store) and composite sources can return
      // `[]` while their price/store caches warm, and that transient state
      // was making the toggle bounce back to OFF when the user enabled it.
      if (hideRecents) {
        const visible = (s.shelves ?? []).filter((sh) => sh.enabled && !sh.hidden);
        if (!visible.length) {
          logInfo("SETTINGS", "setHideRecents blocked — no visible shelves");
          return;
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
    async setForceCssLoaderThemes(forceCssLoaderThemes: boolean) {
      const s = liveSettings();
      if (!s || s.forceCssLoaderThemes === forceCssLoaderThemes) return;
      await persist({ ...s, forceCssLoaderThemes });
    },
    setQamHiddenToggle(key: string, hidden: boolean) {
      if (key === "enabled") return;
      const s = liveSettings();
      if (!s) return;
      const current = (s as any).qamHiddenToggles ?? [];
      const has = current.includes(key);
      if (hidden === has) return;
      const next = hidden ? [...current, key] : current.filter((k: string) => k !== key);
      const updated = { ...s, qamHiddenToggles: next } as any;
      // Skip the JSON.stringify diff inside `persist` — these lists are
      // small and we want the UI to respond on the same tick. Sync local
      // state immediately; fire-and-forget the backend save.
      setSettings(updated);
      void saveSettings(updated);
    },
    setQamHiddenSection(id: string, hidden: boolean) {
      const s = liveSettings();
      if (!s) return;
      const current = (s as any).qamHiddenSections ?? [];
      const has = current.includes(id);
      if (hidden === has) return;
      const next = hidden ? [...current, id] : current.filter((k: string) => k !== id);
      const updated = { ...s, qamHiddenSections: next } as any;
      setSettings(updated);
      void saveSettings(updated);
    },
    async setContextSearchEnabled(contextSearchEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).contextSearchEnabled === contextSearchEnabled) return;
      await persist({ ...s, contextSearchEnabled } as any);
    },
    async setSideNavEnabled(sideNavEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).sideNavEnabled === sideNavEnabled) return;
      await persist({ ...s, sideNavEnabled } as any);
    },
    async setContextSearchKeyboardEnabled(contextSearchKeyboardEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).contextSearchKeyboardEnabled === contextSearchKeyboardEnabled) return;
      await persist({ ...s, contextSearchKeyboardEnabled } as any);
    },
    async setContextSearchOnEnter(contextSearchOnEnter: boolean) {
      const s = liveSettings();
      if (!s || (s as any).contextSearchOnEnter === contextSearchOnEnter) return;
      await persist({ ...s, contextSearchOnEnter } as any);
    },
    async resetAll() {
      const empty: Settings = { enabled: false, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalDedupeByName: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [], savedSmartFilters: [], updateNotifyEnabled: true, onlineFeaturesEnabled: false, onlineWishlistEnabled: true, onlinePriceSortEnabled: true, onlinePrivacyAccepted: false, onlineHideOwnedGames: false, onlineHideOwnedNonSteam: false, onlineHideOwnedNonSteamCloud: false, forceCssLoaderThemes: false, globalHeroEnabled: false, qamHiddenToggles: [], qamHiddenSections: [], unifiedListEnabled: false, allShelvesOrder: [], lightModeEnabled: false, offlineModeEnabled: false, featureToggles: {}, profiles: [], integrationsEnabled: {}, buttonBindings: {}, buttonBindingsDisabled: [] };
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
      toaster.toast({ title: t("plugin_name"), body: t("toast_settings_reset") });
      setSelectedId(null);
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
