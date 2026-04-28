import { ToggleField } from '@decky/ui'
import { FieldContainer } from '../../../ui'

/**
 * Shared Display tab body — the hide toggles for status line, new badge,
 * compat icons and non-steam badge. Non-steam toggle is only rendered when
 * the Non-Steam Badges plugin is installed.
 */
export function DisplayTabContent({
  t,
  display,
  setDisplay,
  hasNonSteamBadges,
}: {
  t: (k: any, opts?: any) => string;
  display: { hideStatusLine: boolean; hideNewBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean };
  setDisplay: (patch: Partial<{ hideStatusLine: boolean; hideNewBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean }>) => void;
  hasNonSteamBadges: boolean;
}) {
  return (
    <FieldContainer>
      <ToggleField label={t('hide_shelf_title')} checked={display.hideShelfTitle} onChange={(v: boolean) => setDisplay({ hideShelfTitle: v })} />
      <ToggleField label={t('hide_status_line')} checked={display.hideStatusLine} onChange={(v: boolean) => setDisplay({ hideStatusLine: v })} />
      <ToggleField label={t('hide_new_badge')} checked={display.hideNewBadge} onChange={(v: boolean) => setDisplay({ hideNewBadge: v })} />
      <ToggleField label={t('hide_compat_icons')} checked={display.hideCompatIcons} onChange={(v: boolean) => setDisplay({ hideCompatIcons: v })} />
      {hasNonSteamBadges && (
        <ToggleField label={t('hide_non_steam_badge')} checked={display.hideNonSteamBadge} onChange={(v: boolean) => setDisplay({ hideNonSteamBadge: v })} />
      )}
    </FieldContainer>
  )
}
