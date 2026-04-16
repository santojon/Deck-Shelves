// Plugin registry
export { isPluginInstalled, isTabMasterInstalled, isExternalTabsProviderInstalled, isNonSteamBadgesInstalled } from './registry';

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

// Non-SteamBadges integration
export { isNonSteamBadgesAvailable, NON_STEAM_BADGE_CLASS } from './nonsteambadges';

// DOM-based tab integration (UnifiDeck + other DOM-rendering plugins)
export {
  getUnifiDeckTabs,
  getTabsFromDOM,
} from './domtabs';
