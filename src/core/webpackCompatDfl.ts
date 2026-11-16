function isObfuscatedClassValue(v: any): v is string {
  return typeof v === 'string'
    && v.length >= 6 && v.length <= 60
    && !/[\s%]/.test(v)
    && /[A-Z0-9_-]/.test(v)
    && /[a-zA-Z]/.test(v);
}

function flattenDflClassMap(cm: any[]): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const mod of cm) {
    if (!mod || typeof mod !== 'object') continue;
    const keys = Object.keys(mod);
    if (keys.length === 0 || keys.length >= 1000) continue;
    for (const k of keys) {
      const v = (mod as any)[k];
      if (isObfuscatedClassValue(v) && !flat[k]) flat[k] = v;
    }
  }
  return flat;
}

export function _discoverViaDFL(doc: Document): Record<string, string> {
  try {
    const w = (doc as any).defaultView as any;
    if (!w) return {};
    const DFL = w.DFL ?? w.deckyFrontendLib;
    if (!DFL || !Array.isArray(DFL.classMap)) return {};
    const flat = flattenDflClassMap(DFL.classMap);

    const KEY_MAP: Record<string, string> = {
      RecentGames: 'nativeRecentGames',
      RecentGame: 'nativeRecentGame',
      RecentGameFooter: 'nativeRecentGameFooter',
      RecentGameMediaContainer: 'nativeRecentGameMedia',
      RecentGamesContainer: 'nativeRecentsContainer',
      RecentGamesInnerContainer: 'nativeRecentsInner',
      RecentGamesHeader: 'nativeRecentsHeader',
      RecentGamesHeaderLabel: 'nativeRecentsHeaderLabel',
      RecentSection: 'nativeRecentsSection',
      RecentlyInteracted: 'nativeRecentlyInteracted',
      RecentlyPlayedFriends: 'nativeRecentlyPlayedFriends',
      RecentlyUpdated: 'nativeRecentlyUpdated',
      RecentlyUpdatedIcon: 'nativeRecentlyUpdatedIcon',
      RecentlyUpdatedText: 'nativeRecentlyUpdatedText',
      RecentlyCompleted: 'nativeRecentlyCompleted',
      RecentlyCompletedCarousel: 'nativeRecentlyCompletedCarousel',
      RecentlyCompletedItem: 'nativeRecentlyCompletedItem',

      RecentGamesBackgroundContainer: 'nativeHeroContainer',
      RecentGamesBackgroundImages: 'nativeHeroImages',
      RecentGamesBackgroundImage: 'nativeHeroImage',
      RecentGamesBackgroundImagePreload: 'nativeHeroImagePreload',
      RecentGamesBackground: 'nativeHeroBg',
      RecentGamesBackgroundAnimation: 'nativeHeroAnim',
      Hero: 'nativeSemanticHero',
      HeroAndLogo: 'nativeHeroAndLogo',
      HeroContainer: 'nativeSemanticHeroContainer',
      HeroGradient: 'nativeHeroGradient',
      HeroImage: 'nativeSemanticHeroImage',
      HeroImageContainer: 'nativeSemanticHeroImageContainer',
      HeroCapsuleImageContainer: 'nativeHeroCapsule',

      Card: 'nativeSemanticCard',
      CardContainer: 'nativeSemanticCardContainer',
      CardImage: 'nativeSemanticCardImage',
      CardWrapper: 'nativeSemanticCardWrapper',
      CardShine: 'nativeSemanticCardShine',
      CardShineContainer_N: 'nativeSemanticCardShineN',
      CardShineContainer_S: 'nativeSemanticCardShineS',
      CardShineContainer_E: 'nativeSemanticCardShineE',
      CardShineContainer_W: 'nativeSemanticCardShineW',
      CardsSection: 'nativeCardsSection',
      LibraryItemBox: 'nativeLibraryItemBox',
      LibraryItemBoxTitle: 'nativeLibraryItemTitle',
      LibraryItemBoxSubscript: 'nativeLibraryItemSubscript',
      LibraryItemBoxShine: 'nativeLibraryItemShine',
      LibraryItemIcons: 'nativeLibraryItemIcons',
      LibraryItemUpdateBadge: 'nativeLibraryItemUpdateBadge',
      LibraryItemActionButton: 'nativeLibraryItemAction',
      LibraryItemOverlayOuterArea: 'nativeLibraryItemOverlayOuter',
      LibraryItemOverlayInnerArea: 'nativeLibraryItemOverlayInner',

      Capsule: 'nativeCapsule',
      CapsuleImage: 'nativeCapsuleImage',
      CapsuleImageCtn: 'nativeCapsuleImageCtn',
      CapsuleArt: 'nativeCapsuleArt',
      CapsuleBackground: 'nativeCapsuleBg',
      CapsuleBackgroundContainer: 'nativeCapsuleBgContainer',
      CapsuleVisible: 'nativeCapsuleVisible',
      CapsuleName: 'nativeCapsuleName',
      CapsuleContainer: 'nativeCapsuleContainer',
      CapsuleColumn: 'nativeCapsuleColumn',
      CapsuleParentInfo: 'nativeCapsuleParentInfo',
      CapsuleDecorators: 'nativeCapsuleDecorators',
      CapsuleBottomBar: 'nativeCapsuleBottomBar',
      CapsuleImageAnchorPoint: 'nativeCapsuleImageAnchor',
      GameCapsule: 'nativeGameCapsule',

      Featured: 'nativeSemanticFeatured',
      FeaturedCapsule: 'nativeSemanticFeaturedCapsule',
      FeaturedSeparator: 'nativeFeaturedSeparator',
      FeaturedItem: 'nativeFeaturedItem',
      FeaturedItemImage: 'nativeFeaturedItemImage',
      FeaturedItemHeader: 'nativeFeaturedItemHeader',
      FeaturedItemName: 'nativeFeaturedItemName',
      FeaturedItemDesc: 'nativeFeaturedItemDesc',
      FeaturedItemHideButton: 'nativeFeaturedItemHide',
      FeaturedItemLink: 'nativeFeaturedItemLink',
      FeaturedItemDetailsContainer: 'nativeFeaturedItemDetails',
      FeaturedLinks: 'nativeFeaturedLinks',
      featuredLabels: 'nativeFeaturedLabels',
      featuredTitle: 'nativeFeaturedTitle',
      featuredSubTitle: 'nativeFeaturedSubtitle',

      Focus: 'nativeFocus',
      Focused: 'nativeFocused',
      FocusedContainer: 'nativeFocusedContainer',
      FocusedColumn: 'nativeFocusedColumn',
      FocusedClip: 'nativeFocusedClip',
      FocusRing: 'nativeFocusRing',
      FocusRingRoot: 'nativeFocusRingRoot',
      FocusRingOnHiddenItem: 'nativeFocusRingHidden',
      FocusBar: 'nativeFocusBar',
      focusAnimation: 'nativeFocusAnim',
      Highlight: 'nativeHighlight',
      Highlighted: 'nativeHighlighted',
      HighlightOnFocus: 'nativeHighlightOnFocus',
      HighlightDiv: 'nativeHighlightDiv',
      HighlightIcon: 'nativeHighlightIcon',
      HighlightTitle: 'nativeHighlightTitle',
      HighlightDesc: 'nativeHighlightDesc',
      Highlights: 'nativeHighlights',
      HighlightEdge: 'nativeHighlightEdge',

      Title: 'nativeTitle',
      TitleBar: 'nativeTitleBar',
      TitleSection: 'nativeTitleSection',
      TitleRow: 'nativeTitleRow',
      TitleText: 'nativeTitleText',
      TitleLogo: 'nativeTitleLogo',
      TitleLabel: 'nativeTitleLabel',
      TitleContainer: 'nativeTitleContainer',
      TitleImageContainer: 'nativeTitleImageContainer',
      TitleCtn: 'nativeTitleCtn',
      GameTitle: 'nativeGameTitle',
      GameName: 'nativeGameName',
      gameName: 'nativeGameNameLower',
      GameLogo: 'nativeGameLogo',
      gameLogo: 'nativeGameLogoLower',
      GameArt: 'nativeGameArt',

      Hide: 'nativeHide',
      Hidden: 'nativeHidden',
      HideButton: 'nativeHideButton',
      HideMask: 'nativeHideMask',
      HideGradient: 'nativeHideGradient',
      HiddenGameLabel: 'nativeHiddenGameLabel',
      HiddenLabel: 'nativeHiddenLabel',

      Status: 'nativeStatus',
      StatusIcon: 'nativeStatusIcon',
      StatusItem: 'nativeStatusItem',
      StatusEntry: 'nativeStatusEntry',
      StatusText: 'nativeStatusText',
      StatusLine: 'nativeStatusLine',
      StatusTime: 'nativeStatusTime',
      StatusSpinner: 'nativeStatusSpinner',
      StatusWrapper: 'nativeStatusWrapper',
      StatusOverride: 'nativeStatusOverride',
      StatusThrobber: 'nativeStatusThrobber',
      StatusSuccess: 'nativeStatusSuccess',
      StatusDanger: 'nativeStatusDanger',
      StatusCaution: 'nativeStatusCaution',
      gameState: 'nativeGameState',

      Playtime: 'nativePlaytime',
      PlaytimeStatus: 'nativePlaytimeStatus',
      PlaytimeContent: 'nativePlaytimeContent',
      PlaytimeDetails: 'nativePlaytimeDetails',
      PlaytimeSection: 'nativePlaytimeSection',
      PlaytimeIcon: 'nativePlaytimeIcon',
      PlaytimeCurrentSession: 'nativePlaytimeCurrentSession',
      PlayTimeRow: 'nativePlayTimeRow',

      DeckCompat: 'nativeDeckCompat',
      DeckCompatIcon: 'nativeDeckCompatIcon',
      CompatIcon: 'nativeCompatIcon',
      CompatLabel: 'nativeCompatLabel',
      Compatible: 'nativeCompatible',
      CompatFooterIcons: 'nativeCompatFooterIcons',
      CompatFooterDescription: 'nativeCompatFooterDesc',

      Footer: 'nativeFooter',
      FooterControls: 'nativeFooterControls',
      FooterLegend: 'nativeFooterLegend',
      FooterItem: 'nativeFooterItem',
      FooterVisible: 'nativeFooterVisible',
      FooterBlurImage: 'nativeFooterBlur',
      FooterBlurImageContainer: 'nativeFooterBlurCtn',

      Section: 'nativeSection',
      SectionHeader: 'nativeSectionHeader',
      SectionHeaderContent: 'nativeSectionHeaderContent',
      SectionTitle: 'nativeSectionTitle',
      SectionName: 'nativeSectionName',
      SectionCount: 'nativeSectionCount',
      SectionSeparator: 'nativeSectionSeparator',
      SectionGap: 'nativeSectionGap',
      SectionContainer: 'nativeSectionContainer',
      GameRow: 'nativeSemanticGameRow',
      GameList: 'nativeGameList',

      Library: 'nativeLibrary',
      LibraryHome: 'nativeLibraryHome',
      LibraryHomeSection: 'nativeLibraryHomeSection',
      LibraryContent: 'nativeLibraryContent',
      LibraryHeader: 'nativeLibraryHeader',
      LibraryInventory: 'nativeLibraryInventory',
      LibraryImage: 'nativeLibraryImage',
      LibraryImageWithName: 'nativeLibraryImageWithName',
      LibraryImageBackgroundGlow: 'nativeLibraryImageGlow',
      LibraryFallbackAssetImageContainer: 'nativeLibraryFallbackAsset',
      LibraryAssetExpandedDisplay: 'nativeLibraryAssetExpanded',
      LibraryViewSubtitle: 'nativeLibraryViewSubtitle',
      LibraryHomeEmptyGames: 'nativeLibraryHomeEmpty',
      LibraryHomeWhatsNew: 'nativeLibraryHomeWhatsNew',
      LibraryHomeMajorUpdates: 'nativeLibraryHomeMajorUpdates',
      LibraryHomeFriends: 'nativeLibraryHomeFriends',
      HomeBox: 'nativeHomeBox',
      GameListHomeAndSearch: 'nativeGameListHomeAndSearch',

      CarouselBody: 'nativeSemanticCarouselBody',
      CarouselHeader: 'nativeSemanticCarouselHeader',
      CarouselItem: 'nativeSemanticCarouselItem',
      CarouselDisplay: 'nativeSemanticCarouselDisplay',
      CarouselImage: 'nativeSemanticCarouselImage',
      CarouselDescription: 'nativeCarouselDescription',
      CarouselThumb: 'nativeCarouselThumb',
      CarouselThumbs: 'nativeCarouselThumbs',
      CarouselPage: 'nativeCarouselPage',
      CarouselIcon: 'nativeCarouselIcon',
      CarouselGameLabel: 'nativeCarouselGameLabel',
      CarouselGameLabelWrapper: 'nativeCarouselGameLabelWrapper',
      CarouselItemLabel: 'nativeCarouselItemLabel',
      CarouselItemLabelWrapper: 'nativeCarouselItemLabelWrapper',
      CarouselCapsuleAnimated: 'nativeCarouselCapsuleAnimated',
      CarouselCapsuleBordered: 'nativeCarouselCapsuleBordered',
      CarouselCapsuleBackgroundGlow: 'nativeCarouselCapsuleGlow',
      CarouselControlsPadding: 'nativeCarouselControlsPadding',

      Spotlights: 'nativeSpotlights',
      Banner: 'nativeBanner',
      BannerContainer: 'nativeBannerContainer',
      BannerContents: 'nativeBannerContents',
      BannerContent: 'nativeBannerContent',
      BannerHeader: 'nativeBannerHeader',
      BannerVideoOverlay: 'nativeBannerVideo',
      BannerSecondHalf: 'nativeBannerSecondHalf',

      Collection: 'nativeCollection',
      CollectionShelfBanner: 'nativeCollectionShelfBanner',
      CollectionShelfBannerCtn: 'nativeCollectionShelfBannerCtn',
      CollectionBG: 'nativeCollectionBg',
      CollectionBar: 'nativeCollectionBar',
      CollectionName: 'nativeCollectionName',
      CollectionLabel: 'nativeCollectionLabel',
      CollectionLabelCount: 'nativeCollectionLabelCount',
      CollectionImage: 'nativeCollectionImage',
      CollectionIcon: 'nativeCollectionIcon',
      CollectionIconBox: 'nativeCollectionIconBox',
      CollectionContents: 'nativeCollectionContents',
      CollectionHeader: 'nativeCollectionHeader',

      LibraryContextMenu: 'nativeLibraryContextMenu',
    };

    const out: Record<string, string> = {};
    for (const [dflKey, dsKey] of Object.entries(KEY_MAP)) {
      const v = flat[dflKey];
      if (v) out[dsKey] = v;
    }
    return out;
  } catch {
    return {};
  }
}
