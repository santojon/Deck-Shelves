/* Prop derivations the regular and smart shelf editors share verbatim: the
   visual-tab flag bundle, the patch that keeps the hidden-title rule, the
   preview's hide-* flags and the "removable tail" of a manual order. */

export type VisualFlagSource = {
  matchNativeSize: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightRandom: boolean
  enableLogo: boolean
  enableIcon: boolean
  enableDescription: boolean
  descriptionBelowLogo: boolean
  logoPosition: any
  descriptionPosition: any
  logoSize: any
  logoTopOffset: any
  iconVerticalAlign: any
  shelfTitlePosition: any
  gameNamePosition: any
  playtimePosition: any
  descriptionHeight: any
  descriptionLogoGap: any
  descriptionScale: any
  fullPageShelf: boolean
  heroEnabled: boolean
  gameInfoAbove: boolean
  friendsPlayingOverlay: boolean
  friendsPlayingOverlayRecent: boolean
}

export function visualFlagsOf<S extends VisualFlagSource>(state: S) {
  return {
    matchNativeSize: state.matchNativeSize,
    highlightFirst: state.highlightFirst,
    highlightAll: state.highlightAll,
    highlightRandom: state.highlightRandom,
    enableLogo: state.enableLogo,
    enableIcon: state.enableIcon,
    enableDescription: state.enableDescription,
    descriptionBelowLogo: state.descriptionBelowLogo,
    logoPosition: state.logoPosition,
    descriptionPosition: state.descriptionPosition,
    logoSize: state.logoSize,
    logoTopOffset: state.logoTopOffset,
    iconVerticalAlign: state.iconVerticalAlign,
    shelfTitlePosition: state.shelfTitlePosition,
    gameNamePosition: state.gameNamePosition,
    playtimePosition: state.playtimePosition,
    descriptionHeight: state.descriptionHeight,
    descriptionLogoGap: state.descriptionLogoGap,
    descriptionScale: state.descriptionScale,
    fullPageShelf: state.fullPageShelf,
    heroEnabled: state.heroEnabled,
    gameInfoAbove: state.gameInfoAbove,
    friendsPlayingOverlay: state.friendsPlayingOverlay,
    friendsPlayingOverlayRecent: state.friendsPlayingOverlayRecent,
  }
}

// Placing the game info above the cards implies hiding the shelf title.
export function applyVisualPatch<S extends { hideShelfTitle?: boolean }>(prev: S, patch: any): S {
  const next = { ...prev, ...patch }
  if (patch.gameInfoAbove === true) next.hideShelfTitle = true
  return next
}

export type PreviewHideSource = {
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  hideGameNames?: boolean
  hideInstallIndicator?: boolean
  hideSeeMore?: boolean
  hideRefreshCard?: boolean
}

export function previewHideFlags(state: PreviewHideSource) {
  return {
    hideStatusLine: state.hideStatusLine,
    hideNewBadge: state.hideNewBadge,
    hideCompatIcons: state.hideCompatIcons,
    hideNonSteamBadge: state.hideNonSteamBadge,
    hideGameNames: state.hideGameNames === true,
    hideInstallIndicator: state.hideInstallIndicator === true,
    hideSeeMore: state.hideSeeMore === true,
    hideRefreshCard: state.hideRefreshCard === true,
  }
}

/* Manual-order entries no longer present in the resolved source: the preview
   offers to remove them. Undefined when there is nothing to remove. */
export function removableTail(manualOrder: number[], resolvedIds: number[]): Set<number> | undefined {
  if (!manualOrder.length) return undefined
  const inSource = new Set(resolvedIds)
  const tail = manualOrder.filter((id) => !inSource.has(id))
  return tail.length ? new Set(tail) : undefined
}
