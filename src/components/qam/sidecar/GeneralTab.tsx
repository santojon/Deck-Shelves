import { useRef, type ReactNode } from 'react'
import { Dropdown, Field, Focusable, ToggleField } from '../../../runtime/host/decky'
import { takeNavTreeFocus } from '../../../runtime/navFocus'
import type { SettingsController } from '../../../features/settings/controller'
import { CollapsibleSection, DSSliderField, PositionField, useLightMode, type HorizontalPosition } from '../../ui'
import { SlidersIcon, SparkleIcon, WandIcon, PlusCircleIcon, EyeIcon, EyeOffIcon, BookmarkIcon } from '../../icons'
import { openManagedModal } from '../common/openManagedModal'
import { applyGameInfoAboveToggle, applyHideTitleToggle } from '../common/gameInfoCoupling'
import { confirmAction } from '../modals/ConfirmActionModal'
import { OnlinePrivacyModal } from '../../DeckQAMSettings'
import { ProfilesSection } from '../sections/ProfilesSection'
import { isCssLoaderActive } from '../../../core/cssLoaderDetect'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { HideableRow, type HideableRowMode } from './HideableRow'

type Mode = HideableRowMode

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
  const eyeRef = useRef<HTMLDivElement>(null)
  const toggle = () => {
    setHidden(!hidden)
    const el = eyeRef.current
    if (el) requestAnimationFrame(() => { try { takeNavTreeFocus(el) } catch {} })
  }
  return (
    <Focusable
      ref={eyeRef as any}
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

interface GCtx {
  t: (k: any, opts?: any) => string;
  settings: any;
  actions: any;
  row: (tk: string, node: ReactNode) => ReactNode;
  isSecHid: (id: string) => boolean;
  setSecHid: (id: string, v: boolean) => void;
  lightMode: boolean;
  hasNonSteamBadges: boolean;
  hasCssLoader: boolean;
}

const eye = (c: GCtx, id: string) => (
  <SectionEyeButton id={id} hidden={c.isSecHid(id)} setHidden={(v) => c.setSecHid(id, v)} t={c.t} />
)

function behaviorSection(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <CollapsibleSection
      id='behavior'
      icon={<SlidersIcon />}
      title={t('section_behavior')}
      count={[settings.hideRecents === true, settings.hideHomeTabs === true, settings.shelfHeroBackground === true, settings.recentsReplaceSource === true].filter(Boolean).length}
      headerExtra={eye(c, 'behavior')}
    >
      {row('hideRecents', (
        <ToggleField label={t('hide_recents')} checked={settings.hideRecents === true} onChange={(v: boolean) => actions.setHideRecents(v)} />
      ))}
      {settings.hideRecents === true && (
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          {row('shelfHeroBackground', (
            <ToggleField label={t('shelf_hero_background')} checked={settings.shelfHeroBackground === true} onChange={(v: boolean) => actions.setShelfHeroBackground(v)} />
          ))}
          {row('recentsReplaceSource', (
            <ToggleField label={t('recents_replace_source')} checked={settings.recentsReplaceSource === true} onChange={(v: boolean) => actions.setRecentsReplaceSource(v)} />
          ))}
        </div>
      )}
      {row('hideHomeTabs', (
        <ToggleField label={t('hide_home_tabs')} checked={settings.hideHomeTabs === true} onChange={(v: boolean) => actions.setHideHomeTabs(v)} />
      ))}
    </CollapsibleSection>
  )
}

function onlineSubsection(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <div style={{ paddingLeft: 14, fontSize: 12 }}>
      {row('onlineWishlistEnabled', (
        <ToggleField label={t('online_wishlist')} checked={settings.onlineWishlistEnabled !== false} onChange={(v: boolean) => void actions.setOnlineWishlistEnabled(v)} />
      ))}
      {(settings as any).advancedModeEnabled === true && row('onlineMetadataEnabled', (
        <ToggleField label={t('online_metadata')} checked={settings.onlineMetadataEnabled === true} onChange={(v: boolean) => void actions.setOnlineMetadataEnabled(v)} />
      ))}
      {row('onlinePriceSortEnabled', (
        <ToggleField label={t('online_price_sort')} checked={settings.onlinePriceSortEnabled !== false} onChange={(v: boolean) => void actions.setOnlinePriceSortEnabled(v)} />
      ))}
      {row('onlineHideOwnedGames', (
        <ToggleField label={t('online_hide_owned')} checked={settings.onlineHideOwnedGames !== false} onChange={(v: boolean) => { void actions.setOnlineHideOwnedGames(v); if (!v) void actions.setOnlineHideOwnedNonSteam(false) }} />
      ))}
      {settings.onlineHideOwnedGames !== false && (
        <div style={{ paddingLeft: 16 }}>
          {row('onlineHideOwnedNonSteam', (
            <ToggleField label={t('hide_owned_non_steam')} checked={settings.onlineHideOwnedNonSteam === true} onChange={(v: boolean) => void actions.setOnlineHideOwnedNonSteam(v)} />
          ))}
          {settings.onlineHideOwnedNonSteam === true && (
            <div style={{ paddingLeft: 16 }}>
              {row('onlineHideOwnedNonSteamCloud', (
                <ToggleField label={t('hide_owned_non_steam_cloud')} checked={settings.onlineHideOwnedNonSteamCloud === true} onChange={(v: boolean) => void actions.setOnlineHideOwnedNonSteamCloud(v)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function searchNavGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <>
      {row('contextSearchEnabled', (
        <ToggleField label={t('context_search_toggle' as any)} checked={(settings as any).contextSearchEnabled === true} onChange={(v: boolean) => (actions as any).setContextSearchEnabled(v)} />
      ))}
      {(settings as any).contextSearchEnabled === true && (
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          {row('contextSearchKeyboardEnabled', (
            <ToggleField label={t('context_search_keyboard' as any)} checked={(settings as any).contextSearchKeyboardEnabled !== false} onChange={(v: boolean) => (actions as any).setContextSearchKeyboardEnabled(v)} />
          ))}
          {row('contextSearchOnEnter', (
            <ToggleField label={t('context_search_on_enter' as any)} checked={(settings as any).contextSearchOnEnter === true} onChange={(v: boolean) => (actions as any).setContextSearchOnEnter(v)} />
          ))}
        </div>
      )}
      {row('sideNavEnabled', (
        <ToggleField label={t('side_nav_toggle' as any)} checked={(settings as any).sideNavEnabled === true} onChange={(v: boolean) => (actions as any).setSideNavEnabled(v)} />
      ))}
    </>
  )
}

function additionalSection(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode, hasCssLoader } = c
  return (
    <CollapsibleSection
      id='additional'
      icon={<PlusCircleIcon />}
      title={t('section_additional_features')}
      count={[settings.updateNotifyEnabled !== false, (settings as any).contextSearchEnabled === true, (settings as any).sideNavEnabled === true, settings.onlineFeaturesEnabled === true, settings.forceCssLoaderThemes === true].filter(Boolean).length}
      headerExtra={eye(c, 'additional')}
    >
      {row('updateNotifyEnabled', (
        <ToggleField label={t('check_for_updates')} checked={settings.updateNotifyEnabled !== false} onChange={(v: boolean) => actions.setUpdateNotifyEnabled(v)} />
      ))}
      {settings.updateNotifyEnabled !== false && (
        <div style={{ paddingLeft: 16 }}>
          {row('betaChannelEnabled', (
            <ToggleField label={t('beta_channel_label' as any)} checked={(settings as any).betaChannelEnabled === true} onChange={(v: boolean) => (actions as any).setBetaChannelEnabled(v)} />
          ))}
        </div>
      )}
      {row('lightModeEnabled', (
        <ToggleField label={t('light_mode_enabled' as any)} checked={(settings as any).lightModeEnabled === true} onChange={(v: boolean) => { if (v && (settings as any).advancedModeEnabled === true) { confirmAction({ title: t('mode_switch_title' as any), body: t('mode_switch_light_body' as any), okText: t('confirm_continue' as any), cancelText: t('cancel'), onConfirm: () => (actions as any).setLightModeEnabled?.(true) }) } else { (actions as any).setLightModeEnabled?.(v) } }} />
      ))}
      {row('advancedModeEnabled', (
        <ToggleField label={t('advanced_mode_enabled' as any)} checked={(settings as any).advancedModeEnabled === true} onChange={(v: boolean) => { if (v && (settings as any).lightModeEnabled === true) { confirmAction({ title: t('mode_switch_title' as any), body: t('mode_switch_advanced_body' as any), okText: t('confirm_continue' as any), cancelText: t('cancel'), onConfirm: () => (actions as any).setAdvancedModeEnabled?.(true) }) } else { (actions as any).setAdvancedModeEnabled?.(v) } }} />
      ))}
      {row('offlineModeEnabled', (
        <ToggleField label={t('offline_mode_enabled' as any)} checked={(settings as any).offlineModeEnabled === true} onChange={(v: boolean) => (actions as any).setOfflineModeEnabled?.(v)} />
      ))}
      {/* Search + side nav are disabled on the home in light mode. */}
      {!lightMode && searchNavGroup(c)}
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
      {settings.onlineFeaturesEnabled === true && onlineSubsection(c)}
      {hasCssLoader && !lightMode && row('forceCssLoaderThemes', (
        <ToggleField label={t('force_themes_label')} checked={settings.forceCssLoaderThemes === true} onChange={(v: boolean) => void actions.setForceCssLoaderThemes(v)} />
      ))}
    </CollapsibleSection>
  )
}

function smartSection(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode } = c
  return (
    <CollapsibleSection
      id='smart'
      icon={<SparkleIcon />}
      title={t('smart_section_header')}
      count={settings.smartShelvesEnabled ? (settings.smartShelves ?? []).filter((s: any) => !s.hidden).length : 0}
      headerExtra={eye(c, 'smart')}
    >
      {row('smartShelvesEnabled', (
        <ToggleField label={t('smart_shelves_enabled')} checked={settings.smartShelvesEnabled === true} onChange={(v: boolean) => actions.setSmartShelvesEnabled(v)} />
      ))}
      <div style={{ paddingLeft: 14, fontSize: 12 }}>
        {!lightMode && row('smartShelvesAtBottom', (
          <ToggleField label={t('smart_shelves_at_bottom')} checked={settings.smartShelvesAtBottom === true} onChange={(v: boolean) => actions.setSmartShelvesAtBottom(v)} />
        ))}
        {!lightMode && row('smartSurpriseMe', (
          <ToggleField label={t('smart_surprise_me')} checked={settings.smartSurpriseMe === true} onChange={(v: boolean) => actions.setSmartSurpriseMe(v)} />
        ))}
        {row('unifiedListEnabled', (
          <ToggleField label={t('unified_list_enabled' as any)} checked={(settings as any).unifiedListEnabled === true} onChange={(v: boolean) => (actions as any).setUnifiedListEnabled?.(v)} />
        ))}
      </div>
    </CollapsibleSection>
  )
}

function logoGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode } = c
  const on = (settings as any).globalEnableLogo === true
  return (
    <>
      {row('globalEnableLogo', (
        <ToggleField label={t('enable_logo')} checked={on} onChange={(v: boolean) => (actions as any).setGlobalEnableLogo(v)} />
      ))}
      {on && row('globalLogoPosition', (
        <PositionField labelKey='logo_position_label' value={(settings as any).globalLogoPosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalLogoPosition(v)} />
      ))}
      {on && !lightMode && row('globalLogoSize', (
        <DSSliderField label={t('logo_size_label' as any)} value={(settings as any).globalLogoSize ?? 100} min={50} max={200} step={5} unit='%' onChange={(v: number) => (actions as any).setGlobalLogoSize(v)} />
      ))}
      {on && !lightMode && row('globalLogoTopOffset', (
        <DSSliderField label={t('logo_top_offset_label' as any)} value={(settings as any).globalLogoTopOffset ?? 20} min={-50} max={100} step={5} unit='%' onChange={(v: number) => (actions as any).setGlobalLogoTopOffset(v)} />
      ))}
    </>
  )
}

function iconGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <>
      {row('globalEnableIcon', (
        <ToggleField label={t('enable_icon')} checked={(settings as any).globalEnableIcon === true} onChange={(v: boolean) => (actions as any).setGlobalEnableIcon(v)} />
      ))}
      {(settings as any).globalEnableIcon === true && row('globalIconVerticalAlign', (
        <Field label={t('icon_vertical_align_label' as any)} childrenContainerWidth='min'>
          <Dropdown
            rgOptions={[
              { data: 'top', label: t('icon_vertical_align_top' as any) },
              { data: 'center', label: t('icon_vertical_align_center' as any) },
              { data: 'bottom', label: t('icon_vertical_align_bottom' as any) },
            ]}
            selectedOption={(settings as any).globalIconVerticalAlign ?? 'top'}
            onChange={(opt: any) => (actions as any).setGlobalIconVerticalAlign(opt?.data ?? 'top')}
          />
        </Field>
      ))}
    </>
  )
}

function descriptionGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode } = c
  if ((settings as any).globalEnableDescription !== true) return null
  const belowLogo = (settings as any).globalDescriptionBelowLogo === true
  return (
    <>
      {row('globalDescriptionScale', (
        <DSSliderField label={t('description_size_label')} value={(settings as any).globalDescriptionScale ?? 100} min={100} max={200} step={10} unit='%' onChange={(v: number) => (actions as any).setGlobalDescriptionScale(v)} />
      ))}
      {row('globalDescriptionPosition', (
        <PositionField labelKey='description_position_label' value={(settings as any).globalDescriptionPosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalDescriptionPosition(v)} />
      ))}
      {(settings as any).globalEnableLogo === true && row('globalDescriptionBelowLogo', (
        <ToggleField label={t('description_below_logo' as any)} checked={belowLogo} onChange={(v: boolean) => (actions as any).setGlobalDescriptionBelowLogo(v)} />
      ))}
      {belowLogo && !lightMode && (<>
        {row('globalDescriptionHeight', (
          <DSSliderField label={t('description_height_label' as any)} value={(settings as any).globalDescriptionHeight ?? 2} min={1} max={3} step={1} onChange={(v: number) => (actions as any).setGlobalDescriptionHeight(v)} />
        ))}
        {row('globalDescriptionLogoGap', (
          <DSSliderField label={t('description_logo_gap_label' as any)} value={(settings as any).globalDescriptionLogoGap ?? 8} min={-40} max={80} step={5} unit='px' onChange={(v: number) => (actions as any).setGlobalDescriptionLogoGap(v)} />
        ))}
      </>)}
    </>
  )
}

const GLOBAL_VISUAL_COUNT_KEYS = [
  'globalMatchNativeSize', 'globalHighlightFirst', 'globalHighlightAll', 'globalHighlightRandom',
  'globalEnableLogo', 'globalEnableIcon', 'globalEnableDescription', 'globalDescriptionBelowLogo',
  'globalHeroEnabled', 'globalGameInfoAbove', 'globalFriendsPlayingOverlay', 'globalFriendsPlayingOverlayRecent',
  'globalFullPageShelf', 'globalHideShelfTitle', 'globalHideGameNames', 'globalHideStatusLine',
  'globalHideInstallIndicator', 'globalHideNewBadge', 'globalHideDiscountBadge', 'globalHideCompatIcons',
  'globalHideNonSteamBadge', 'globalHideSeeMore', 'globalHideRefreshCard', 'globalDedupeByName',
] as const

function globalVisualCount(settings: any): number {
  let n = (settings.globalDescriptionScale ?? 100) > 100 ? 1 : 0
  for (const k of GLOBAL_VISUAL_COUNT_KEYS) if (settings[k]) n++
  return n
}

function visualGlobalSection(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode, hasNonSteamBadges } = c
  return (
    <CollapsibleSection
      id='visual_global'
      icon={<WandIcon />}
      title={t('section_visual_global')}
      count={globalVisualCount(settings)}
      headerExtra={eye(c, 'visual_global')}
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
        <ToggleField label={t('hide_shelf_titles')} checked={settings.globalHideShelfTitle === true} onChange={(v: boolean) => applyHideTitleToggle({ next: v, infoAbove: (settings as any).globalGameInfoAbove === true, t, setHideTitle: (x) => actions.setGlobalHideShelfTitle(x), setGameInfoAbove: (x) => void (actions as any).setGlobalGameInfoAbove(x) })} />
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
      {!lightMode && row('globalHeroEnabled', (
        <ToggleField label={t('global_hero_enabled' as any)} checked={(settings as any).globalHeroEnabled === true} onChange={(v: boolean) => void (actions as any).setGlobalHeroEnabled(v)} />
      ))}
      {row('globalGameInfoAbove', (
        <ToggleField label={t('global_game_info_above' as any)} checked={(settings as any).globalGameInfoAbove === true} onChange={(v: boolean) => applyGameInfoAboveToggle({ next: v, hideTitle: settings.globalHideShelfTitle === true, t, setGameInfoAbove: (x) => void (actions as any).setGlobalGameInfoAbove(x), setHideTitle: (x) => actions.setGlobalHideShelfTitle(x) })} />
      ))}
      {row('globalFriendsPlayingOverlay', (
        <ToggleField label={t('friends_overlay_label' as any)} checked={(settings as any).globalFriendsPlayingOverlay === true} onChange={(v: boolean) => void (actions as any).setGlobalFriendsPlayingOverlay(v)} />
      ))}
      {(settings as any).globalFriendsPlayingOverlay === true && row('globalFriendsPlayingOverlayRecent', (
        <div style={{ paddingLeft: 14 }}>
          <ToggleField label={t('friends_overlay_recent_label' as any)} checked={(settings as any).globalFriendsPlayingOverlayRecent === true} onChange={(v: boolean) => void (actions as any).setGlobalFriendsPlayingOverlayRecent(v)} />
        </div>
      ))}
      {/* Logo / icon / description decorations are stripped in light mode. */}
      {!lightMode && (<>
        {logoGroup(c)}
        {iconGroup(c)}
        {descriptionGroup(c)}
      </>)}
      {row('globalShelfTitlePosition', (
        <PositionField labelKey='shelf_title_position_label' value={(settings as any).globalShelfTitlePosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalShelfTitlePosition(v)} />
      ))}
      {row('globalGameNamePosition', (
        <PositionField labelKey='game_name_position_label' value={(settings as any).globalGameNamePosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalGameNamePosition(v)} />
      ))}
      {row('globalPlaytimePosition', (
        <PositionField labelKey='playtime_position_label' value={(settings as any).globalPlaytimePosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalPlaytimePosition(v)} />
      ))}
      {row('globalFullPageShelf', (
        <ToggleField label={t('full_page_shelves_label' as any)} checked={(settings as any).globalFullPageShelf === true} onChange={(v: boolean) => (actions as any).setGlobalFullPageShelf(v)} />
      ))}
    </CollapsibleSection>
  )
}

function savedFiltersSections(c: GCtx): ReactNode {
  const { t, settings } = c
  return (
    <>
      <CollapsibleSection
        id='saved_filters'
        icon={<BookmarkIcon />}
        title={t('saved_filters_section')}
        count={settings.savedFilters?.length ?? 0}
        headerExtra={eye(c, 'saved_filters')}
      >
        <div />
      </CollapsibleSection>
      <CollapsibleSection
        id='saved_smart_filters'
        icon={<BookmarkIcon />}
        title={t('saved_smart_filters_section')}
        count={settings.savedSmartFilters?.length ?? 0}
        headerExtra={eye(c, 'saved_smart_filters')}
      >
        <div />
      </CollapsibleSection>
    </>
  )
}

export function GeneralTab({ controller }: { controller: SettingsController }) {
  const { t, actions } = controller
  const settings = controller.settings
  const lightMode = useLightMode()
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
  const row = (tk: string, node: ReactNode) => (
    <HideableRow tk={tk} hidden={isHid(tk)} setHidden={(v) => setHid(tk, v)} mode={mode} t={t}>{node}</HideableRow>
  )
  const c: GCtx = { t, settings, actions, row, isSecHid, setSecHid, lightMode, hasNonSteamBadges, hasCssLoader }

  return (
    <div className='ds-general-tab'>
      {/* Profiles mirrors the QAM (it sits above Behavior there). */}
      <ProfilesSection
        controller={controller}
        hidden={false}
        headerExtra={<SectionEyeButton id='profiles' hidden={isSecHid('profiles')} setHidden={(v) => setSecHid('profiles', v)} t={t} />}
      />
      {behaviorSection(c)}
      {additionalSection(c)}
      {smartSection(c)}
      {visualGlobalSection(c)}
      {savedFiltersSections(c)}
    </div>
  )
}
