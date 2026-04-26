import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DropdownItem,
  Field,
  Focusable,
  SliderField,
  Tabs,
  TextField,
  ToggleField,
} from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { FilterGroup, SmartShelf } from '../../../types'
import { FilterPanel } from '../../FilterPanel'
import { FieldContainer, ModalShell } from '../../ui'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds } from '../../../steam'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { SORT_OPTIONS } from './editShelf/constants'
import { optionData } from './editShelf/utils'
import { ManualSortRow } from './editShelf/ManualSortRow'
import { VisualTabContent } from './editShelf/VisualTabContent'
import { DisplayTabContent } from './editShelf/DisplayTabContent'
import { ModalHeader } from './editShelf/ModalHeader'
import { SavedFiltersBar } from './editShelf/SavedFiltersBar'
import { textFromDeckyChange } from './modalUtils'
import { SMART_PARAM_DEFAULTS, SMART_PARAM_META, paramKeysForMode } from '../../../steam/smartParams'

// Effective TTL when `refreshIntervalMinutes` is unset on a shelf — must
// match `DEFAULT_SMART_TTL_MS` in `src/steam/smartShelves.ts`. Used to
// pre-fill the edit field so users see the actual current cadence.
const DEFAULT_REFRESH_MINUTES = 60

type Tab = 'source' | 'filters' | 'visual' | 'display'

type EditState = {
  title: string
  limit: number
  sort: string
  manualBaseSort: string
  manualOrder: number[]
  filterGroup: FilterGroup
  filterEnabled: boolean
  matchNativeSize: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightedAppIds: number[]
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  refreshIntervalMinutes: number
  smartParams: Record<string, number>
}

export function EditSmartShelfModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: SmartShelf }) {
  const { t, actions } = controller
  const platform = usePlatform()
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [activeTab, setActiveTab] = useState<Tab>('source')
  const [state, setState] = useState<EditState>({
    title: shelf.title,
    limit: shelf.limit ?? 20,
    sort: (shelf as any).sort ?? '',
    manualBaseSort: (shelf as any).manualBaseSort ?? 'alphabetical',
    manualOrder: (shelf as any).manualOrder ?? [],
    filterGroup: (shelf as any).filterGroup ?? { mode: 'and', items: [] },
    filterEnabled: !!((shelf as any).filterGroup?.items?.length),
    matchNativeSize: (shelf as any).matchNativeSize ?? false,
    highlightFirst: (shelf as any).highlightFirst ?? false,
    highlightAll: (shelf as any).highlightAll ?? false,
    highlightedAppIds: (shelf as any).highlightedAppIds ?? [],
    hideStatusLine: (shelf as any).hideStatusLine ?? false,
    hideNewBadge: (shelf as any).hideNewBadge ?? false,
    hideCompatIcons: (shelf as any).hideCompatIcons ?? false,
    hideNonSteamBadge: (shelf as any).hideNonSteamBadge ?? false,
    refreshIntervalMinutes: (shelf as any).refreshIntervalMinutes ?? DEFAULT_REFRESH_MINUTES,
    smartParams: { ...(SMART_PARAM_DEFAULTS[shelf.mode] ?? {}), ...((shelf as any).smartParams ?? {}) },
  })
  // Buffered text representation of the refresh-interval field — keeps the
  // user free to clear / partially edit the input without immediately
  // collapsing it back to the default. Committed to numeric state on blur.
  const [refreshDraft, setRefreshDraft] = useState<string>(String((shelf as any).refreshIntervalMinutes ?? DEFAULT_REFRESH_MINUTES))

  const paramKeys = useMemo(() => paramKeysForMode(shelf.mode), [shelf.mode])
  const setSmartParam = (key: string, value: number) => setState((prev) => ({ ...prev, smartParams: { ...prev.smartParams, [key]: value } }))
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>>(new Map())
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf as any).highlightedAppIds?.length > 0)
  const [alternatingMode, setAlternatingMode] = useState<'odd' | 'even' | null>(null)
  const prePatternHighlightsRef = useRef<number[] | null>(null)

  const isManual = state.sort === 'manual'
  const effectiveManualOrder = useMemo(() => {
    if (!isManual) return resolvedIds
    const idSet = new Set(resolvedIds)
    const out: number[] = []
    for (const id of state.manualOrder) if (idSet.has(id) && !out.includes(id)) out.push(id)
    for (const id of resolvedIds) if (!out.includes(id)) out.push(id)
    return out
  }, [isManual, resolvedIds, state.manualOrder])
  const reorderManual = (nextOrder: number[]) => setState((prev) => ({ ...prev, manualOrder: nextOrder }))

  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => [
      { data: '', label: t('smart_sort_default') },
      ...SORT_OPTIONS.map((item) => ({ data: item.value, label: t(item.labelKey) })),
    ],
    [t],
  )
  const baseSortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.filter((item) => item.value !== 'manual').map((item) => ({ data: item.value, label: t(item.labelKey) })),
    [t],
  )

  const smartParamsKey = JSON.stringify(state.smartParams)
  const previewSource = useMemo(() => {
    const base: any = { type: 'smart' as const, mode: shelf.mode }
    if (state.filterEnabled && state.filterGroup.items.length > 0) base.filterGroup = state.filterGroup
    if (paramKeys.length) base.smartParams = state.smartParams
    if (state.refreshIntervalMinutes > 0 && state.refreshIntervalMinutes !== DEFAULT_REFRESH_MINUTES) {
      base.refreshIntervalMinutes = state.refreshIntervalMinutes
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf.mode, state.filterEnabled, state.filterGroup, smartParamsKey, state.refreshIntervalMinutes, paramKeys.length])

  useEffect(() => {
    let cancelled = false
    setPreviewCount(null)
    const timer = setTimeout(() => {
      const effectiveSort = state.sort === 'manual' ? state.manualBaseSort : (state.sort || undefined)
      resolveShelfAppIds(previewSource, state.limit, effectiveSort)
        .then((ids) => {
          if (cancelled) return
          setPreviewCount(ids.length)
          setResolvedIds(ids)
        })
        .catch(() => {
          if (cancelled) return
          setPreviewCount(0)
          setResolvedIds([])
        })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [previewSource, state.limit, state.sort, state.manualBaseSort])

  useEffect(() => {
    let cancelled = false
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return }
    ;(async () => {
      const next = new Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>()
      for (const id of resolvedIds) {
        try {
          const meta = await platform.getAppMeta(id)
          next.set(id, { name: meta?.name || `App ${id}`, portraitUrl: meta?.portraitUrl, heroUrl: meta?.heroUrl })
        } catch { next.set(id, { name: `App ${id}` }) }
      }
      if (!cancelled) setResolvedMeta(next)
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(',')])

  const handleSave = () => {
    closeModal?.()
    ;(async () => {
      const title = state.title.trim() || shelf.title
      const patch: Partial<SmartShelf> = { title, limit: state.limit }
      ;(patch as any).sort = state.sort || undefined
      ;(patch as any).manualBaseSort = (isManual && state.manualBaseSort !== 'alphabetical') ? state.manualBaseSort : undefined
      ;(patch as any).manualOrder = (isManual && state.manualOrder.length) ? state.manualOrder : undefined
      ;(patch as any).filterGroup = (state.filterEnabled && state.filterGroup.items.length > 0) ? state.filterGroup : undefined
      ;(patch as any).matchNativeSize = state.matchNativeSize
      ;(patch as any).highlightFirst = state.highlightFirst
      ;(patch as any).highlightAll = state.highlightAll
      ;(patch as any).highlightedAppIds = (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined
      ;(patch as any).hideStatusLine = state.hideStatusLine
      ;(patch as any).hideNewBadge = state.hideNewBadge
      ;(patch as any).hideCompatIcons = state.hideCompatIcons
      ;(patch as any).hideNonSteamBadge = state.hideNonSteamBadge
      // Only persist when the user diverged from the default cadence; otherwise
      // omit so the shelf inherits whatever the resolver default ends up being.
      ;(patch as any).refreshIntervalMinutes = (state.refreshIntervalMinutes > 0 && state.refreshIntervalMinutes !== DEFAULT_REFRESH_MINUTES)
        ? state.refreshIntervalMinutes
        : undefined
      // Only persist params that diverge from the mode's defaults — keeps the
      // settings JSON minimal and lets future default tweaks reach existing shelves.
      const defaults = SMART_PARAM_DEFAULTS[shelf.mode] ?? {}
      const overrides: Record<string, number> = {}
      for (const k of paramKeys) {
        if (state.smartParams[k] !== defaults[k]) overrides[k] = state.smartParams[k]
      }
      ;(patch as any).smartParams = Object.keys(overrides).length ? overrides : undefined
      const ok = await actions.patchSmartShelf(shelf.id, patch)
      logInfo('SETTINGS', 'smart shelf updated', { shelfId: shelf.id, success: ok })
    })()
  }

  return (
    <ModalShell>
      <ConfirmModal
        bAllowFullSize
        onCancel={closeModal}
        onEscKeypress={closeModal}
        strTitle={`${t('editing')}: ${shelf.title}`}
        onOK={handleSave}
        strOKButtonText={t('save')}
      >
        <Focusable onMenuButton={handleSave} onMenuActionDescription={t('save')} style={{ paddingBottom: 8 }}>
          <ModalHeader
            t={t}
            title={state.title}
            onTitleChange={(next) => setState((prev) => ({ ...prev, title: next }))}
            previewCount={previewCount}
          />
          <div style={{ position: 'relative', height: 410, overflow: 'hidden' }}>
            <Tabs
              activeTab={activeTab}
              onShowTab={(id: string) => setActiveTab(id as Tab)}
              tabs={[
                {
                  id: 'source',
                  title: t('edit_tab_source'),
                  content: (
                    <FieldContainer scrollable>
                      <Field label={t('smart_mode')}>
                        <div style={{ padding: '4px 0', opacity: 0.85 }}>{t(`smart_template_${shelf.mode}` as any)}</div>
                      </Field>
                      <SliderField
                        label={`${t('limit')} (${state.limit})`}
                        value={state.limit}
                        min={1}
                        max={40}
                        step={1}
                        bottomSeparator='thick'
                        onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))}
                      />
                      <DropdownItem label={t('smart_sort_override')} rgOptions={sortOptions} selectedOption={state.sort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, sort: String(optionData(opt) ?? '') }))} bottomSeparator='thick' />
                      {isManual && (
                        <DropdownItem label={t('manual_base_sort')} rgOptions={baseSortOptions} selectedOption={state.manualBaseSort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, manualBaseSort: String(optionData(opt)) }))} bottomSeparator='thick' />
                      )}
                      <Field
                        label={t('smart_refresh_interval')}
                        description={t('smart_refresh_interval_desc')}
                        bottomSeparator='thick'
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <TextField
                              value={refreshDraft}
                              onChange={(value: unknown) => {
                                const text = textFromDeckyChange(value)
                                // Strip any non-digit so the input stays purely numeric on
                                // gamepad/touch keyboards that allow letters through.
                                const digits = text.replace(/[^0-9]/g, '')
                                setRefreshDraft(digits)
                                if (digits === '') return
                                const n = Math.max(1, Math.min(43200, parseInt(digits, 10) || DEFAULT_REFRESH_MINUTES))
                                setState((prev) => ({ ...prev, refreshIntervalMinutes: n }))
                              }}
                              onBlur={() => {
                                // Normalize empty / out-of-range input back to the default
                                // when the user leaves the field.
                                const n = parseInt(refreshDraft, 10)
                                const clamped = Number.isFinite(n) ? Math.max(1, Math.min(43200, n)) : DEFAULT_REFRESH_MINUTES
                                setRefreshDraft(String(clamped))
                                setState((prev) => ({ ...prev, refreshIntervalMinutes: clamped }))
                              }}
                            />
                          </div>
                          <span style={{ opacity: 0.7, fontSize: 13, whiteSpace: 'nowrap' }}>{t('smart_unit_min')}</span>
                        </div>
                      </Field>
                      {paramKeys.map((key) => {
                        const meta = SMART_PARAM_META[key]
                        if (!meta) return null
                        const value = state.smartParams[key] ?? 0
                        const unit = meta.unitKey ? t(meta.unitKey as any) : ''
                        return (
                          <SliderField
                            key={key}
                            label={`${t(meta.labelKey as any)} (${value}${unit ? ` ${unit}` : ''})`}
                            value={value}
                            min={meta.min}
                            max={meta.max}
                            step={meta.step}
                            bottomSeparator='thick'
                            onChange={(v: number) => setSmartParam(key, v)}
                          />
                        )
                      })}
                      {isManual && (
                        resolvedIds.length === 0
                          ? <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
                          : <ManualSortRow
                              order={effectiveManualOrder}
                              meta={resolvedMeta}
                              onReorder={reorderManual}
                              t={t}
                              highlightFirst={state.highlightFirst}
                              highlightAll={state.highlightAll}
                              highlightedAppIds={state.highlightedAppIds}
                              highlightPickerOpen={highlightPickerOpen}
                            />
                      )}
                    </FieldContainer>
                  ),
                },
                {
                  id: 'filters',
                  title: t('edit_tab_filters'),
                  content: (
                    <FieldContainer scrollable>
                      <ToggleField
                        label={t('smart_filter_enable')}
                        checked={state.filterEnabled}
                        onChange={(value: boolean) => setState((prev) => ({ ...prev, filterEnabled: value, filterGroup: value && prev.filterGroup.items.length === 0 ? { mode: 'and', items: [] } : prev.filterGroup }))}
                      />
                      {state.filterEnabled && (
                        <>
                          <SavedFiltersBar
                            controller={controller}
                            currentGroup={state.filterGroup}
                            onApply={(group) => setState((prev) => ({ ...prev, filterGroup: { ...group } }))}
                          />
                          <FilterPanel group={state.filterGroup} onChange={(group) => setState((prev) => ({ ...prev, filterGroup: group }))} />
                        </>
                      )}
                    </FieldContainer>
                  ),
                },
                {
                  id: 'visual',
                  title: t('edit_tab_visual'),
                  content: (
                    <VisualTabContent
                      t={t}
                      flags={{ matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll }}
                      setFlags={(patch) => setState((prev) => ({ ...prev, ...patch }))}
                      highlightedAppIds={state.highlightedAppIds}
                      setHighlightedAppIds={(next) => setState((prev) => ({ ...prev, highlightedAppIds: next }))}
                      highlightPickerOpen={highlightPickerOpen}
                      setHighlightPickerOpen={setHighlightPickerOpen}
                      alternatingMode={alternatingMode}
                      setAlternatingMode={setAlternatingMode}
                      prePatternHighlightsRef={prePatternHighlightsRef}
                      effectiveManualOrder={effectiveManualOrder}
                      resolvedIds={resolvedIds}
                      resolvedMeta={resolvedMeta}
                    />
                  ),
                },
                {
                  id: 'display',
                  title: t('edit_tab_display'),
                  content: (
                    <DisplayTabContent
                      t={t}
                      display={{ hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge }}
                      setDisplay={(patch) => setState((prev) => ({ ...prev, ...patch }))}
                      hasNonSteamBadges={hasNonSteamBadges}
                    />
                  ),
                },
              ]}
            />
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
