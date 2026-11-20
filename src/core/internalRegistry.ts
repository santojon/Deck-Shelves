
import {
  registerInternalSmartShelfSource,
  registerInternalFilterType,
  registerInternalSortOption,
  registerInternalSearchProvider,
  registerInternalShelfSource,
  registerInternalStatisticsProvider,
  setInternalBootstrap,
} from "./pluginApi";
import i18n from "../i18n";
import { BUILT_IN_SHELF_SEARCH } from "../features/search/builtInProvider";
import { BUILT_IN_LIBRARY_STATISTICS, BUILT_IN_SHELF_STATISTICS } from "../steam/statistics";
import { ALL_FILTER_TYPES, getTypeLabel } from "../components/conditions/utils";
import { SMART_MODE_OPTIONS, SORT_OPTIONS, V3_SOURCE_OPTIONS } from "../components/qam/modals/editShelf/constants";

// Listed, not run: the resolvers evaluate these ids. Each name is read when shown, in the current language.
function installInternalRegistry(): () => void {
  const unsubs: Array<() => void> = [];
  for (const id of [...SMART_MODE_OPTIONS, "custom"]) {
    unsubs.push(registerInternalSmartShelfSource({ id, get displayName() { return i18n.t(`smart_template_${id}`); }, resolve: async () => [] }));
  }
  for (const id of ALL_FILTER_TYPES) {
    unsubs.push(registerInternalFilterType({ id, get displayName() { return getTypeLabel(id); }, evaluate: () => false }));
  }
  for (const o of SORT_OPTIONS) {
    unsubs.push(registerInternalSortOption({ id: o.value, get displayName() { return i18n.t(o.labelKey); }, sort: (appIds) => appIds.slice() }));
  }
  unsubs.push(registerInternalSearchProvider(BUILT_IN_SHELF_SEARCH));
  unsubs.push(registerInternalStatisticsProvider(BUILT_IN_LIBRARY_STATISTICS));
  unsubs.push(registerInternalStatisticsProvider(BUILT_IN_SHELF_STATISTICS));
  for (const o of V3_SOURCE_OPTIONS) {
    unsubs.push(registerInternalShelfSource({ id: o.value, get displayName() { return o.label ?? i18n.t(o.labelKey as string); }, resolve: () => Promise.resolve([]) }));
  }
  return () => { for (const u of unsubs) { try { u(); } catch {} } };
}

// Wired at module load so the plugin API can call in without an import cycle.
setInternalBootstrap(installInternalRegistry);
