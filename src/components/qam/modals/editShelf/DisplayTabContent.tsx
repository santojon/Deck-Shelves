import { DropdownItem, ToggleField } from '../../../../runtime/host/decky'
import type { DiscountBadgeMode } from '../../../shelf/discountBadge'

export function discountBadgeModeOptions(t: (...args: any[]) => any): { data: DiscountBadgeMode; label: string }[] {
  return [
    { data: 'percent', label: t('discount_badge_percent') },
    { data: 'price', label: t('discount_badge_price') },
    { data: 'both', label: t('discount_badge_both') },
    { data: 'percent_price', label: t('discount_badge_percent_price') },
  ]
}
import { FieldContainer } from '../../../ui'

export function DisplayTabContent({
  t,
  display,
  setDisplay,
  hasNonSteamBadges,
  discountBadgeMode,
  setDiscountBadgeMode,
  discountBadgeFocusMode,
  setDiscountBadgeFocusMode,
  dedupeByExactName,
  setDedupeByExactName,
  setHiddenAppIds,
  hiddenPickerOpen,
  setHiddenPickerOpen,
}: {
  t: (...args: any[]) => any;
  display: { hideStatusLine: boolean; hideNewBadge: boolean; hideDiscountBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean; hideGameNames: boolean; hideInstallIndicator: boolean; hideSeeMore: boolean; hideRefreshCard: boolean };
  setDisplay: (patch: Partial<{ hideStatusLine: boolean; hideNewBadge: boolean; hideDiscountBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean; hideGameNames: boolean; hideInstallIndicator: boolean; hideSeeMore: boolean; hideRefreshCard: boolean }>) => void;
  hasNonSteamBadges: boolean;
  discountBadgeMode?: DiscountBadgeMode;
  setDiscountBadgeMode?: (v: DiscountBadgeMode) => void;
  discountBadgeFocusMode?: DiscountBadgeMode | null;
  setDiscountBadgeFocusMode?: (v: DiscountBadgeMode | null) => void;
  dedupeByExactName: boolean;
  setDedupeByExactName: (v: boolean) => void;
  setHiddenAppIds: (next: number[]) => void;
  hiddenPickerOpen: boolean;
  setHiddenPickerOpen: (v: boolean) => void;
}) {
  return (
    <FieldContainer scrollable>
      <ToggleField label={t('hide_shelf_title')} checked={display.hideShelfTitle} onChange={(v: boolean) => setDisplay({ hideShelfTitle: v })} />
      <ToggleField label={t('hide_new_badge')} checked={display.hideNewBadge} onChange={(v: boolean) => setDisplay({ hideNewBadge: v })} />
      <ToggleField label={t('hide_discount_badge')} checked={display.hideDiscountBadge} onChange={(v: boolean) => setDisplay({ hideDiscountBadge: v })} />
      {setDiscountBadgeMode && !display.hideDiscountBadge && (
        <>
          <DropdownItem
            label={t('discount_badge_mode')}
            rgOptions={discountBadgeModeOptions(t)}
            selectedOption={discountBadgeMode ?? 'percent'}
            onChange={(opt: any) => setDiscountBadgeMode((opt?.data ?? opt) as DiscountBadgeMode)}
          />
          <DropdownItem
            label={t('discount_badge_focus_mode')}
            rgOptions={[{ data: 'same', label: t('discount_badge_focus_same') }, ...discountBadgeModeOptions(t)]}
            selectedOption={discountBadgeFocusMode ?? 'same'}
            onChange={(opt: any) => { const v = opt?.data ?? opt; setDiscountBadgeFocusMode?.(v === 'same' ? null : v as DiscountBadgeMode) }}
          />
        </>
      )}
      <ToggleField label={t('hide_game_name')} checked={display.hideGameNames} onChange={(v: boolean) => setDisplay({ hideGameNames: v })} />
      <ToggleField label={t('hide_compat_icons')} checked={display.hideCompatIcons} onChange={(v: boolean) => setDisplay({ hideCompatIcons: v })} />
      <ToggleField label={t('hide_status_line')} checked={display.hideStatusLine} onChange={(v: boolean) => setDisplay({ hideStatusLine: v })} />
      <ToggleField label={t('hide_see_more_card')} checked={display.hideSeeMore} onChange={(v: boolean) => setDisplay({ hideSeeMore: v })} />
      <ToggleField label={t('hide_install_indicator')} checked={display.hideInstallIndicator} onChange={(v: boolean) => setDisplay({ hideInstallIndicator: v })} />
      <ToggleField label={t('hide_refresh_card')} checked={display.hideRefreshCard} onChange={(v: boolean) => setDisplay({ hideRefreshCard: v })} />
      <ToggleField label={t('edit_dedupe_by_name' as any)} checked={dedupeByExactName} onChange={setDedupeByExactName} />
      {hasNonSteamBadges && (
        <ToggleField label={t('hide_non_steam_badge')} checked={display.hideNonSteamBadge} onChange={(v: boolean) => setDisplay({ hideNonSteamBadge: v })} />
      )}
      <ToggleField
        label={t('edit_hidden_games' as any)}
        checked={hiddenPickerOpen}
        onChange={(v: boolean) => { setHiddenPickerOpen(v); if (!v) setHiddenAppIds([]) }}
      />
    </FieldContainer>
  )
}
