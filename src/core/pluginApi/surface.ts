import { registerTranslations } from "../../i18n";
import {
  addExternal, isReservedId, NOOP_UNSUB,
  shelfSources, contextAwareShelfSources, smartSources, filterTypes, sortOptions, importTypes,
  searchProviders, sideMenuProviders, contextProviders, widgetProviders, shelfRenderers,
  metadataProviders, statisticsProviders, recommendationProviders, exportHandlers, importHandlers,
  internalShelfSourceIds, internalSmartSourceIds, internalFilterTypeIds, internalSortOptionIds,
  internalImportTypeIds, internalSearchProviderIds, internalStatisticsProviderIds,
  getExternalExportHandlers, getExternalImportHandlers, getExternalSearchProviders,
  getExternalSideMenuProviders, getExternalContextProviders, getExternalWidgetProviders,
  getExternalShelfRenderers, getExternalMetadataProviders, getExternalStatisticsProviders,
  getExternalRecommendationProviders,
} from "./registries";
import { getCurrentSettings, saveSettings, subscribeSettings } from "../../store/settingsStore";
import { triggerShelfRefresh } from "../shelfRefresh";
import { isTabMasterInstalled } from "../../integrations/registry";
import {
  projectShelves, projectSmartShelves, projectSavedFilters, projectSavedSmartFilters,
  projectProfiles, projectIntegrations, projectSettingsSnapshot,
  detectLocale, detectGamepadUi, detectOs,
} from "./projections";
import { TRIGGER_CATALOG } from "../../domain/triggerCatalog";
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES } from "../../domain/templates";
import { DEFAULT_BINDINGS } from "../../runtime/buttonBindings";
import { DEFAULT_KEYBOARD_BINDINGS, resolveKeyboardBindings } from "../../runtime/keyboardBindings";
import pkg from "../../../package.json";
import * as focusTracker from "../focusedCardTracker";
import * as assets from "../steamAssets";
import type { DeckShelvesPublicAPI, ExternalSavedFilterDescriptor, PublicShelfSource, PublicTriggerKind } from "@deck-shelves/api";
import { SmartShelfModeSchema, isKnownFilterType } from "../../types";

const SAVED_FILTER_PREFIX = "ext:";

// Ids the plugin evaluates itself are reserved even where its own lists do not offer them.
const reservedFilterTypes = { has: (id: string) => internalFilterTypeIds.has(id) || isKnownFilterType(id) };
const reservedSmartModes = { has: (id: string) => internalSmartSourceIds.has(id) || SmartShelfModeSchema.safeParse(id).success };

async function persistRegisteredSavedFilter(d: ExternalSavedFilterDescriptor): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const fullId = `${SAVED_FILTER_PREFIX}${d.id}`;
  const existing = (s.savedFilters ?? []).filter((f: any) => f.id !== fullId);
  const next = [...existing, { id: fullId, name: d.name, group: { ...(d.group as object) } as any }];
  await saveSettings({ ...s, savedFilters: next as any });
}

async function removeRegisteredSavedFilter(id: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const fullId = `${SAVED_FILTER_PREFIX}${id}`;
  const next = (s.savedFilters ?? []).filter((f: any) => f.id !== fullId);
  await saveSettings({ ...s, savedFilters: next as any });
}

export function makeApi(): DeckShelvesPublicAPI {
  return {
    version: 4,

    registerShelfSource(d) { return addExternal(shelfSources, d, internalShelfSourceIds); },
    getRegisteredSources() { return Array.from(shelfSources.values()); },

    registerContextAwareShelfSource(d) {
      // Also registered as a plain source so the picker sees it without special-casing.
      if (isReservedId(d?.id, internalShelfSourceIds)) return NOOP_UNSUB;
      contextAwareShelfSources.set(d.id, d);
      const unShelf = addExternal(shelfSources, d);
      return () => { if (contextAwareShelfSources.get(d.id) === d) contextAwareShelfSources.delete(d.id); unShelf(); };
    },
    getRegisteredContextAwareShelfSources() { return Array.from(contextAwareShelfSources.values()); },

    registerSmartShelfSource(d) { return addExternal(smartSources, d, reservedSmartModes); },
    getRegisteredSmartSources() { return Array.from(smartSources.values()); },

    registerFilterType(d) { return addExternal(filterTypes, d, reservedFilterTypes); },
    getRegisteredFilterTypes() { return Array.from(filterTypes.values()); },

    registerSortOption(d) { return addExternal(sortOptions, d, internalSortOptionIds); },
    getRegisteredSortOptions() { return Array.from(sortOptions.values()); },

    registerImportType(d) { return addExternal(importTypes, d, internalImportTypeIds); },
    getRegisteredImportTypes() { return Array.from(importTypes.values()); },
    getRegisteredImportTypesForTarget(target) {
      return Array.from(importTypes.values()).filter((d) => (d.target ?? "shelves") === target);
    },

    registerSavedFilter(d) {
      void persistRegisteredSavedFilter(d);
      return () => { void removeRegisteredSavedFilter(d.id); };
    },

    registerExportHandler(d) { return addExternal(exportHandlers, d); },
    registerImportHandler(d) { return addExternal(importHandlers, d); },
    getRegisteredExportHandlers() { return getExternalExportHandlers(); },
    getRegisteredImportHandlers() { return getExternalImportHandlers(); },

    hasTabMaster() { return isTabMasterInstalled(); },

    registerSearchProvider(d) { return addExternal(searchProviders, d, internalSearchProviderIds); },
    getRegisteredSearchProviders() { return getExternalSearchProviders(); },

    registerSideMenuProvider(d) { return addExternal(sideMenuProviders, d); },
    getRegisteredSideMenuProviders() { return getExternalSideMenuProviders(); },

    registerContextProvider(d) { return addExternal(contextProviders, d); },
    getRegisteredContextProviders() { return getExternalContextProviders(); },
    registerWidgetProvider(d) { return addExternal(widgetProviders, d); },
    getRegisteredWidgetProviders() { return getExternalWidgetProviders(); },
    registerShelfRenderer(d) { return addExternal(shelfRenderers, d); },
    getRegisteredShelfRenderers() { return getExternalShelfRenderers(); },
    registerMetadataProvider(d) { return addExternal(metadataProviders, d); },
    getRegisteredMetadataProviders() { return getExternalMetadataProviders(); },
    registerStatisticsProvider(d) { return addExternal(statisticsProviders, d, internalStatisticsProviderIds); },
    getRegisteredStatisticsProviders() { return getExternalStatisticsProviders(); },
    registerRecommendationProvider(d) { return addExternal(recommendationProviders, d); },
    getRegisteredRecommendationProviders() { return getExternalRecommendationProviders(); },

    registerTranslations(locale, dict) { registerTranslations(locale, dict); },

    listTriggerCatalog() {
      const out: PublicTriggerKind[] = [];
      for (const cat of TRIGGER_CATALOG) {
        for (const e of cat.entries) {
          out.push({ kind: e.kind, category: cat.id, categoryTitleKey: cat.titleKey, defaults: e.defaults, invertible: e.invertible === true });
        }
      }
      return out;
    },
    listShelfTemplates() {
      return [...SHELF_TEMPLATES, ...ONLINE_SHELF_TEMPLATES].map((t) => ({
        id: t.id, titleKey: t.titleKey, category: t.category,
        requiresOnline: t.requiresOnline === true, defaultSort: t.defaultSort,
        source: t.source as unknown as PublicShelfSource,
      }));
    },
    listShortcuts() {
      const bindings = ((getCurrentSettings() as any)?.buttonBindings ?? {}) as Record<string, string>;
      return (Object.keys(DEFAULT_BINDINGS) as Array<keyof typeof DEFAULT_BINDINGS>).map((action) => ({
        action, defaultCombo: DEFAULT_BINDINGS[action],
        combo: typeof bindings[action] === "string" && bindings[action] ? bindings[action] : DEFAULT_BINDINGS[action],
      }));
    },
    listKeyboardShortcuts() {
      const s = getCurrentSettings() as any;
      const resolved = resolveKeyboardBindings(s?.keyboardBindings, s?.keyboardBindingsDisabled, s?.cardActionShortcutsEnabled !== false);
      return (Object.keys(DEFAULT_KEYBOARD_BINDINGS) as Array<keyof typeof DEFAULT_KEYBOARD_BINDINGS>).map((action) => ({
        action, combo: resolved[action],
      }));
    },

    getShelves() { return projectShelves(getCurrentSettings()); },
    getSmartShelves() { return projectSmartShelves(getCurrentSettings()); },
    getSavedFilters() { return projectSavedFilters(getCurrentSettings()); },
    getSavedSmartFilters() { return projectSavedSmartFilters(getCurrentSettings()); },
    subscribeShelves(cb) {
      let last = JSON.stringify(projectShelves(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectShelves(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    subscribeSmartShelves(cb) {
      let last = JSON.stringify(projectSmartShelves(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSmartShelves(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    subscribeSavedFilters(cb) {
      let last = JSON.stringify(projectSavedFilters(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSavedFilters(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    refreshShelf(shelfId) { triggerShelfRefresh({ manual: true, shelfId }); },

    getFocusedCard() {
      const { getFocusedCard } = requireFocusTracker();
      return getFocusedCard();
    },
    subscribeFocusedCard(cb) {
      const { subscribeFocusedCard } = requireFocusTracker();
      return subscribeFocusedCard(cb);
    },
    getProfiles() { return projectProfiles(getCurrentSettings()); },
    getActiveProfile() {
      const all = projectProfiles(getCurrentSettings());
      return all.find((p) => p.active) ?? null;
    },
    subscribeProfiles(cb) {
      let last = JSON.stringify(projectProfiles(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectProfiles(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    getIntegrations() { return projectIntegrations(getCurrentSettings()); },
    subscribeIntegrations(cb) {
      let last = JSON.stringify(projectIntegrations(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectIntegrations(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    getSettingsSnapshot() { return projectSettingsSnapshot(getCurrentSettings()); },
    subscribeSettingsSnapshot(cb) {
      let last = JSON.stringify(projectSettingsSnapshot(getCurrentSettings()));
      return subscribeSettings((s) => {
        const next = projectSettingsSnapshot(s);
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        try { cb(next); } catch {}
      });
    },
    getEnvironment() {
      return {
        pluginVersion: typeof pkg?.version === "string" ? pkg.version : "0.0.0",
        apiVersion: 4,
        locale: detectLocale(),
        isGamepadUi: detectGamepadUi(),
        os: detectOs(),
      };
    },

    getAssetUrls(appid, type) {
      const a = requireAssets();
      switch (type) {
        case "hero": return a.getHeroUrls(appid);
        case "heroBlur": return a.getHeroBlurUrls(appid);
        case "portrait": return a.getPortraitUrls(appid);
        case "landscape": return a.getLandscapeUrls(appid);
        case "logo": return a.getLogoUrls(appid);
        case "icon": return a.getIconUrls(appid);
        case "storeBackground": return a.getStorePageBackgroundUrls(appid);
        default: return [];
      }
    },
  };
}

function requireFocusTracker(): typeof focusTracker { return focusTracker; }
function requireAssets(): typeof assets { return assets; }
