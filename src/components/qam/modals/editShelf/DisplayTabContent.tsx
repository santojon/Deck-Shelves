import { useRef } from 'react'
import { ToggleField, Focusable } from '@decky/ui'
import { FieldContainer } from '../../../ui'
import { DIR_UP, DIR_DOWN } from '../../../home/navPatches/constants'

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
  // Navigation strategy:
  // - DOM order is interleaved (L0, R0, L1, R1…) so Steam's DOM-order nav maps
  //   LEFT/RIGHT to the adjacent column item in the same row.
  // - UP/DOWN are intercepted via onGamepadDirection on each cell wrapper to
  //   jump ±2 DOM positions (same column, adjacent row) instead of ±1.
  //   When no target exists (top/bottom of column) we skip preventDefault so
  //   Steam's default navigation carries focus out of the grid naturally.
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const reg = (key: string) => (el: HTMLDivElement | null) => {
    if (el) cellRefs.current.set(key, el)
    else cellRefs.current.delete(key)
  }

  const focusCell = (key: string): boolean => {
    const cell = cellRefs.current.get(key)
    if (!cell) return false
    const inner = cell.querySelector<HTMLElement>('[tabindex="0"], button') ?? cell
    inner.focus()
    return true
  }

  // col: 0=left 1=right; row: 0-indexed
  const onDir = (col: 0 | 1, row: number) => (evt: any) => {
    const btn = evt.detail?.button
    if (btn === DIR_UP) {
      if (row > 0 && focusCell(`${col}:${row - 1}`)) evt.preventDefault()
    } else if (btn === DIR_DOWN) {
      if (focusCell(`${col}:${row + 1}`)) evt.preventDefault()
    }
  }

  // Cell style: provides the padding context that ToggleField's margin:0 -42px expects.
  // gridColumn forces each item into its visual column regardless of DOM position.
  const cell = (col: 0 | 1): React.CSSProperties => ({
    padding: '0 42px',
    overflow: 'hidden',
    gridColumn: col + 1,
  })

  return (
    <FieldContainer scrollable>
      {/* margin: 0 -42px cancels FieldContainer's padding so the grid spans full width */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '0 -42px' }}>

        {/* Row 0 */}
        <Focusable onGamepadDirection={onDir(0, 0)} style={cell(0)}>
          <div ref={reg('0:0')}><ToggleField label={t('hide_shelf_title')} checked={display.hideShelfTitle} onChange={(v: boolean) => setDisplay({ hideShelfTitle: v })} /></div>
        </Focusable>
        <Focusable onGamepadDirection={onDir(1, 0)} style={cell(1)}>
          <div ref={reg('1:0')}><ToggleField label={t('hide_new_badge')} checked={display.hideNewBadge} onChange={(v: boolean) => setDisplay({ hideNewBadge: v })} /></div>
        </Focusable>

        {/* Row 1 */}
        <Focusable onGamepadDirection={onDir(0, 1)} style={cell(0)}>
          <div ref={reg('0:1')}><ToggleField label={t('hide_game_name')} checked={display.hideGameNames} onChange={(v: boolean) => setDisplay({ hideGameNames: v })} /></div>
        </Focusable>
        <Focusable onGamepadDirection={onDir(1, 1)} style={cell(1)}>
          <div ref={reg('1:1')}><ToggleField label={t('hide_compat_icons')} checked={display.hideCompatIcons} onChange={(v: boolean) => setDisplay({ hideCompatIcons: v })} /></div>
        </Focusable>

        {/* Row 2 */}
        <Focusable onGamepadDirection={onDir(0, 2)} style={cell(0)}>
          <div ref={reg('0:2')}><ToggleField label={t('hide_status_line')} checked={display.hideStatusLine} onChange={(v: boolean) => setDisplay({ hideStatusLine: v })} /></div>
        </Focusable>
        <Focusable onGamepadDirection={onDir(1, 2)} style={cell(1)}>
          <div ref={reg('1:2')}><ToggleField label={t('hide_see_more_card')} checked={display.hideSeeMore} onChange={(v: boolean) => setDisplay({ hideSeeMore: v })} /></div>
        </Focusable>

        {/* Row 3 */}
        <Focusable onGamepadDirection={onDir(0, 3)} style={cell(0)}>
          <div ref={reg('0:3')}><ToggleField label={t('hide_install_indicator')} checked={display.hideInstallIndicator} onChange={(v: boolean) => setDisplay({ hideInstallIndicator: v })} /></div>
        </Focusable>
        <Focusable onGamepadDirection={onDir(1, 3)} style={cell(1)}>
          <div ref={reg('1:3')}><ToggleField label={t('hide_refresh_card')} checked={display.hideRefreshCard} onChange={(v: boolean) => setDisplay({ hideRefreshCard: v })} /></div>
        </Focusable>

        {/* Row 4 */}
        <Focusable onGamepadDirection={onDir(0, 4)} style={cell(0)}>
          <div ref={reg('0:4')}><ToggleField label={t('edit_dedupe_by_name' as any)} checked={dedupeByExactName} onChange={setDedupeByExactName} /></div>
        </Focusable>
        <Focusable onGamepadDirection={onDir(1, 4)} style={cell(1)}>
          <div ref={reg('1:4')}>
            <ToggleField
              label={t('edit_hidden_games' as any)}
              checked={hiddenPickerOpen}
              onChange={(v: boolean) => { setHiddenPickerOpen(v); if (!v) setHiddenAppIds([]) }}
            />
          </div>
        </Focusable>

        {/* Row 5 — conditional */}
        {hasNonSteamBadges && (
          <Focusable onGamepadDirection={onDir(1, 5)} style={cell(1)}>
            <div ref={reg('1:5')}><ToggleField label={t('hide_non_steam_badge')} checked={display.hideNonSteamBadge} onChange={(v: boolean) => setDisplay({ hideNonSteamBadge: v })} /></div>
          </Focusable>
        )}

      </div>
    </FieldContainer>
  )
}
