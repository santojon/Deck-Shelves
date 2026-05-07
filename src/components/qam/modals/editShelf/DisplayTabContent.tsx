import { ToggleField } from '@decky/ui'
import { FieldContainer } from '../../../ui'

export function DisplayTabContent({
  t,
  display,
  setDisplay,
  hasNonSteamBadges,
  dedupeByExactName,
  setDedupeByExactName,
  setHiddenAppIds,
  hiddenPickerOpen,
  setHiddenPickerOpen,
}: {
  t: (k: any, opts?: any) => string;
  display: { hideStatusLine: boolean; hideNewBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean; hideGameNames: boolean; hideInstallIndicator: boolean; hideSeeMore: boolean; hideRefreshCard: boolean };
  setDisplay: (patch: Partial<{ hideStatusLine: boolean; hideNewBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean; hideGameNames: boolean; hideInstallIndicator: boolean; hideSeeMore: boolean; hideRefreshCard: boolean }>) => void;
  hasNonSteamBadges: boolean;
  dedupeByExactName: boolean;
  setDedupeByExactName: (v: boolean) => void;
  setHiddenAppIds: (next: number[]) => void;
  hiddenPickerOpen: boolean;
  setHiddenPickerOpen: (v: boolean) => void;
}) {
  // Two separate columns — DOM order is left-column-first, right-column-second.
  // Steam's d-pad navigation is spatial: DOWN/UP stays within the nearest
  // item in the same visual column; LEFT/RIGHT jumps to the nearest item
  // in the adjacent column. Each column has padding:0 42px so ToggleField's
  // margin:0 -42px fills exactly its column width with no overflow.
  const col = { flex: 1, padding: '0 42px', overflow: 'hidden' as const }
  return (
    <FieldContainer scrollable>
      <div style={{ display: 'flex', margin: '0 -42px' }}>
        <div style={col}>
          <ToggleField label={t('hide_shelf_title')} checked={display.hideShelfTitle} onChange={(v: boolean) => setDisplay({ hideShelfTitle: v })} />
          <ToggleField label={t('hide_game_name')} checked={display.hideGameNames} onChange={(v: boolean) => setDisplay({ hideGameNames: v })} />
          <ToggleField label={t('hide_status_line')} checked={display.hideStatusLine} onChange={(v: boolean) => setDisplay({ hideStatusLine: v })} />
          <ToggleField label={t('hide_install_indicator')} checked={display.hideInstallIndicator} onChange={(v: boolean) => setDisplay({ hideInstallIndicator: v })} />
          <ToggleField label={t('edit_dedupe_by_name' as any)} checked={dedupeByExactName} onChange={setDedupeByExactName} />
        </div>
        <div style={col}>
          <ToggleField label={t('hide_new_badge')} checked={display.hideNewBadge} onChange={(v: boolean) => setDisplay({ hideNewBadge: v })} />
          <ToggleField label={t('hide_compat_icons')} checked={display.hideCompatIcons} onChange={(v: boolean) => setDisplay({ hideCompatIcons: v })} />
          {hasNonSteamBadges && (
            <ToggleField label={t('hide_non_steam_badge')} checked={display.hideNonSteamBadge} onChange={(v: boolean) => setDisplay({ hideNonSteamBadge: v })} />
          )}
          <ToggleField label={t('hide_see_more_card')} checked={display.hideSeeMore} onChange={(v: boolean) => setDisplay({ hideSeeMore: v })} />
          <ToggleField label={t('hide_refresh_card')} checked={display.hideRefreshCard} onChange={(v: boolean) => setDisplay({ hideRefreshCard: v })} />
          <ToggleField
            label={t('edit_hidden_games' as any)}
            checked={hiddenPickerOpen}
            onChange={(v: boolean) => { setHiddenPickerOpen(v); if (!v) setHiddenAppIds([]) }}
          />
        </div>
      </div>
    </FieldContainer>
  )
}
