import { ToggleField, Field, Dropdown } from '../../../runtime/host/decky';
import { CollapsibleSection, DSSliderField, PositionField, type HorizontalPosition } from '../../ui';
import { WandIcon } from '../../icons';
import { applyGameInfoAboveToggle, applyHideTitleToggle } from '../common/gameInfoCoupling';
import type { SettingsController } from '../../../features/settings/controller';

/* Global visual defaults section, extracted from DeckQAMSettings to keep that
   file under the code-line cap. Renders the same toggles as before; the inner
   IIFE groups keep each render arm under the complexity cap. */
export function VisualGlobalSection({ controller, hidden, isHid, lightMode, mountCrashed, hasNonSteamBadges }: {
  controller: SettingsController;
  hidden: boolean;
  isHid: (key: string) => boolean;
  lightMode: boolean;
  mountCrashed: boolean;
  hasNonSteamBadges: boolean;
}) {
  const { t, settings, actions } = controller;
  if (!settings || !settings.enabled || hidden) return null;
  return (
      <CollapsibleSection
        id='visual_global'
        icon={<WandIcon />}
        title={t('section_visual_global')}
        count={[settings.globalMatchNativeSize, settings.globalHighlightFirst, settings.globalHighlightAll, (settings as any).globalHighlightRandom, (settings as any).globalEnableLogo, (settings as any).globalEnableIcon, (settings as any).globalEnableDescription, ((settings as any).globalDescriptionScale ?? 100) > 100, (settings as any).globalDescriptionBelowLogo, (settings as any).globalHeroEnabled, (settings as any).globalGameInfoAbove, (settings as any).globalFriendsPlayingOverlay, (settings as any).globalFriendsPlayingOverlayRecent, (settings as any).globalFullPageShelf, settings.globalHideShelfTitle, settings.globalHideGameNames, settings.globalHideStatusLine, settings.globalHideInstallIndicator, settings.globalHideNewBadge, (settings as any).globalHideDiscountBadge, settings.globalHideCompatIcons, settings.globalHideNonSteamBadge, settings.globalHideSeeMore, settings.globalHideRefreshCard, (settings as any).globalDedupeByName].filter(Boolean).length}
      >
        {(() => (<>
        {!isHid('globalMatchNativeSize') && <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalMatchNativeSize(value)} />}
        {!isHid('globalHighlightFirst') && <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightFirst(value)} />}
        {!isHid('globalHighlightAll') && <ToggleField label={t('highlight_all')} checked={settings.globalHighlightAll === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightAll(value)} />}
        {!isHid('globalHighlightRandom') && <ToggleField label={t('highlight_random')} checked={(settings as any).globalHighlightRandom === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalHighlightRandom(value)} />}
        </>))()}
        {/* Decorations are stripped on the home in light mode — hide here too. */}
        {(() => {
          if (lightMode) return null;
          return (<>
        {(() => (<>
        {!isHid('globalEnableLogo') && <ToggleField label={t('enable_logo')} checked={(settings as any).globalEnableLogo === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalEnableLogo(value)} />}
        {(settings as any).globalEnableLogo === true && !isHid('globalLogoPosition') && (
          <PositionField labelKey='logo_position_label' value={(settings as any).globalLogoPosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalLogoPosition(v)} />
        )}
        </>))()}
        {(() => (<>
        {(settings as any).globalEnableLogo === true && !isHid('globalLogoSize') && (
          <DSSliderField label={t('logo_size_label' as any)} value={(settings as any).globalLogoSize ?? 100} min={50} max={200} step={5} unit='%' onChange={(v: number) => (actions as any).setGlobalLogoSize(v)} />
        )}
        {(settings as any).globalEnableLogo === true && !isHid('globalLogoTopOffset') && (
          <DSSliderField label={t('logo_top_offset_label' as any)} value={(settings as any).globalLogoTopOffset ?? 20} min={-50} max={100} step={5} unit='%' onChange={(v: number) => (actions as any).setGlobalLogoTopOffset(v)} />
        )}
        </>))()}

        {/* Group: Icon + vertical align */}
        {(() => (<>
        {!isHid('globalEnableIcon') && <ToggleField label={t('enable_icon')} checked={(settings as any).globalEnableIcon === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalEnableIcon(value)} />}
        {(settings as any).globalEnableIcon === true && !isHid('globalIconVerticalAlign') && (
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
        )}
        </>))()}

        {/* Group: Description + position + (paired) below-logo + height */}
        {(() => (<>
        {!isHid('globalEnableDescription') && <ToggleField label={t('enable_description')} checked={(settings as any).globalEnableDescription === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalEnableDescription(value)} />}
        {(settings as any).globalEnableDescription === true && !isHid('globalDescriptionScale') && <DSSliderField label={t('description_size_label')} value={(settings as any).globalDescriptionScale ?? 100} min={100} max={200} step={10} unit='%' onChange={(v: number) => (actions as any).setGlobalDescriptionScale(v)} />}
        {(settings as any).globalEnableDescription === true && !isHid('globalDescriptionPosition') && (
          <PositionField labelKey='description_position_label' value={(settings as any).globalDescriptionPosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalDescriptionPosition(v)} />
        )}
        </>))()}
        {(() => (<>
        {(settings as any).globalEnableLogo === true && (settings as any).globalEnableDescription === true && !isHid('globalDescriptionBelowLogo') && <ToggleField label={t('description_below_logo' as any)} checked={(settings as any).globalDescriptionBelowLogo === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalDescriptionBelowLogo(value)} />}
        {(settings as any).globalEnableLogo === true && !isHid('globalLogoBelowShelf') && (
          <ToggleField label={t('logo_below_shelf_label' as any)} checked={(settings as any).globalLogoBelowShelf === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalLogoBelowShelf(value)} />
        )}
        </>))()}
        {(() => (<>
        {(settings as any).globalEnableDescription === true && (settings as any).globalDescriptionBelowLogo === true && !isHid('globalDescriptionHeight') && (
          <DSSliderField label={t('description_height_label' as any)} value={(settings as any).globalDescriptionHeight ?? 2} min={1} max={3} step={1} onChange={(v: number) => (actions as any).setGlobalDescriptionHeight(v)} />
        )}
        {(settings as any).globalEnableDescription === true && (settings as any).globalDescriptionBelowLogo === true && !isHid('globalDescriptionLogoGap') && (
          <DSSliderField label={t('description_logo_gap_label' as any)} value={(settings as any).globalDescriptionLogoGap ?? 8} min={-40} max={80} step={5} unit='px' onChange={(v: number) => (actions as any).setGlobalDescriptionLogoGap(v)} />
        )}
        </>))()}
          </>);
        })()}

        {(() => (<>
        {!isHid('globalShelfTitlePosition') && (
          <PositionField labelKey='shelf_title_position_label' value={(settings as any).globalShelfTitlePosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalShelfTitlePosition(v)} />
        )}
        {!isHid('globalGameNamePosition') && (
          <PositionField labelKey='game_name_position_label' value={(settings as any).globalGameNamePosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalGameNamePosition(v)} />
        )}
        {!isHid('globalPlaytimePosition') && (
          <PositionField labelKey='playtime_position_label' value={(settings as any).globalPlaytimePosition ?? 'left'} t={t} onChange={(v: HorizontalPosition) => (actions as any).setGlobalPlaytimePosition(v)} />
        )}
        </>))()}
        {(() => (<>
        {!isHid('globalHideShelfTitle') && <ToggleField label={t('hide_shelf_titles')} checked={settings.globalHideShelfTitle === true} disabled={mountCrashed} onChange={(value: boolean) => applyHideTitleToggle({ next: value, infoAbove: (settings as any).globalGameInfoAbove === true, t, setHideTitle: (v) => void actions.setGlobalHideShelfTitle(v), setGameInfoAbove: (v) => void (actions as any).setGlobalGameInfoAbove(v) })} />}
        {!isHid('globalHideGameNames') && <ToggleField label={t('hide_game_names')} checked={settings.globalHideGameNames === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideGameNames(value)} />}
        {!isHid('globalHideStatusLine') && <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideStatusLine(value)} />}
        {!isHid('globalHideInstallIndicator') && <ToggleField label={t('hide_install_indicators')} checked={settings.globalHideInstallIndicator === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideInstallIndicator(value)} />}
        {!isHid('globalHideNewBadge') && <ToggleField label={t('hide_new_badge')} checked={settings.globalHideNewBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideNewBadge(value)} />}
        {!isHid('globalHideDiscountBadge') && <ToggleField label={t('hide_discount_badge')} checked={(settings as any).globalHideDiscountBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideDiscountBadge(value)} />}
        </>))()}
        {(() => (<>
        {!isHid('globalHideCompatIcons') && <ToggleField label={t('hide_compat_icons')} checked={settings.globalHideCompatIcons === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideCompatIcons(value)} />}
        {hasNonSteamBadges && !isHid('globalHideNonSteamBadge') && (
          <ToggleField label={t('hide_non_steam_badge')} checked={settings.globalHideNonSteamBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideNonSteamBadge(value)} />
        )}
        {!isHid('globalHideSeeMore') && <ToggleField label={t('hide_see_more_card')} checked={settings.globalHideSeeMore === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideSeeMore(value)} />}
        {!isHid('globalHideRefreshCard') && <ToggleField label={t('hide_refresh_card')} checked={settings.globalHideRefreshCard === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideRefreshCard(value)} />}
        {!isHid('globalDedupeByName') && <ToggleField label={t('global_dedupe_by_name' as any)} checked={(settings as any).globalDedupeByName === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalDedupeByName(value)} />}
        </>))()}
        {(() => (<>
        {!lightMode && !isHid('globalHeroEnabled') && <ToggleField label={t('global_hero_enabled' as any)} checked={(settings as any).globalHeroEnabled === true} disabled={mountCrashed} onChange={(value: boolean) => void (actions as any).setGlobalHeroEnabled(value)} />}
        {!isHid('globalGameInfoAbove') && <ToggleField label={t('global_game_info_above' as any)} checked={(settings as any).globalGameInfoAbove === true} disabled={mountCrashed} onChange={(value: boolean) => applyGameInfoAboveToggle({ next: value, hideTitle: settings.globalHideShelfTitle === true, t, setGameInfoAbove: (v) => void (actions as any).setGlobalGameInfoAbove(v), setHideTitle: (v) => void actions.setGlobalHideShelfTitle(v) })} />}
        {!isHid('globalFriendsPlayingOverlay') && <ToggleField label={t('friends_overlay_label' as any)} checked={(settings as any).globalFriendsPlayingOverlay === true} disabled={mountCrashed} onChange={(value: boolean) => void (actions as any).setGlobalFriendsPlayingOverlay(value)} />}
        {!isHid('globalFriendsPlayingOverlay') && (settings as any).globalFriendsPlayingOverlay === true && <div style={{ paddingLeft: 14 }}><ToggleField label={t('friends_overlay_recent_label' as any)} checked={(settings as any).globalFriendsPlayingOverlayRecent === true} disabled={mountCrashed} onChange={(value: boolean) => void (actions as any).setGlobalFriendsPlayingOverlayRecent(value)} /></div>}
        {!isHid('globalFullPageShelf') && <ToggleField label={t('full_page_shelves_label' as any)} checked={(settings as any).globalFullPageShelf === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalFullPageShelf(value)} />}
        </>))()}
      </CollapsibleSection>
  );
}
