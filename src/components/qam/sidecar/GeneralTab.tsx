import { useRef, type ReactNode } from 'react'
import { Dropdown, Field, Focusable, ToggleField } from '../../../runtime/host/decky'
import { takeNavTreeFocus } from '../../../runtime/navFocus'
import type { SettingsController } from '../../../features/settings/controller'
import type { Settings } from '../../../types'
import { CollapsibleSection, DSSliderField, PositionField, useLightMode, type HorizontalPosition } from '../../ui'
import { SlidersIcon, SparkleIcon, WandIcon, PlusCircleIcon, SearchIcon, OnlineIcon, EyeIcon, EyeOffIcon, BookmarkIcon, CloudIcon } from '../../icons'
import { openManagedModal } from '../common/openManagedModal'
import { applyGameInfoAboveToggle, applyHideTitleToggle } from '../common/gameInfoCoupling'
import { DESCRIPTION_SIZE_GROUP, LOGO_SIZE_GROUP, ResetGlobalVisualButton, groupPatch, isGroupSet } from '../common/globalVisualGroups'
import { confirmAction } from '../modals/ConfirmActionModal'
import { OnlinePrivacyModal } from '../../DeckQAMSettings'
import { ProfilesSection } from '../../../features/profiles/ProfilesSection'
import { isCssLoaderActive } from '../../../core/cssLoaderDetect'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { isScreensaverSupportDetected } from '../../../runtime/screensaverInject'
import { hasCloudSyncSupport } from '../../../runtime/cloudSync'
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
  settings: Settings;
  actions: any;
  row: (tk: string, node: ReactNode) => ReactNode;
  isSecHid: (id: string) => boolean;
  setSecHid: (id: string, v: boolean) => void;
  lightMode: boolean;
  hasNonSteamBadges: boolean;
  hasCssLoader: boolean;
  hasScreensaverSupport: boolean;
  hasCloudSync: boolean;
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
      count={[settings.hideRecents === true, settings.hideHomeTabs === true, settings.shelfHeroBackground === true, settings.recentsReplaceSource === true, settings.gameContextMenuEnabled === false].filter(Boolean).length}
      headerExtra={eye(c, 'behavior')}
    >
      {row('gameContextMenuEnabled', (
        <ToggleField label={t('game_context_menu_enabled')} checked={settings.gameContextMenuEnabled !== false} onChange={(v: boolean) => actions.setGameContextMenuEnabled?.(v)} />
      ))}
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
      {settings.advancedModeEnabled === true && row('onlineMetadataEnabled', (
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

function additionalSection(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <CollapsibleSection
      id='additional'
      icon={<PlusCircleIcon />}
      title={t('section_additional_features')}
      count={[settings.updateNotifyEnabled !== false, settings.lightModeEnabled === true, settings.advancedModeEnabled === true, settings.offlineModeEnabled === true].filter(Boolean).length}
      headerExtra={eye(c, 'additional')}
    >
      {row('updateNotifyEnabled', (
        <ToggleField label={t('check_for_updates')} checked={settings.updateNotifyEnabled !== false} onChange={(v: boolean) => actions.setUpdateNotifyEnabled(v)} />
      ))}
      {settings.updateNotifyEnabled !== false && (
        <div style={{ paddingLeft: 16 }}>
          {row('betaChannelEnabled', (
            <ToggleField label={t('beta_channel_label' as any)} checked={settings.betaChannelEnabled === true} onChange={(v: boolean) => (actions as any).setBetaChannelEnabled(v)} />
          ))}
        </div>
      )}
      {row('lightModeEnabled', (
        <ToggleField label={t('light_mode_enabled' as any)} checked={settings.lightModeEnabled === true} onChange={(v: boolean) => { if (v && settings.advancedModeEnabled === true) { confirmAction({ title: t('mode_switch_title' as any), body: t('mode_switch_light_body' as any), okText: t('confirm_continue' as any), cancelText: t('cancel'), onConfirm: () => (actions as any).setLightModeEnabled?.(true) }) } else { (actions as any).setLightModeEnabled?.(v) } }} />
      ))}
      {row('advancedModeEnabled', (
        <ToggleField label={t('advanced_mode_enabled' as any)} checked={settings.advancedModeEnabled === true} onChange={(v: boolean) => { if (v && settings.lightModeEnabled === true) { confirmAction({ title: t('mode_switch_title' as any), body: t('mode_switch_advanced_body' as any), okText: t('confirm_continue' as any), cancelText: t('cancel'), onConfirm: () => (actions as any).setAdvancedModeEnabled?.(true) }) } else { (actions as any).setAdvancedModeEnabled?.(v) } }} />
      ))}
      {row('offlineModeEnabled', (
        <ToggleField label={t('offline_mode_enabled' as any)} checked={settings.offlineModeEnabled === true} onChange={(v: boolean) => (actions as any).setOfflineModeEnabled?.(v)} />
      ))}
    </CollapsibleSection>
  )
}

function navigationSection(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode } = c
  if (lightMode) return null // search + side nav are disabled on the home in light mode
  return (
    <CollapsibleSection
      id='navigation'
      icon={<SearchIcon />}
      title={t('section_navigation' as any)}
      count={[settings.contextSearchEnabled === true, settings.sideNavEnabled === true].filter(Boolean).length}
      headerExtra={eye(c, 'navigation')}
    >
      {row('contextSearchEnabled', (
        <ToggleField label={t('context_search_toggle' as any)} checked={settings.contextSearchEnabled === true} onChange={(v: boolean) => (actions as any).setContextSearchEnabled(v)} />
      ))}
      {settings.contextSearchEnabled === true && (
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          {row('contextSearchKeyboardEnabled', (
            <ToggleField label={t('context_search_keyboard' as any)} checked={settings.contextSearchKeyboardEnabled !== false} onChange={(v: boolean) => (actions as any).setContextSearchKeyboardEnabled(v)} />
          ))}
          {row('contextSearchOnEnter', (
            <ToggleField label={t('context_search_on_enter' as any)} checked={settings.contextSearchOnEnter === true} onChange={(v: boolean) => (actions as any).setContextSearchOnEnter(v)} />
          ))}
        </div>
      )}
      {row('sideNavEnabled', (
        <ToggleField label={t('side_nav_toggle' as any)} checked={settings.sideNavEnabled === true} onChange={(v: boolean) => (actions as any).setSideNavEnabled(v)} />
      ))}
    </CollapsibleSection>
  )
}

function onlineSection(c: GCtx): ReactNode {
  const { t, settings, actions, row, hasCloudSync } = c
  return (
    <CollapsibleSection
      id='online'
      icon={<OnlineIcon />}
      title={t('section_online' as any)}
      count={[settings.onlineFeaturesEnabled === true, hasCloudSync && settings.cloudSyncEnabled === true].filter(Boolean).length}
      headerExtra={eye(c, 'online')}
    >
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
      {hasCloudSync && cloudSyncGroup(c)}
      {settings.onlineFeaturesEnabled === true && onlineSubsection(c)}
    </CollapsibleSection>
  )
}

function cloudSyncStatusText(t: any, lastSyncedAt: unknown): string {
  if (typeof lastSyncedAt !== 'number') return t('cloud_sync_status_never' as any)
  return t('cloud_sync_status_synced' as any, { time: new Date(lastSyncedAt).toLocaleString() })
}

function cloudSyncGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  const on = settings.cloudSyncEnabled === true
  return (<>
    {row('cloudSyncEnabled', (
      <ToggleField label={t('cloud_sync_enabled' as any)} checked={on} onChange={(v: boolean) => void (actions as any).setCloudSyncEnabled(v)} />
    ))}
    <div style={{ paddingLeft: 14, fontSize: 11, opacity: 0.65, lineHeight: 1.4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <CloudIcon size={12} /><span>{t('cloud_sync_desc' as any)}</span>
    </div>
    {on && (
      <div style={{ paddingLeft: 14, fontSize: 11, opacity: 0.55 }}>
        {cloudSyncStatusText(t, settings.cloudSyncLastSyncedAt)}
      </div>
    )}
  </>)
}

function experimentalSection(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode, hasCssLoader, hasScreensaverSupport } = c
  return (
    <CollapsibleSection
      id='experimental'
      icon={<WandIcon />}
      title={t('section_experimental' as any)}
      count={[settings.forceCssLoaderThemes === true, settings.showcaseModeEnabled === true, hasScreensaverSupport && settings.screensaverShelvesEnabled === true].filter(Boolean).length}
      headerExtra={eye(c, 'experimental')}
    >
      {hasCssLoader && !lightMode && row('forceCssLoaderThemes', (
        <ToggleField label={t('force_themes_label')} checked={settings.forceCssLoaderThemes === true} onChange={(v: boolean) => void actions.setForceCssLoaderThemes(v)} />
      ))}
      {showcaseModeGroup(c)}
      {hasScreensaverSupport && screensaverShelvesGroup(c)}
    </CollapsibleSection>
  )
}

function screensaverShelvesGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  const on = settings.screensaverShelvesEnabled === true
  const logoOn = settings.screensaverLogoEnabled !== false
  return (<>
    {row('screensaverShelvesEnabled', (
      <ToggleField label={t('screensaver_shelves_enabled' as any)} checked={on} onChange={(v: boolean) => void (actions as any).setScreensaverShelvesEnabled(v)} />
    ))}
    {on && (
      <div style={{ paddingLeft: 14, fontSize: 12 }}>
        {row('screensaverShelvesIncludeScreenshots', (
          <ToggleField label={t('screensaver_shelves_include_screenshots' as any)} checked={settings.screensaverShelvesIncludeScreenshots === true} onChange={(v: boolean) => void (actions as any).setScreensaverShelvesIncludeScreenshots(v)} />
        ))}
        {row('screensaverOnlineScreenshotsEnabled', (
          <ToggleField label={t('screensaver_online_screenshots' as any)} checked={settings.screensaverOnlineScreenshotsEnabled === true} onChange={(v: boolean) => void (actions as any).setScreensaverOnlineScreenshotsEnabled(v)} />
        ))}
        {row('screensaverStartAfterSeconds', (
          <DSSliderField label={t('screensaver_start_after_label' as any)} value={settings.screensaverStartAfterSeconds ?? 60} min={15} max={600} step={15} unit='s' onChange={(v: number) => void (actions as any).setScreensaverStartAfterSeconds(v)} />
        ))}
        {row('screensaverDwellSeconds', (
          <DSSliderField label={t('screensaver_dwell_label' as any)} value={settings.screensaverDwellSeconds ?? 8} min={3} max={120} step={1} unit='s' onChange={(v: number) => void (actions as any).setScreensaverDwellSeconds(v)} />
        ))}
        {row('screensaverShelfBatchSize', (
          <DSSliderField label={t('screensaver_shelf_batch_size_label' as any)} value={settings.screensaverShelfBatchSize ?? 5} min={1} max={20} step={1} onChange={(v: number) => void (actions as any).setScreensaverShelfBatchSize(v)} />
        ))}
        {row('screensaverLogoEnabled', (
          <ToggleField label={t('screensaver_logo_enabled' as any)} checked={logoOn} onChange={(v: boolean) => void (actions as any).setScreensaverLogoEnabled(v)} />
        ))}
        {logoOn && row('screensaverLogoSize', (
          <DSSliderField label={t('screensaver_logo_size_label' as any)} value={settings.screensaverLogoSize ?? 100} min={50} max={200} step={5} unit='%' onChange={(v: number) => void (actions as any).setScreensaverLogoSize(v)} />
        ))}
        {logoOn && screensaverLogoPlacementGroup(c)}
      </div>
    )}
  </>)
}

function screensaverLogoPlacementGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (<>
    {row('screensaverLogoPosition', (
      <PositionField labelKey='logo_position_label' value={settings.screensaverLogoPosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => void (actions as any).setScreensaverLogoPosition(v)} />
    ))}
    {row('screensaverLogoAtTop', (
      <ToggleField label={t('screensaver_logo_at_top_label' as any)} checked={settings.screensaverLogoAtTop === true} onChange={(v: boolean) => void (actions as any).setScreensaverLogoAtTop(v)} />
    ))}
    {row('screensaverLogoOffset', (
      <DSSliderField label={t('screensaver_logo_offset_label' as any)} value={settings.screensaverLogoOffset ?? 8} min={0} max={50} step={1} unit='%' onChange={(v: number) => void (actions as any).setScreensaverLogoOffset(v)} />
    ))}
    {settings.screensaverShelvesIncludeScreenshots === true && row('screensaverLogoOnScreenshots', (
      <ToggleField label={t('screensaver_logo_on_screenshots_label' as any)} checked={settings.screensaverLogoOnScreenshots !== false} onChange={(v: boolean) => void (actions as any).setScreensaverLogoOnScreenshots(v)} />
    ))}
    {row('screensaverDescriptionEnabled', (
      <ToggleField label={t('screensaver_description_enabled' as any)} checked={settings.screensaverDescriptionEnabled === true} onChange={(v: boolean) => void (actions as any).setScreensaverDescriptionEnabled(v)} />
    ))}
    {settings.screensaverDescriptionEnabled === true && row('screensaverDescriptionAboveLogo', (
      <ToggleField label={t('screensaver_description_above_logo' as any)} checked={settings.screensaverDescriptionAboveLogo === true} onChange={(v: boolean) => void (actions as any).setScreensaverDescriptionAboveLogo(v)} />
    ))}
    {settings.screensaverDescriptionEnabled === true && row('screensaverDescriptionLogoGap', (
      <DSSliderField label={t('screensaver_description_logo_gap_label' as any)} value={settings.screensaverDescriptionLogoGap ?? 10} min={-40} max={80} step={5} unit='px' onChange={(v: number) => void (actions as any).setScreensaverDescriptionLogoGap(v)} />
    ))}
  </>)
}

function showcaseModeGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  const on = settings.showcaseModeEnabled === true
  return (<>
    {row('showcaseModeEnabled', (
      <ToggleField label={t('showcase_mode_enabled' as any)} checked={on} onChange={(v: boolean) => void (actions as any).setShowcaseModeEnabled(v)} />
    ))}
    <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
      {t('showcase_mode_desc' as any)}
    </div>
    {on && (
      <div style={{ paddingLeft: 14, fontSize: 12 }}>
        {row('showcaseStartAfterSeconds', (
          <DSSliderField label={t('showcase_start_after_label' as any)} value={settings.showcaseStartAfterSeconds ?? 60} min={15} max={600} step={15} unit='s' onChange={(v: number) => void (actions as any).setShowcaseStartAfterSeconds(v)} />
        ))}
        {row('showcaseDwellSeconds', (
          <DSSliderField label={t('showcase_dwell_label' as any)} value={settings.showcaseDwellSeconds ?? 10} min={3} max={120} step={1} unit='s' onChange={(v: number) => void (actions as any).setShowcaseDwellSeconds(v)} />
        ))}
        {row('showcaseRandomize', (
          <ToggleField label={t('showcase_randomize_label' as any)} checked={settings.showcaseRandomize === true} onChange={(v: boolean) => void (actions as any).setShowcaseRandomize(v)} />
        ))}
        {row('showcaseStopOnInteraction', (
          <ToggleField label={t('showcase_stop_on_interaction_label' as any)} checked={settings.showcaseStopOnInteraction !== false} onChange={(v: boolean) => void (actions as any).setShowcaseStopOnInteraction(v)} />
        ))}
        {row('showcasePanCards', (
          <ToggleField label={t('showcase_pan_cards_label' as any)} checked={settings.showcasePanCards === true} onChange={(v: boolean) => void (actions as any).setShowcasePanCards(v)} />
        ))}
        {settings.showcasePanCards === true && (<>
          {row('showcaseCardsPerShelf', (
            <DSSliderField label={t('showcase_cards_per_shelf_label' as any)} value={settings.showcaseCardsPerShelf ?? 5} min={1} max={20} step={1} onChange={(v: number) => void (actions as any).setShowcaseCardsPerShelf(v)} />
          ))}
          {row('showcaseCardDwellSeconds', (
            <DSSliderField label={t('showcase_card_dwell_label' as any)} value={settings.showcaseCardDwellSeconds ?? 4} min={1} max={60} step={1} unit='s' onChange={(v: number) => void (actions as any).setShowcaseCardDwellSeconds(v)} />
          ))}
        </>)}
      </div>
    )}
  </>)
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
          <ToggleField label={t('unified_list_enabled' as any)} checked={settings.unifiedListEnabled === true} onChange={(v: boolean) => (actions as any).setUnifiedListEnabled?.(v)} />
        ))}
      </div>
    </CollapsibleSection>
  )
}

function logoGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode } = c
  const on = settings.globalEnableLogo === true
  return (
    <>
      {row('globalEnableLogo', (
        <ToggleField label={t('enable_logo')} checked={on} onChange={(v: boolean) => (actions as any).setGlobalEnableLogo(v)} />
      ))}
      {on && row('globalLogoPosition', (
        <PositionField labelKey='logo_position_label' value={settings.globalLogoPosition ?? null} t={t} perShelfLabel={t('per_shelf_option' as any)} onPerShelf={() => (actions as any).setGlobalLogoPosition(null)} onChange={(v: HorizontalPosition) => (actions as any).setGlobalLogoPosition(v)} />
      ))}
      {on && !lightMode && logoSizeRows(c)}
    </>
  )
}

// "Same size and offset on every shelf" and, when on, its sliders.
function logoSizeRows(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  const sized = isGroupSet(settings, LOGO_SIZE_GROUP)
  return (
    <>
      {row('globalLogoSizeSame', (
        <ToggleField label={t('global_logo_size_same' as any)} checked={sized} onChange={(v: boolean) => (actions as any).setGlobalVisualValues(groupPatch(settings, LOGO_SIZE_GROUP, v))} />
      ))}
      {sized && row('globalLogoSize', (
        <DSSliderField label={t('logo_size_label' as any)} value={settings.globalLogoSize ?? 100} min={50} max={200} step={5} unit='%' onChange={(v: number) => (actions as any).setGlobalLogoSize(v)} />
      ))}
      {sized && row('globalLogoTopOffset', (
        <DSSliderField label={t('logo_top_offset_label' as any)} value={settings.globalLogoTopOffset ?? 20} min={-50} max={100} step={5} unit='%' onChange={(v: number) => (actions as any).setGlobalLogoTopOffset(v)} />
      ))}
    </>
  )
}

function iconGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <>
      {row('globalEnableIcon', (
        <ToggleField label={t('enable_icon')} checked={settings.globalEnableIcon === true} onChange={(v: boolean) => (actions as any).setGlobalEnableIcon(v)} />
      ))}
      {settings.globalEnableIcon === true && row('globalIconVerticalAlign', (
        <Field label={t('icon_vertical_align_label' as any)} childrenContainerWidth='min'>
          <Dropdown
            rgOptions={[
              { data: 'per_shelf', label: t('per_shelf_option' as any) },
              { data: 'top', label: t('icon_vertical_align_top' as any) },
              { data: 'center', label: t('icon_vertical_align_center' as any) },
              { data: 'bottom', label: t('icon_vertical_align_bottom' as any) },
            ]}
            selectedOption={settings.globalIconVerticalAlign ?? 'per_shelf'}
            onChange={(opt: any) => (actions as any).setGlobalIconVerticalAlign(opt?.data === 'per_shelf' ? null : (opt?.data ?? 'top'))}
          />
        </Field>
      ))}
    </>
  )
}

function descriptionGroup(c: GCtx): ReactNode {
  const { t, settings, actions, row, lightMode } = c
  if (settings.globalEnableDescription !== true) return null
  const belowLogo = settings.globalDescriptionBelowLogo === true
  const sized = isGroupSet(settings, DESCRIPTION_SIZE_GROUP)
  return (
    <>
      {row('globalDescriptionSizeSame', (
        <ToggleField label={t('global_description_size_same' as any)} checked={sized} onChange={(v: boolean) => (actions as any).setGlobalVisualValues(groupPatch(settings, DESCRIPTION_SIZE_GROUP, v))} />
      ))}
      {sized && row('globalDescriptionScale', (
        <DSSliderField label={t('description_size_label')} value={settings.globalDescriptionScale ?? 100} min={100} max={200} step={10} unit='%' onChange={(v: number) => (actions as any).setGlobalDescriptionScale(v)} />
      ))}
      {row('globalDescriptionPosition', (
        <PositionField labelKey='description_position_label' value={settings.globalDescriptionPosition ?? null} t={t} perShelfLabel={t('per_shelf_option' as any)} onPerShelf={() => (actions as any).setGlobalDescriptionPosition(null)} onChange={(v: HorizontalPosition) => (actions as any).setGlobalDescriptionPosition(v)} />
      ))}
      {settings.globalEnableLogo === true && row('globalDescriptionBelowLogo', (
        <ToggleField label={t('description_below_logo' as any)} checked={belowLogo} onChange={(v: boolean) => (actions as any).setGlobalDescriptionBelowLogo(v)} />
      ))}
      {sized && belowLogo && !lightMode && descriptionLogoRows(c)}
    </>
  )
}

// Height and gap of a description shown under the logo.
function descriptionLogoRows(c: GCtx): ReactNode {
  const { t, settings, actions, row } = c
  return (
    <>
      {row('globalDescriptionHeight', (
        <DSSliderField label={t('description_height_label' as any)} value={settings.globalDescriptionHeight ?? 2} min={1} max={3} step={1} onChange={(v: number) => (actions as any).setGlobalDescriptionHeight(v)} />
      ))}
      {row('globalDescriptionLogoGap', (
        <DSSliderField label={t('description_logo_gap_label' as any)} value={settings.globalDescriptionLogoGap ?? 8} min={-40} max={80} step={5} unit='px' onChange={(v: number) => (actions as any).setGlobalDescriptionLogoGap(v)} />
      ))}
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

function globalVisualCount(settings: Settings): number {
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
        <ToggleField label={t('highlight_random')} checked={settings.globalHighlightRandom === true} onChange={(v: boolean) => (actions as any).setGlobalHighlightRandom(v)} />
      ))}
      {row('globalHideShelfTitle', (
        <ToggleField label={t('hide_shelf_titles')} checked={settings.globalHideShelfTitle === true} onChange={(v: boolean) => applyHideTitleToggle({ next: v, infoAbove: settings.globalGameInfoAbove === true, t, setHideTitle: (x) => actions.setGlobalHideShelfTitle(x), setGameInfoAbove: (x) => void (actions as any).setGlobalGameInfoAbove(x) })} />
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
        <ToggleField label={t('hide_discount_badge')} checked={settings.globalHideDiscountBadge === true} onChange={(v: boolean) => actions.setGlobalHideDiscountBadge(v)} />
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
        <ToggleField label={t('global_dedupe_by_name' as any)} checked={settings.globalDedupeByName === true} onChange={(v: boolean) => (actions as any).setGlobalDedupeByName(v)} />
      ))}
      {!lightMode && row('globalHeroEnabled', (
        <ToggleField label={t('global_hero_enabled' as any)} checked={settings.globalHeroEnabled === true} onChange={(v: boolean) => void (actions as any).setGlobalHeroEnabled(v)} />
      ))}
      {row('globalGameInfoAbove', (
        <ToggleField label={t('global_game_info_above' as any)} checked={settings.globalGameInfoAbove === true} onChange={(v: boolean) => applyGameInfoAboveToggle({ next: v, hideTitle: settings.globalHideShelfTitle === true, t, setGameInfoAbove: (x) => void (actions as any).setGlobalGameInfoAbove(x), setHideTitle: (x) => actions.setGlobalHideShelfTitle(x) })} />
      ))}
      {row('globalFriendsPlayingOverlay', (
        <ToggleField label={t('friends_overlay_label' as any)} checked={settings.globalFriendsPlayingOverlay === true} onChange={(v: boolean) => void (actions as any).setGlobalFriendsPlayingOverlay(v)} />
      ))}
      {settings.globalFriendsPlayingOverlay === true && row('globalFriendsPlayingOverlayRecent', (
        <div style={{ paddingLeft: 14 }}>
          <ToggleField label={t('friends_overlay_recent_label' as any)} checked={settings.globalFriendsPlayingOverlayRecent === true} onChange={(v: boolean) => void (actions as any).setGlobalFriendsPlayingOverlayRecent(v)} />
        </div>
      ))}
      {/* Logo / icon / description decorations are stripped in light mode. */}
      {!lightMode && (<>
        {logoGroup(c)}
        {iconGroup(c)}
        {descriptionGroup(c)}
      </>)}
      {row('globalShelfTitlePosition', (
        <PositionField labelKey='shelf_title_position_label' value={settings.globalShelfTitlePosition ?? null} t={t} perShelfLabel={t('per_shelf_option' as any)} onPerShelf={() => (actions as any).setGlobalShelfTitlePosition(null)} onChange={(v: HorizontalPosition) => (actions as any).setGlobalShelfTitlePosition(v)} />
      ))}
      {row('globalGameNamePosition', (
        <PositionField labelKey='game_name_position_label' value={settings.globalGameNamePosition ?? null} t={t} perShelfLabel={t('per_shelf_option' as any)} onPerShelf={() => (actions as any).setGlobalGameNamePosition(null)} onChange={(v: HorizontalPosition) => (actions as any).setGlobalGameNamePosition(v)} />
      ))}
      {row('globalPlaytimePosition', (
        <PositionField labelKey='playtime_position_label' value={settings.globalPlaytimePosition ?? null} t={t} perShelfLabel={t('per_shelf_option' as any)} onPerShelf={() => (actions as any).setGlobalPlaytimePosition(null)} onChange={(v: HorizontalPosition) => (actions as any).setGlobalPlaytimePosition(v)} />
      ))}
      {row('globalFullPageShelf', (
        <ToggleField label={t('full_page_shelves_label' as any)} checked={settings.globalFullPageShelf === true} onChange={(v: boolean) => (actions as any).setGlobalFullPageShelf(v)} />
      ))}
      <ResetGlobalVisualButton t={t} />
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
  const hiddenToggles: string[] = settings.qamHiddenToggles ?? []
  const hiddenSections: string[] = settings.qamHiddenSections ?? []
  const isHid = (k: string) => hiddenToggles.includes(k)
  const isSecHid = (id: string) => hiddenSections.includes(id)
  const setHid = (k: string, v: boolean) => (actions as any).setQamHiddenToggle(k, v)
  const setSecHid = (id: string, v: boolean) => (actions as any).setQamHiddenSection(id, v)
  const hasNonSteamBadges = isNonSteamBadgesAvailable()
  let hasCssLoader = false
  try { hasCssLoader = isCssLoaderActive() } catch {}
  let hasScreensaverSupport = false
  try { hasScreensaverSupport = isScreensaverSupportDetected() } catch {}
  let hasCloudSync = false
  try { hasCloudSync = hasCloudSyncSupport() } catch {}
  const mode: Mode = 'sidecar'
  const row = (tk: string, node: ReactNode) => (
    <HideableRow tk={tk} hidden={isHid(tk)} setHidden={(v) => setHid(tk, v)} mode={mode} t={t}>{node}</HideableRow>
  )
  const c: GCtx = { t, settings, actions, row, isSecHid, setSecHid, lightMode, hasNonSteamBadges, hasCssLoader, hasScreensaverSupport, hasCloudSync }

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
      {navigationSection(c)}
      {onlineSection(c)}
      {experimentalSection(c)}
      {smartSection(c)}
      {visualGlobalSection(c)}
      {savedFiltersSections(c)}
    </div>
  )
}
