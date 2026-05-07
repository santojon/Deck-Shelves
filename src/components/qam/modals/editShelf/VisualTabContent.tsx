import { useMemo, type MutableRefObject } from 'react'
import { DialogButton, Focusable, ToggleField } from '@decky/ui'
import { FieldContainer } from '../../../ui'

/**
 * Shared Visual tab body rendered by both `EditShelfModal` and
 * `EditSmartShelfModal`. Encapsulates:
 * - match-native-size, highlight-first, highlight-all toggles
 * - the "highlight specific games" picker
 * - odd/even alternating pattern buttons (appear when picker is open)
 * - the preview row with featured/selected card rendering
 *
 * State is owned by the parent modal — this component reads through props
 * and calls back via setters. `effectiveManualOrder` drives the odd/even
 * pattern generator and the preview order, already reflecting `manualOrder`.
 */
export function VisualTabContent({
  t,
  flags,
  setFlags,
  highlightedAppIds,
  setHighlightedAppIds,
  highlightPickerOpen,
  setHighlightPickerOpen,
  alternatingMode,
  setAlternatingMode,
  prePatternHighlightsRef,
  effectiveManualOrder,
}: {
  t: (k: any, opts?: any) => string;
  flags: { matchNativeSize: boolean; highlightFirst: boolean; highlightAll: boolean };
  setFlags: (patch: Partial<{ matchNativeSize: boolean; highlightFirst: boolean; highlightAll: boolean }>) => void;
  highlightedAppIds: number[];
  setHighlightedAppIds: (next: number[]) => void;
  highlightPickerOpen: boolean;
  setHighlightPickerOpen: (v: boolean) => void;
  alternatingMode: 'odd' | 'even' | null;
  setAlternatingMode: (m: 'odd' | 'even' | null) => void;
  prePatternHighlightsRef: MutableRefObject<number[] | null>;
  effectiveManualOrder: number[];
}) {
  const cards = useMemo(() => effectiveManualOrder, [effectiveManualOrder])
  return (
    <FieldContainer scrollable>
      <ToggleField label={t('match_native_size')} checked={flags.matchNativeSize} onChange={(v: boolean) => setFlags({ matchNativeSize: v })} />
      <ToggleField label={t('highlight_first')} checked={flags.highlightFirst} onChange={(v: boolean) => setFlags({ highlightFirst: v })} />
      <ToggleField label={t('highlight_all')} checked={flags.highlightAll} onChange={(v: boolean) => setFlags({ highlightAll: v })} />
      <ToggleField
        label={t('highlight_specific_games')}
        checked={highlightPickerOpen}
        onChange={(v: boolean) => {
          setHighlightPickerOpen(v)
          if (!v) setAlternatingMode(null)
        }}
      />
      {highlightPickerOpen && (
        <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '0 -24px', padding: '4px 24px', width: 'auto', boxSizing: 'border-box' }}>
          {(['odd', 'even'] as const).map((mode) => {
            const checked = alternatingMode === mode
            const labelKey = mode === 'odd' ? 'highlight_pattern_odd_even' : 'highlight_pattern_even_odd'
            const apply = () => {
              if (alternatingMode === mode) {
                const restore = prePatternHighlightsRef.current ?? []
                prePatternHighlightsRef.current = null
                setAlternatingMode(null)
                setHighlightedAppIds(restore)
                return
              }
              if (alternatingMode === null) {
                prePatternHighlightsRef.current = highlightedAppIds.slice()
              }
              setAlternatingMode(mode)
              const startIdx = mode === 'odd' ? 0 : 1
              const picks: number[] = []
              for (let i = startIdx; i < cards.length; i += 2) picks.push(cards[i])
              setHighlightedAppIds(picks)
            }
            return (
              <DialogButton
                key={mode}
                onClick={apply}
                onOKButton={apply}
                style={{ width: '100%', minHeight: 44, padding: '8px 6px', fontSize: 13, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 14, textAlign: 'center', flexShrink: 0, color: checked ? '#4caf50' : 'rgba(255,255,255,0.3)' }}>{checked ? '✓' : '·'}</span>
                  <span>{t(labelKey as any)}</span>
                </span>
              </DialogButton>
            )
          })}
        </Focusable>
      )}
    </FieldContainer>
  )
}
