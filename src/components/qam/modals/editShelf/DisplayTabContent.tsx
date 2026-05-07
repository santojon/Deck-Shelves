import { ToggleField } from '@decky/ui'
import { FieldContainer } from '../../../ui'
import { HighlightRow } from './HighlightRow'
import { HighlightMiniCard } from './HighlightMiniCard'

/**
 * Shared Display tab body — hide toggles, dedupe-by-name toggle, and
 * hidden-games picker (mini-card row, same pattern as highlight picker).
 * Non-steam toggle only rendered when the Non-Steam Badges plugin is installed.
 */
export function DisplayTabContent({
  t,
  display,
  setDisplay,
  hasNonSteamBadges,
  dedupeByExactName,
  setDedupeByExactName,
  hiddenAppIds,
  setHiddenAppIds,
  hiddenPickerOpen,
  setHiddenPickerOpen,
  hiddenCandidateIds,
  hiddenCandidateMeta,
  highlightedAppIds = [],
  highlightFirst = false,
  highlightAll = false,
}: {
  t: (k: any, opts?: any) => string;
  display: { hideStatusLine: boolean; hideNewBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean; hideGameNames: boolean; hideInstallIndicator: boolean; hideSeeMore: boolean; hideRefreshCard: boolean };
  setDisplay: (patch: Partial<{ hideStatusLine: boolean; hideNewBadge: boolean; hideCompatIcons: boolean; hideNonSteamBadge: boolean; hideShelfTitle: boolean; hideGameNames: boolean; hideInstallIndicator: boolean; hideSeeMore: boolean; hideRefreshCard: boolean }>) => void;
  hasNonSteamBadges: boolean;
  dedupeByExactName: boolean;
  setDedupeByExactName: (v: boolean) => void;
  hiddenAppIds: number[];
  setHiddenAppIds: (next: number[]) => void;
  hiddenPickerOpen: boolean;
  setHiddenPickerOpen: (v: boolean) => void;
  hiddenCandidateIds: number[];
  hiddenCandidateMeta: Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>;
  highlightedAppIds?: number[];
  highlightFirst?: boolean;
  highlightAll?: boolean;
}) {
  return (
    <FieldContainer scrollable>
      <ToggleField label={t('hide_shelf_title')} checked={display.hideShelfTitle} onChange={(v: boolean) => setDisplay({ hideShelfTitle: v })} />
      <ToggleField label={t('hide_game_name')} checked={display.hideGameNames} onChange={(v: boolean) => setDisplay({ hideGameNames: v })} />
      <ToggleField label={t('hide_status_line')} checked={display.hideStatusLine} onChange={(v: boolean) => setDisplay({ hideStatusLine: v })} />
      <ToggleField label={t('hide_install_indicator')} checked={display.hideInstallIndicator} onChange={(v: boolean) => setDisplay({ hideInstallIndicator: v })} />
      <ToggleField label={t('hide_new_badge')} checked={display.hideNewBadge} onChange={(v: boolean) => setDisplay({ hideNewBadge: v })} />
      <ToggleField label={t('hide_compat_icons')} checked={display.hideCompatIcons} onChange={(v: boolean) => setDisplay({ hideCompatIcons: v })} />
      {hasNonSteamBadges && (
        <ToggleField label={t('hide_non_steam_badge')} checked={display.hideNonSteamBadge} onChange={(v: boolean) => setDisplay({ hideNonSteamBadge: v })} />
      )}
      <ToggleField label={t('hide_see_more_card')} checked={display.hideSeeMore} onChange={(v: boolean) => setDisplay({ hideSeeMore: v })} />
      <ToggleField label={t('hide_refresh_card')} checked={display.hideRefreshCard} onChange={(v: boolean) => setDisplay({ hideRefreshCard: v })} />
      <ToggleField
        label={t('edit_dedupe_by_name' as any)}
        checked={dedupeByExactName}
        onChange={setDedupeByExactName}
      />
      <ToggleField
        label={t('edit_hidden_games' as any)}
        checked={hiddenPickerOpen}
        onChange={(v: boolean) => {
          setHiddenPickerOpen(v)
          if (!v) setHiddenAppIds([])
        }}
      />
      {hiddenPickerOpen && (
        hiddenCandidateIds.length === 0
          ? <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
          : <HighlightRow>
              {hiddenCandidateIds.map((id, idx) => {
                const selected = hiddenAppIds.includes(id)
                const inHighlighted = highlightedAppIds.includes(id)
                const featured = highlightAll || (highlightFirst && idx === 0) || inHighlighted
                const meta = hiddenCandidateMeta.get(id)
                return (
                  <HighlightMiniCard
                    key={id}
                    appid={id}
                    name={meta?.name ?? `App ${id}`}
                    portraitUrl={meta?.portraitUrl}
                    heroUrl={meta?.heroUrl}
                    featured={featured}
                    selected={selected}
                    width={featured ? 210 : 68}
                    height={100}
                    onToggle={() => setHiddenAppIds(
                      selected
                        ? hiddenAppIds.filter((x) => x !== id)
                        : [...hiddenAppIds, id]
                    )}
                  />
                )
              })}
            </HighlightRow>
      )}
    </FieldContainer>
  )
}
