const TOGGLE_PARENTS: Record<string, string> = {
  shelfHeroBackground: 'hideRecents',
  recentsReplaceSource: 'hideRecents',
  onlineWishlistEnabled: 'onlineFeaturesEnabled',
  onlineMetadataEnabled: 'onlineFeaturesEnabled',
  onlinePriceSortEnabled: 'onlineFeaturesEnabled',
  onlineHideOwnedGames: 'onlineFeaturesEnabled',
  onlineHideOwnedNonSteam: 'onlineHideOwnedGames',
  onlineHideOwnedNonSteamCloud: 'onlineHideOwnedNonSteam',
  smartShelvesAtBottom: 'smartShelvesEnabled',
  smartSurpriseMe: 'smartShelvesEnabled',
};

export function isToggleHiddenWithAncestors(key: string, hidden: ReadonlyArray<string>): boolean {
  if (hidden.includes(key)) return true;
  const parent = TOGGLE_PARENTS[key];
  return parent ? isToggleHiddenWithAncestors(parent, hidden) : false;
}
