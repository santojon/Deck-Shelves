import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentSettings, refreshSettings, saveSettings, subscribeSettings } from "../../store/settingsStore";
import type { Settings } from "../../types";
import { usePlatform } from "../../runtime/platformContext";
import type { PlatformCollection, PlatformTab } from "../../runtime/platform";
import { logDiagnostic } from "../../runtime/diagnostics";
import { logError, logInfo } from "../../runtime/logger";
import { qaOverrideActive } from "../../qa/harness";
import { __resetUpdateCheckCache } from "../../core/updateNotifier";
import { notify } from "../../components/notify";
import { NOTIFICATION_AREAS } from "../../components/qam/NotificationAreaToggles";
import { createSavedFilterActions } from "./controller/savedFilters";
import { createSmartShelfActions } from "./controller/smartShelves";
import { createOnlineActions } from "./controller/online";
import { createGlobalVisualActions } from "./controller/globalVisual";
import { createShelfActions } from "./controller/shelves";
import { createProfileActions } from "./controller/profiles";

const OWN_KEY_PREFIXES = ['ds-', 'ds_', 'deck-shelves-'];

const KEPT_BY_RESET = new Set(["deck-shelves-account-v1"]);

function isOwnKey(k: string | null): k is string {
  return !!k && !KEPT_BY_RESET.has(k) && OWN_KEY_PREFIXES.some((prefix) => k.startsWith(prefix));
}

export function clearOwnLocalStorage(): void {
  if (qaOverrideActive) return;
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const drop: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (isOwnKey(k)) drop.push(k);
    }
    for (const k of drop) { try { ls.removeItem(k); } catch {} }
  } catch {}
}

export function useSettingsController() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings() ?? { enabled: false, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, gameContextMenuEnabled: true, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalDedupeByName: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [], savedSmartFilters: [], updateNotifyEnabled: true, onlineFeaturesEnabled: false, onlineWishlistEnabled: true, onlinePriceSortEnabled: true, onlinePrivacyAccepted: false, onlineMetadataEnabled: false, onlineHideOwnedGames: false, onlineHideOwnedNonSteam: false, onlineHideOwnedNonSteamCloud: false, forceCssLoaderThemes: false, ownQamTabEnabled: false, showcaseModeEnabled: false, showcaseStartAfterSeconds: 60, showcaseDwellSeconds: 10, showcaseRandomize: false, showcaseStopOnInteraction: true, showcaseShelfIds: [], showcasePanCards: false, showcaseCardsPerShelf: 5, showcaseCardDwellSeconds: 4, globalHeroEnabled: false, globalGameInfoAbove: false, globalFriendsPlayingOverlay: false, globalFriendsPlayingOverlayRecent: false, qamHiddenToggles: [], qamHiddenSections: [], unifiedListEnabled: false, allShelvesOrder: [], lightModeEnabled: false, advancedModeEnabled: false, templateSuggestionsEnabled: false, offlineModeEnabled: false, featureToggles: {}, profiles: [], integrationsEnabled: {}, cardActionShortcutsEnabled: true, buttonBindings: {}, buttonBindingsDisabled: [], keyboardBindings: {}, keyboardBindingsDisabled: [], screensaverShelvesEnabled: false, screensaverShelvesIncludeScreenshots: false, screensaverOnlineScreenshotsEnabled: false, screensaverIdleBackupAcSec: null, screensaverIdleBackupBatterySec: null, screensaverStartAfterSeconds: 60, screensaverDwellSeconds: 8, screensaverLogoEnabled: true, screensaverLogoSize: 100, screensaverLogoPosition: 'left', screensaverLogoAtTop: false, screensaverLogoOffset: 8, screensaverLogoOnScreenshots: true, screensaverShelfBatchSize: 5, screensaverDescriptionEnabled: false, screensaverDescriptionAboveLogo: false, screensaverDescriptionLogoGap: 10, cloudSyncEnabled: false, cloudSyncLastSyncedAt: null });
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collections, setCollections] = useState<PlatformCollection[]>([]);
  // The QAM remounts on every open, so start from the cached tabs instead of an empty list.
  const [tabs, setTabs] = useState<PlatformTab[]>(() => {
    try {
      const raw = localStorage.getItem('ds-tabs-cache-v1');
      if (raw) return JSON.parse(raw) as PlatformTab[];
    } catch {}
    return [];
  });

  useEffect(() => {
    // Fallback for when tab discovery returns nothing or throws.
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
    // Steam's collection store can be empty at mount, so this refreshes again later.
    const refreshCollections = () => {
      platform.listCollections().then((next) => {
        setCollections((current) => {
          const a = JSON.stringify(current.map((c) => ({ id: c.id, name: c.name })));
          const b = JSON.stringify(next.map((c) => ({ id: c.id, name: c.name })));
          return a === b ? current : next;
        });
      }).catch((error) => {
        logDiagnostic("error", "Failed to load collections", String(error));
      });
    };
    refreshCollections();
    refreshTabs();
    // Bounded: stop after a few ticks once Steam's collection store has had time to hydrate.
    let tabPolls = 0;
    let colPolls = 0;
    const MAX_POLLS = 6;
    const tabTimer = window.setInterval(() => {
      refreshTabs();
      if (++tabPolls >= MAX_POLLS) window.clearInterval(tabTimer);
    }, 30000);
    const colTimer = window.setInterval(() => {
      refreshCollections();
      if (++colPolls >= MAX_POLLS) window.clearInterval(colTimer);
    }, 30000);
    return () => {
      window.clearInterval(tabTimer);
      window.clearInterval(colTimer);
      unsub();
    };
  }, [platform]);

  const shelves = settings?.shelves ?? [];

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
    async setProfileTriggersEnabled(profileTriggersEnabled: boolean) {
      const s = liveSettings();
      if (!s || ((s as any).profileTriggersEnabled ?? false) === profileTriggersEnabled) return;
      await persist({ ...s, profileTriggersEnabled } as any);
    },
    async setAutoCollapseEnabled(autoCollapseEnabled: boolean) {
      const s = liveSettings();
      if (!s || ((s as any).autoCollapseEnabled ?? false) === autoCollapseEnabled) return;
      await persist({ ...s, autoCollapseEnabled } as any);
    },
    async setNotificationsDisabled(notificationsDisabled: boolean) {
      const s = liveSettings();
      if (!s || ((s as any).notificationsDisabled ?? false) === notificationsDisabled) return;
      const next: any = { ...s, notificationsDisabled };
      if (notificationsDisabled && !(s as any).notificationsDisabledAreas?.length) {
        next.notificationsDisabledAreas = [...NOTIFICATION_AREAS];
      }
      await persist(next);
    },
    async setShowcaseSeen(showcaseSeen: boolean) {
      const s = liveSettings();
      if (!s || ((s as any).showcaseSeen ?? false) === showcaseSeen) return;
      await persist({ ...s, showcaseSeen } as any);
    },
    async setNotificationAreaEnabled(area: string, enabled: boolean) {
      const s = liveSettings();
      if (!s) return;
      const cur: string[] = (s as any).notificationsDisabledAreas ?? [];
      const isDisabled = cur.includes(area);
      if ((!enabled) === isDisabled) return;
      const next = enabled ? cur.filter((a) => a !== area) : [...cur, area];
      await persist({ ...s, notificationsDisabledAreas: next.length ? next : undefined } as any);
    },
    async setUpdateNotifyEnabled(updateNotifyEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s.updateNotifyEnabled ?? true) === updateNotifyEnabled) return;
      // Turning it back on clears the dismissed version so notifications can show again.
      const next = updateNotifyEnabled
        ? { ...s, updateNotifyEnabled, updateNotifyDismissedVersion: undefined }
        : { ...s, updateNotifyEnabled };
      await persist(next as any);
    },
    async setBetaChannelEnabled(betaChannelEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).betaChannelEnabled === betaChannelEnabled) return;
      try { __resetUpdateCheckCache(); } catch {}
      await persist({ ...s, betaChannelEnabled, updateNotifyDismissedVersion: undefined } as any);
    },
    async dismissUpdateNotice(version: string) {
      const s = liveSettings();
      if (!s || s.updateNotifyDismissedVersion === version) return;
      await persist({ ...s, updateNotifyDismissedVersion: version });
    },
    async setHideRecents(hideRecents: boolean) {
      const s = liveSettings();
      if (!s || s.hideRecents === hideRecents) return;
      // Only block when there are no shelves at all; online shelves can be empty while their caches warm.
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
    async setGameContextMenuEnabled(gameContextMenuEnabled: boolean) {
      const s = liveSettings();
      if (!s || s.gameContextMenuEnabled === gameContextMenuEnabled) return;
      await persist({ ...s, gameContextMenuEnabled });
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
    async setOwnQamTabEnabled(ownQamTabEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).ownQamTabEnabled === ownQamTabEnabled) return;
      await persist({ ...s, ownQamTabEnabled } as any);
    },
    async setShowcaseModeEnabled(showcaseModeEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).showcaseModeEnabled === showcaseModeEnabled) return;
      await persist({ ...s, showcaseModeEnabled } as any);
    },
    async setScreensaverShelvesEnabled(screensaverShelvesEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverShelvesEnabled === screensaverShelvesEnabled) return;
      await persist({ ...s, screensaverShelvesEnabled } as any);
    },
    async setScreensaverShelvesIncludeScreenshots(screensaverShelvesIncludeScreenshots: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverShelvesIncludeScreenshots === screensaverShelvesIncludeScreenshots) return;
      await persist({ ...s, screensaverShelvesIncludeScreenshots } as any);
    },
    async setScreensaverOnlineScreenshotsEnabled(screensaverOnlineScreenshotsEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverOnlineScreenshotsEnabled === screensaverOnlineScreenshotsEnabled) return;
      await persist({ ...s, screensaverOnlineScreenshotsEnabled } as any);
    },
    async setScreensaverStartAfterSeconds(screensaverStartAfterSeconds: number) {
      const s = liveSettings();
      if (!s || (s as any).screensaverStartAfterSeconds === screensaverStartAfterSeconds) return;
      await persist({ ...s, screensaverStartAfterSeconds } as any);
    },
    async setScreensaverDwellSeconds(screensaverDwellSeconds: number) {
      const s = liveSettings();
      if (!s || (s as any).screensaverDwellSeconds === screensaverDwellSeconds) return;
      await persist({ ...s, screensaverDwellSeconds } as any);
    },
    async setScreensaverShelfBatchSize(screensaverShelfBatchSize: number) {
      const s = liveSettings();
      if (!s || (s as any).screensaverShelfBatchSize === screensaverShelfBatchSize) return;
      await persist({ ...s, screensaverShelfBatchSize } as any);
    },
    async setScreensaverDescriptionEnabled(screensaverDescriptionEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverDescriptionEnabled === screensaverDescriptionEnabled) return;
      await persist({ ...s, screensaverDescriptionEnabled } as any);
    },
    async setScreensaverDescriptionAboveLogo(screensaverDescriptionAboveLogo: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverDescriptionAboveLogo === screensaverDescriptionAboveLogo) return;
      await persist({ ...s, screensaverDescriptionAboveLogo } as any);
    },
    async setScreensaverDescriptionLogoGap(screensaverDescriptionLogoGap: number) {
      const s = liveSettings();
      if (!s || (s as any).screensaverDescriptionLogoGap === screensaverDescriptionLogoGap) return;
      await persist({ ...s, screensaverDescriptionLogoGap } as any);
    },
    async setScreensaverLogoEnabled(screensaverLogoEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverLogoEnabled === screensaverLogoEnabled) return;
      await persist({ ...s, screensaverLogoEnabled } as any);
    },
    async setScreensaverLogoSize(screensaverLogoSize: number) {
      const s = liveSettings();
      if (!s || (s as any).screensaverLogoSize === screensaverLogoSize) return;
      await persist({ ...s, screensaverLogoSize } as any);
    },
    async setScreensaverLogoPosition(screensaverLogoPosition: 'left' | 'center' | 'right') {
      const s = liveSettings();
      if (!s || (s as any).screensaverLogoPosition === screensaverLogoPosition) return;
      await persist({ ...s, screensaverLogoPosition } as any);
    },
    async setScreensaverLogoAtTop(screensaverLogoAtTop: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverLogoAtTop === screensaverLogoAtTop) return;
      await persist({ ...s, screensaverLogoAtTop } as any);
    },
    async setScreensaverLogoOffset(screensaverLogoOffset: number) {
      const s = liveSettings();
      if (!s || (s as any).screensaverLogoOffset === screensaverLogoOffset) return;
      await persist({ ...s, screensaverLogoOffset } as any);
    },
    async setScreensaverLogoOnScreenshots(screensaverLogoOnScreenshots: boolean) {
      const s = liveSettings();
      if (!s || (s as any).screensaverLogoOnScreenshots === screensaverLogoOnScreenshots) return;
      await persist({ ...s, screensaverLogoOnScreenshots } as any);
    },
    async setCloudSyncEnabled(cloudSyncEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).cloudSyncEnabled === cloudSyncEnabled) return;
      await persist({ ...s, cloudSyncEnabled } as any);
    },
    async setShowcaseStartAfterSeconds(showcaseStartAfterSeconds: number) {
      const s = liveSettings();
      if (!s || (s as any).showcaseStartAfterSeconds === showcaseStartAfterSeconds) return;
      await persist({ ...s, showcaseStartAfterSeconds } as any);
    },
    async setShowcaseDwellSeconds(showcaseDwellSeconds: number) {
      const s = liveSettings();
      if (!s || (s as any).showcaseDwellSeconds === showcaseDwellSeconds) return;
      await persist({ ...s, showcaseDwellSeconds } as any);
    },
    async setShowcaseRandomize(showcaseRandomize: boolean) {
      const s = liveSettings();
      if (!s || (s as any).showcaseRandomize === showcaseRandomize) return;
      await persist({ ...s, showcaseRandomize } as any);
    },
    async setShowcaseStopOnInteraction(showcaseStopOnInteraction: boolean) {
      const s = liveSettings();
      if (!s || (s as any).showcaseStopOnInteraction === showcaseStopOnInteraction) return;
      await persist({ ...s, showcaseStopOnInteraction } as any);
    },
    async setShowcasePanCards(showcasePanCards: boolean) {
      const s = liveSettings();
      if (!s || (s as any).showcasePanCards === showcasePanCards) return;
      await persist({ ...s, showcasePanCards } as any);
    },
    async setShowcaseCardsPerShelf(showcaseCardsPerShelf: number) {
      const s = liveSettings();
      if (!s || (s as any).showcaseCardsPerShelf === showcaseCardsPerShelf) return;
      await persist({ ...s, showcaseCardsPerShelf } as any);
    },
    async setShowcaseCardDwellSeconds(showcaseCardDwellSeconds: number) {
      const s = liveSettings();
      if (!s || (s as any).showcaseCardDwellSeconds === showcaseCardDwellSeconds) return;
      await persist({ ...s, showcaseCardDwellSeconds } as any);
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
      const empty: Settings = { enabled: false, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, gameContextMenuEnabled: true, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalDedupeByName: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [], savedSmartFilters: [], updateNotifyEnabled: true, onlineFeaturesEnabled: false, onlineWishlistEnabled: true, onlinePriceSortEnabled: true, onlinePrivacyAccepted: false, onlineMetadataEnabled: false, onlineHideOwnedGames: false, onlineHideOwnedNonSteam: false, onlineHideOwnedNonSteamCloud: false, forceCssLoaderThemes: false, ownQamTabEnabled: false, showcaseModeEnabled: false, showcaseStartAfterSeconds: 60, showcaseDwellSeconds: 10, showcaseRandomize: false, showcaseStopOnInteraction: true, showcaseShelfIds: [], showcasePanCards: false, showcaseCardsPerShelf: 5, showcaseCardDwellSeconds: 4, globalHeroEnabled: false, globalGameInfoAbove: false, globalFriendsPlayingOverlay: false, globalFriendsPlayingOverlayRecent: false, qamHiddenToggles: [], qamHiddenSections: [], unifiedListEnabled: false, allShelvesOrder: [], lightModeEnabled: false, advancedModeEnabled: false, templateSuggestionsEnabled: false, offlineModeEnabled: false, featureToggles: {}, profiles: [], integrationsEnabled: {}, cardActionShortcutsEnabled: true, buttonBindings: {}, buttonBindingsDisabled: [], keyboardBindings: {}, keyboardBindingsDisabled: [], screensaverShelvesEnabled: false, screensaverShelvesIncludeScreenshots: false, screensaverOnlineScreenshotsEnabled: false, screensaverIdleBackupAcSec: null, screensaverIdleBackupBatterySec: null, screensaverStartAfterSeconds: 60, screensaverDwellSeconds: 8, screensaverLogoEnabled: true, screensaverLogoSize: 100, screensaverLogoPosition: 'left', screensaverLogoAtTop: false, screensaverLogoOffset: 8, screensaverLogoOnScreenshots: true, screensaverShelfBatchSize: 5, screensaverDescriptionEnabled: false, screensaverDescriptionAboveLogo: false, screensaverDescriptionLogoGap: 10, cloudSyncEnabled: false, cloudSyncLastSyncedAt: null };
      clearOwnLocalStorage();
      const accounts = (liveSettings() as any)?.accountSettings;
      await persist(accounts ? { ...empty, accountSettings: accounts } as Settings : empty);
      notify("reset", { body: t("toast_settings_reset") });
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
