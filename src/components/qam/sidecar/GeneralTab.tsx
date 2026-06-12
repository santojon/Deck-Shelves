import { Focusable, ToggleField } from '../../../runtime/host/decky'
import type { SettingsController } from '../../../features/settings/controller'
import { CollapsibleSection } from '../../ui'
import { GearIcon, SparkleIcon, WandIcon, PlusCircleIcon, EyeIcon, EyeOffIcon, BookmarkIcon } from '../../icons'
import { openManagedModal } from '../common/openManagedModal'
import { OnlinePrivacyModal } from '../../DeckQAMSettings'
import { isCssLoaderActive } from '../../../core/cssLoaderDetect'
import { isNonSteamBadgesAvailable } from '../../../integrations'

type Mode = 'qam' | 'sidecar'

function HideableRow({
  tk,
  hidden,
  setHidden,
  mode,
  t,
  children,
}: {
  tk: string;
  hidden: boolean;
  setHidden: (next: boolean) => void;
  mode: Mode;
  t: (k: string) => string;
  children: React.ReactNode;
}) {
  if (mode === 'qam' && hidden) return null
  if (mode === 'qam') return <>{children}</>
  // sidecar: row with toggle on the left and an eye button on the right.
  // Use Focusable with flow-children='row' so Steam's nav allows dpad-right
  // from the ToggleField into the eye button.
  const toggle = () => setHidden(!hidden)
  return (
    <Focusable className='ds-hide-row' flow-children='row' noFocusRing>
      {children}
      <Focusable
        className='ds-eye-btn'
        onClick={toggle}
        onOKButton={toggle}
        onActivate={toggle}
        data-ds-eye-toggle={tk}
        data-ds-eye-state={hidden ? 'hidden' : 'shown'}
        title={hidden ? t('qam_show') : t('qam_hide')}
      >
        {hidden ? <EyeOffIcon /> : <EyeIcon />}
      </Focusable>
    </Focusable>
  )
}

function SectionEyeButton({
  id,
  hidden,
  setHidden,
  t,
}: {
  id: string;
  hidden: boolean;
  setHidden: (next: boolean) => void;
  t: (k: string) => string;
}) {
  const toggle = () => setHidden(!hidden)
  return (
    <Focusable
      className='ds-eye-btn ds-eye-btn-section'
      onClick={toggle}
      onOKButton={toggle}
      onActivate={toggle}
      data-ds-eye-section={id}
      data-ds-eye-state={hidden ? 'hidden' : 'shown'}
      title={hidden ? t('qam_show') : t('qam_hide')}
    >
      {hidden ? <EyeOffIcon /> : <EyeIcon />}
    </Focusable>
  )
}

// eslint-disable-next-line complexity
export function GeneralTab({ controller }: { controller: SettingsController }) {
  const { t, actions } = controller
  const settings = controller.settings
  if (!settings) return null
  const hiddenToggles: string[] = (settings as any).qamHiddenToggles ?? []
  const hiddenSections: string[] = (settings as any).qamHiddenSections ?? []
  const isHid = (k: string) => hiddenToggles.includes(k)
  const isSecHid = (id: string) => hiddenSections.includes(id)
  const setHid = (k: string, v: boolean) => (actions as any).setQamHiddenToggle(k, v)
  const setSecHid = (id: string, v: boolean) => (actions as any).setQamHiddenSection(id, v)
  const hasNonSteamBadges = isNonSteamBadgesAvailable()
  let hasCssLoader = false
  try { hasCssLoader = isCssLoaderActive() } catch {}
  const mode: Mode = 'sidecar'
  const row = (tk: string, node: React.ReactNode) => (
    <HideableRow tk={tk} hidden={isHid(tk)} setHidden={(v) => setHid(tk, v)} mode={mode} t={t}>{node}</HideableRow>
  )

  return (
    <div className='ds-general-tab'>
      <CollapsibleSection
        id='behavior'
        icon={<GearIcon />}
        title={t('section_behavior')}
        count={[settings.hideRecents, settings.hideHomeTabs].filter(Boolean).length}
        headerExtra={<SectionEyeButton id='behavior' hidden={isSecHid('behavior')} setHidden={(v) => setSecHid('behavior', v)} t={t} />}
      >
        {row('hideRecents', (
          <ToggleField label={t('hide_recents')} checked={settings.hideRecents === true} onChange={(v: boolean) => actions.setHideRecents(v)} />
        ))}
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          {row('shelfHeroBackground', (
            <ToggleField label={t('shelf_hero_background')} checked={settings.shelfHeroBackground === true} onChange={(v: boolean) => actions.setShelfHeroBackground(v)} />
          ))}
          {row('recentsReplaceSource', (
            <ToggleField label={t('recents_replace_source')} checked={settings.recentsReplaceSource === true} onChange={(v: boolean) => actions.setRecentsReplaceSource(v)} />
          ))}
        </div>
        {row('hideHomeTabs', (
          <ToggleField label={t('hide_home_tabs')} checked={settings.hideHomeTabs === true} onChange={(v: boolean) => actions.setHideHomeTabs(v)} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        id='additional'
        icon={<PlusCircleIcon />}
        title={t('section_additional_features')}
        count={[settings.updateNotifyEnabled !== false, settings.onlineFeaturesEnabled === true, settings.forceCssLoaderThemes === true].filter(Boolean).length}
        headerExtra={<SectionEyeButton id='additional' hidden={isSecHid('additional')} setHidden={(v) => setSecHid('additional', v)} t={t} />}
      >
        {row('updateNotifyEnabled', (
          <ToggleField label={t('check_for_updates')} checked={settings.updateNotifyEnabled !== false} onChange={(v: boolean) => actions.setUpdateNotifyEnabled(v)} />
        ))}
        {row('onlineFeaturesEnabled', (
          <ToggleField
            label={t('online_features')}
            checked={settings.onlineFeaturesEnabled === true}
            onChange={(v: boolean) => {
              if (v && !settings.onlinePrivacyAccepted) {
                openManagedModal((close) => (
                  <OnlinePrivacyModal closeModal={close} t={t} onAccept={() => { void actions.acceptOnlinePrivacy().then(() => actions.setOnlineFeaturesEnabled(true)) }} />
                ))
              } else {
                void actions.setOnlineFeaturesEnabled(v)
              }
            }}
          />
        ))}
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          {row('onlineWishlistEnabled', (
            <ToggleField label={t('online_wishlist')} checked={settings.onlineWishlistEnabled !== false} onChange={(v: boolean) => void actions.setOnlineWishlistEnabled(v)} />
          ))}
          {row('onlinePriceSortEnabled', (
            <ToggleField label={t('online_price_sort')} checked={settings.onlinePriceSortEnabled !== false} onChange={(v: boolean) => void actions.setOnlinePriceSortEnabled(v)} />
          ))}
          {row('onlineHideOwnedGames', (
            <ToggleField label={t('online_hide_owned')} checked={settings.onlineHideOwnedGames !== false} onChange={(v: boolean) => { void actions.setOnlineHideOwnedGames(v); if (!v) void actions.setOnlineHideOwnedNonSteam(false) }} />
          ))}
          <div style={{ paddingLeft: 16 }}>
            {row('onlineHideOwnedNonSteam', (
              <ToggleField label={t('hide_owned_non_steam')} checked={settings.onlineHideOwnedNonSteam === true} onChange={(v: boolean) => void actions.setOnlineHideOwnedNonSteam(v)} />
            ))}
            <div style={{ paddingLeft: 16 }}>
              {row('onlineHideOwnedNonSteamCloud', (
                <ToggleField label={t('hide_owned_non_steam_cloud')} checked={settings.onlineHideOwnedNonSteamCloud === true} onChange={(v: boolean) => void actions.setOnlineHideOwnedNonSteamCloud(v)} />
              ))}
            </div>
          </div>
        </div>
        {hasCssLoader && row('forceCssLoaderThemes', (
          <ToggleField label={t('force_themes_label')} checked={settings.forceCssLoaderThemes === true} onChange={(v: boolean) => void actions.setForceCssLoaderThemes(v)} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        id='smart'
        icon={<SparkleIcon />}
        title={t('smart_section_header')}
        count={settings.smartShelvesEnabled ? (settings.smartShelves ?? []).filter((s: any) => !s.hidden).length : 0}
        headerExtra={<SectionEyeButton id='smart' hidden={isSecHid('smart')} setHidden={(v) => setSecHid('smart', v)} t={t} />}
      >
        {row('smartShelvesEnabled', (
          <ToggleField label={t('smart_shelves_enabled')} checked={settings.smartShelvesEnabled === true} onChange={(v: boolean) => actions.setSmartShelvesEnabled(v)} />
        ))}
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          {row('smartShelvesAtBottom', (
            <ToggleField label={t('smart_shelves_at_bottom')} checked={settings.smartShelvesAtBottom === true} onChange={(v: boolean) => actions.setSmartShelvesAtBottom(v)} />
          ))}
          {row('smartSurpriseMe', (
            <ToggleField label={t('smart_surprise_me')} checked={settings.smartSurpriseMe === true} onChange={(v: boolean) => actions.setSmartSurpriseMe(v)} />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
          id='visual_global'
          icon={<WandIcon />}
          title={t('section_visual_global')}
          count={[settings.globalMatchNativeSize, settings.globalHighlightFirst, settings.globalHighlightAll, settings.globalHideShelfTitle, settings.globalHideGameNames, settings.globalHideStatusLine, settings.globalHideInstallIndicator, settings.globalHideNewBadge, (settings as any).globalHideDiscountBadge, settings.globalHideCompatIcons, settings.globalHideNonSteamBadge, settings.globalHideSeeMore, settings.globalHideRefreshCard, (settings as any).globalDedupeByName].filter(Boolean).length}
          headerExtra={<SectionEyeButton id='visual_global' hidden={isSecHid('visual_global')} setHidden={(v) => setSecHid('visual_global', v)} t={t} />}
        >
          {row('globalMatchNativeSize', (
            <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} onChange={(v: boolean) => actions.setGlobalMatchNativeSize(v)} />
          ))}
          {row('globalHighlightFirst', (
            <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} onChange={(v: boolean) => actions.setGlobalHighlightFirst(v)} />
          ))}
          {row('globalHighlightAll', (
            <ToggleField label={t('highlight_all')} checked={settings.globalHighlightAll === true} onChange={(v: boolean) => actions.setGlobalHighlightAll(v)} />
          ))}
          {row('globalHighlightRandom', (
            <ToggleField label={t('highlight_random')} checked={(settings as any).globalHighlightRandom === true} onChange={(v: boolean) => (actions as any).setGlobalHighlightRandom(v)} />
          ))}
          {row('globalHideShelfTitle', (
            <ToggleField label={t('hide_shelf_titles')} checked={settings.globalHideShelfTitle === true} onChange={(v: boolean) => actions.setGlobalHideShelfTitle(v)} />
          ))}
          {row('globalHideGameNames', (
            <ToggleField label={t('hide_game_names')} checked={settings.globalHideGameNames === true} onChange={(v: boolean) => actions.setGlobalHideGameNames(v)} />
          ))}
          {row('globalHideStatusLine', (
            <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} onChange={(v: boolean) => actions.setGlobalHideStatusLine(v)} />
          ))}
          {row('globalHideInstallIndicator', (
            <ToggleField label={t('hide_install_indicators')} checked={settings.globalHideInstallIndicator === true} onChange={(v: boolean) => actions.setGlobalHideInstallIndicator(v)} />
          ))}
          {row('globalHideNewBadge', (
            <ToggleField label={t('hide_new_badge')} checked={settings.globalHideNewBadge === true} onChange={(v: boolean) => actions.setGlobalHideNewBadge(v)} />
          ))}
          {row('globalHideDiscountBadge', (
            <ToggleField label={t('hide_discount_badge')} checked={(settings as any).globalHideDiscountBadge === true} onChange={(v: boolean) => actions.setGlobalHideDiscountBadge(v)} />
          ))}
          {row('globalHideCompatIcons', (
            <ToggleField label={t('hide_compat_icons')} checked={settings.globalHideCompatIcons === true} onChange={(v: boolean) => actions.setGlobalHideCompatIcons(v)} />
          ))}
          {hasNonSteamBadges && row('globalHideNonSteamBadge', (
            <ToggleField label={t('hide_non_steam_badge')} checked={settings.globalHideNonSteamBadge === true} onChange={(v: boolean) => actions.setGlobalHideNonSteamBadge(v)} />
          ))}
          {row('globalHideSeeMore', (
            <ToggleField label={t('hide_see_more_card')} checked={settings.globalHideSeeMore === true} onChange={(v: boolean) => actions.setGlobalHideSeeMore(v)} />
          ))}
          {row('globalHideRefreshCard', (
            <ToggleField label={t('hide_refresh_card')} checked={settings.globalHideRefreshCard === true} onChange={(v: boolean) => actions.setGlobalHideRefreshCard(v)} />
          ))}
          {row('globalDedupeByName', (
            <ToggleField label={t('global_dedupe_by_name' as any)} checked={(settings as any).globalDedupeByName === true} onChange={(v: boolean) => (actions as any).setGlobalDedupeByName(v)} />
          ))}
          {row('globalHeroEnabled', (
            <ToggleField label={t('global_hero_enabled' as any)} checked={(settings as any).globalHeroEnabled === true} onChange={(v: boolean) => void (actions as any).setGlobalHeroEnabled(v)} />
          ))}
        </CollapsibleSection>

      <CollapsibleSection
        id='saved_filters'
        icon={<BookmarkIcon />}
        title={t('saved_filters_section')}
        count={settings.savedFilters?.length ?? 0}
        headerExtra={<SectionEyeButton id='saved_filters' hidden={isSecHid('saved_filters')} setHidden={(v) => setSecHid('saved_filters', v)} t={t} />}
      >
        <div />
      </CollapsibleSection>

      <CollapsibleSection
        id='saved_smart_filters'
        icon={<BookmarkIcon />}
        title={t('saved_smart_filters_section')}
        count={settings.savedSmartFilters?.length ?? 0}
        headerExtra={<SectionEyeButton id='saved_smart_filters' hidden={isSecHid('saved_smart_filters')} setHidden={(v) => setSecHid('saved_smart_filters', v)} t={t} />}
      >
        <div />
      </CollapsibleSection>
    </div>
  )
}
