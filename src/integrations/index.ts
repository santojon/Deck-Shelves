// Plugin registry
export { isTabMasterInstalled, isNonSteamBadgesInstalled } from './registry';

// Integration descriptors (what each plugin provides + presence)
export { installedIntegrations, integrationsProviding, integrationPresence } from './descriptors';

// TabMaster integration
export { getTabsFromSettingsFile as getTabMasterTabsFromSettingsFile, tabContainerToShelfSource, extractTabsForImport as extractTabMasterTabsForImport } from './tabmaster';

// Non-SteamBadges integration
export { isNonSteamBadgesAvailable } from './nonsteambadges';
