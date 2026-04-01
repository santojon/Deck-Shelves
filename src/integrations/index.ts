// Plugin registry
export { isPluginInstalled, isTabMasterInstalled, isUnifiDeckInstalled } from './registry';

// TabMaster integration
export {
  isTabMasterContextValue,
  extractTabsFromContext as extractTabMasterTabs,
  getTabAppsFromContext as getTabMasterAppsFromContext,
  getTabsFromBackend as getTabMasterTabsFromBackend,
  getTabDetailsFromBackend as getTabMasterDetailsFromBackend,
  tabContainerToShelfSource,
  extractTabsForImport as extractTabMasterTabsForImport,
} from './tabmaster';

// UnifiDeck integration
export {
  getUnifiDeckTabs,
  getTabsFromDOM,
  UNIFIDECK_TAB_IDS,
} from './unifideck';
