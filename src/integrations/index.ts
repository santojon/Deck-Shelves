// Plugin registry
export { isPluginInstalled, isTabMasterInstalled, isExternalTabsProviderInstalled } from './registry';

// TabMaster integration
export {
  isTabMasterContextValue,
  extractTabsFromContext as extractTabMasterTabs,
  getTabAppsFromContext as getTabMasterAppsFromContext,
  getTabsFromBackend as getTabMasterTabsFromBackend,
  getTabDetailsFromBackend as getTabMasterDetailsFromBackend,
  getTabsFromSettingsFile as getTabMasterTabsFromSettingsFile,
  getVisibleTabsFromSettingsFile as getTabMasterVisibleTabs,
  tabContainerToShelfSource,
  extractTabsForImport as extractTabMasterTabsForImport,
} from './tabmaster';

// DOM-based tab integration (UnifiDeck + other DOM-rendering plugins)
export {
  getUnifiDeckTabs,
  getTabsFromDOM,
} from './domtabs';
