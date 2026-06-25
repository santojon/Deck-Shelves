import { useMemo, type MutableRefObject } from 'react'
import { DialogButton, Dropdown, Field, Focusable, ToggleField } from '../../../../runtime/host/decky'
import { FieldContainer , DSSliderField} from '../../../ui'

// eslint-disable-next-line complexity
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
  flags: { matchNativeSize: boolean; highlightFirst: boolean; highlightAll: boolean; highlightRandom: boolean; enableLogo: boolean; enableIcon: boolean; enableDescription: boolean; descriptionBelowLogo: boolean; logoPosition: 'left' | 'center' | 'right'; descriptionPosition: 'left' | 'center' | 'right'; logoSize: number; logoTopOffset: number; iconVerticalAlign: 'top' | 'center' | 'bottom'; shelfTitlePosition: 'left' | 'center' | 'right'; gameNamePosition: 'left' | 'center' | 'right'; playtimePosition: 'left' | 'center' | 'right'; descriptionHeight: number; descriptionLogoGap: number; fullPageShelf: boolean; heroEnabled: boolean; gameInfoAbove: boolean };
  setFlags: (patch: Partial<{ matchNativeSize: boolean; highlightFirst: boolean; highlightAll: boolean; highlightRandom: boolean; enableLogo: boolean; enableIcon: boolean; enableDescription: boolean; descriptionBelowLogo: boolean; logoPosition: 'left' | 'center' | 'right'; descriptionPosition: 'left' | 'center' | 'right'; logoSize: number; logoTopOffset: number; iconVerticalAlign: 'top' | 'center' | 'bottom'; shelfTitlePosition: 'left' | 'center' | 'right'; gameNamePosition: 'left' | 'center' | 'right'; playtimePosition: 'left' | 'center' | 'right'; descriptionHeight: number; descriptionLogoGap: number; fullPageShelf: boolean; heroEnabled: boolean; gameInfoAbove: boolean }>) => void;
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
  const GroupDivider = () => (
    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 12px' }} aria-hidden="true" />
  )
  // Reusable position-only dropdown — every left/center/right field reuses
  // the same option set + handler shape.
  const PositionDropdown = (props: { labelKey: string; value: 'left' | 'center' | 'right'; onChange: (v: 'left' | 'center' | 'right') => void }) => (
    <Field label={t(props.labelKey as any)} childrenContainerWidth='min'>
      <Dropdown
        rgOptions={[
          { data: 'left', label: t('logo_position_left' as any) },
          { data: 'center', label: t('logo_position_center' as any) },
          { data: 'right', label: t('logo_position_right' as any) },
        ]}
        selectedOption={props.value}
        onChange={(opt: any) => props.onChange((opt?.data ?? 'left') as 'left' | 'center' | 'right')}
      />
    </Field>
  )
  return (
    <FieldContainer scrollable>
      <ToggleField label={t('match_native_size')} checked={flags.matchNativeSize} onChange={(v: boolean) => setFlags({ matchNativeSize: v })} />
      <ToggleField label={t('highlight_first')} checked={flags.highlightFirst} onChange={(v: boolean) => setFlags({ highlightFirst: v })} />
      <ToggleField label={t('highlight_all')} checked={flags.highlightAll} onChange={(v: boolean) => setFlags({ highlightAll: v })} />
      <ToggleField label={t('highlight_random')} checked={flags.highlightRandom} onChange={(v: boolean) => setFlags({ highlightRandom: v })} />
      <ToggleField label={t('hero_enabled_label')} checked={flags.heroEnabled} onChange={(v: boolean) => setFlags({ heroEnabled: v })} />
      <ToggleField label={t('game_info_above_label' as any)} checked={flags.gameInfoAbove} onChange={(v: boolean) => setFlags({ gameInfoAbove: v })} />
      <GroupDivider />
      {/* Group: Logo + dependent options (position, size, offset) */}
      <ToggleField label={t('enable_logo')} checked={flags.enableLogo} onChange={(v: boolean) => setFlags({ enableLogo: v })} />
      {flags.enableLogo && (
        <PositionDropdown labelKey='logo_position_label' value={flags.logoPosition} onChange={(v) => setFlags({ logoPosition: v })} />
      )}
      {flags.enableLogo && (
        <DSSliderField label={t('logo_size_label' as any)} value={flags.logoSize} min={50} max={200} step={5} unit='%' onChange={(v: number) => setFlags({ logoSize: v })} />
      )}
      {flags.enableLogo && (
        <DSSliderField label={t('logo_top_offset_label' as any)} value={flags.logoTopOffset} min={-50} max={100} step={5} unit='%' onChange={(v: number) => setFlags({ logoTopOffset: v })} />
      )}

      <GroupDivider />
      {/* Group: Icon + vertical align */}
      <ToggleField label={t('enable_icon')} checked={flags.enableIcon} onChange={(v: boolean) => setFlags({ enableIcon: v })} />
      {flags.enableIcon && (
        <Field label={t('icon_vertical_align_label' as any)} childrenContainerWidth='min'>
          <Dropdown
            rgOptions={[
              { data: 'top', label: t('icon_vertical_align_top' as any) },
              { data: 'center', label: t('icon_vertical_align_center' as any) },
              { data: 'bottom', label: t('icon_vertical_align_bottom' as any) },
            ]}
            selectedOption={flags.iconVerticalAlign}
            onChange={(opt: any) => setFlags({ iconVerticalAlign: (opt?.data ?? 'top') as 'top' | 'center' | 'bottom' })}
          />
        </Field>
      )}

      <GroupDivider />
      {/* Group: Description + position + (when paired with logo) below-logo + height */}
      <ToggleField label={t('enable_description')} checked={flags.enableDescription} onChange={(v: boolean) => setFlags({ enableDescription: v })} />
      {flags.enableDescription && (
        <PositionDropdown labelKey='description_position_label' value={flags.descriptionPosition} onChange={(v) => setFlags({ descriptionPosition: v })} />
      )}
      {flags.enableLogo && flags.enableDescription && (
        <ToggleField label={t('description_below_logo' as any)} checked={flags.descriptionBelowLogo} onChange={(v: boolean) => setFlags({ descriptionBelowLogo: v })} />
      )}
      {flags.enableDescription && flags.descriptionBelowLogo && (
        <>
          <DSSliderField label={t('description_height_label' as any)} value={flags.descriptionHeight} min={1} max={3} step={1} onChange={(v: number) => setFlags({ descriptionHeight: v })} />
          <DSSliderField label={t('description_logo_gap_label' as any)} value={flags.descriptionLogoGap} min={-40} max={80} step={5} unit='px' onChange={(v: number) => setFlags({ descriptionLogoGap: v })} />
        </>
      )}

      <GroupDivider />
      {/* Group: Shelf title position */}
      <PositionDropdown labelKey='shelf_title_position_label' value={flags.shelfTitlePosition} onChange={(v) => setFlags({ shelfTitlePosition: v })} />

      {/* Group: Game name position */}
      <PositionDropdown labelKey='game_name_position_label' value={flags.gameNamePosition} onChange={(v) => setFlags({ gameNamePosition: v })} />

      {/* Group: Playtime row position */}
      <PositionDropdown labelKey='playtime_position_label' value={flags.playtimePosition} onChange={(v) => setFlags({ playtimePosition: v })} />

      <GroupDivider />
      {/* Penultimate before card-specific highlights */}
      <ToggleField label={t('full_page_shelf_label' as any)} checked={flags.fullPageShelf} onChange={(v: boolean) => setFlags({ fullPageShelf: v })} />
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
