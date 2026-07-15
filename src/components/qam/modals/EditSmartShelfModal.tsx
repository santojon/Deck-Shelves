import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DialogButton,
  Dropdown,
  DropdownItem,
  Field,
  Focusable,
  Tabs,
  TextField,
  ToggleField,
  type SingleDropdownOption,
} from '../../../runtime/host/decky'
import { flowChildrenProps } from '../../../core/steamOSVersion'
import { TIME_OF_DAY_WINDOWS, invalidateSmartShelfCache } from '../../../steam/smartShelves'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf, SmartShelfMode } from '../../../types'
import { FilterPanel } from '../../FilterPanel'
import { FieldContainer, ModalShell , DSSliderField} from '../../ui'
import { resolveShelfAppIds, invalidateRandomSortCache } from '../../../steam'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { SORT_OPTIONS } from './editShelf/constants'
import { optionData } from './editShelf/utils'
import { VisualTabContent } from './editShelf/VisualTabContent'
import { DisplayTabContent } from './editShelf/DisplayTabContent'
import { VisibilityRulesEditor } from './editShelf/VisibilityRulesEditor'
import type { PlatformAppMeta } from '../../../runtime/platform'
import { PreviewPanel } from './editShelf/PreviewPanel'
// SmartShelfModal also supports a modal-driven `create` mode that persists
// only on Save (used by SmartShelfTemplateModal's custom button).
import { ModalHeader } from './editShelf/ModalHeader'
import { FunnelIcon, EyeIcon, SparkleIcon, OnlineIcon } from '../../icons'
import { TabLabel } from './editShelf/TabLabel'
import { SortField } from './editShelf/SortField'
import { SavedFiltersBar } from './editShelf/SavedFiltersBar'
import { SavedSmartFiltersBar } from './editShelf/SavedSmartFiltersBar'
import { textFromDeckyChange } from './modalUtils'
import { SMART_PARAM_DEFAULTS, SMART_PARAM_META, paramKeysForMode, DEFAULT_SORT_FOR_MODE } from '../../../steam/smartParams'
import { buildInitialSmartState, DEFAULT_REFRESH_MINUTES, type EditState } from './editShelf/buildSmartInitialState'
import { persistSmartShelf } from './editShelf/buildSmartSavePatch'


/* Ordered list of every internal smart-shelf mode, used by the Source-tab
   mode dropdown + the composite-mixing picker. Order mirrors the catalogue
   in `SmartShelfTemplateModal` (highest-result-probability first); `custom`
   is excluded — it's a special-purpose mode for filter-only shelves and
   switching INTO it would silently strip the user's smart-mode tuning. */
const SMART_MODE_OPTIONS: SmartShelfMode[] = [
  'daily_pick', 'deck_picks', 'on_deck', 'recently_played',
  'long_session', 'long_session_night', 'random_pick', 'not_started',
  'best_unplayed', 'quick_play', 'short_battery', 'low_battery_mode',
  'interrupted', 'non_steam', 'spare_time', 'time_of_day',
  'rediscover', 'forgotten',
  'backlog_rescue', 'forgotten_gems', 'hidden_gems', 'almost_finished',
  'couch_gaming', 'coop_ready', 'party_games', 'friends_playing',
  'travel_mode', 'never_touched_classics', 'recent_hidden_installs',
  'weekly_rotation', 'monthly_spotlight', 'seasonal_rotation',
]

type Tab = 'source' | 'smart_filters' | 'overrides' | 'filters' | 'visual' | 'display'

// First element of a multi-key value (or the scalar itself), falling back
// when absent — used when applying a saved smart filter whose sort fields
// may be single or multi-key.
function firstOr<T>(v: T | T[] | undefined, fallback: T): T {
  return ((Array.isArray(v) ? v[0] : v) ?? fallback)
}



export function EditSmartShelfModal({ closeModal, controller, shelf, mode = 'edit' }: { closeModal?: () => void; controller: SettingsController; shelf: SmartShelf; mode?: 'create' | 'edit' }) {
  const { t, actions } = controller
  const platform = usePlatform()
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [activeTab, setActiveTab] = useState<Tab>('source')
  const [state, setState] = useState<EditState>(() => buildInitialSmartState(shelf))
  // Buffered text representation of the refresh-interval field — keeps the
  // user free to clear / partially edit the input without immediately
  // collapsing it back to the default. Committed to numeric state on blur.
  const [refreshDraft, setRefreshDraft] = useState<string>(String((shelf as any).refreshIntervalMinutes ?? DEFAULT_REFRESH_MINUTES))

  const paramKeys = useMemo(() => paramKeysForMode(state.mode), [state.mode])
  const setSmartParam = (key: string, value: number) => setState((prev) => ({ ...prev, smartParams: { ...prev.smartParams, [key]: value } }))
  /* Switching mode resets smartParams + drafts to the new mode's defaults.
     The mode field on a smart shelf is the "data source" — picking another
     mode means picking a different candidate-set heuristic, so the previous
     mode's tuning knobs no longer apply. */
  const handleModeChange = (nextMode: SmartShelfMode) => {
    if (nextMode === state.mode) return
    const nextDefaults = SMART_PARAM_DEFAULTS[nextMode] ?? {}
    const nextDrafts: Record<string, string> = {}
    for (const k of Object.keys(nextDefaults)) nextDrafts[k] = String((nextDefaults as any)[k] ?? 0)
    setParamDrafts(nextDrafts)
    setState((prev) => ({
      ...prev,
      mode: nextMode,
      smartParams: { ...nextDefaults },
      // Sort default also tracks mode — only reset if the previous sort was
      // the previous mode's default (i.e. user hadn't overridden it).
      sort: prev.sort === DEFAULT_SORT_FOR_MODE[prev.mode] ? (DEFAULT_SORT_FOR_MODE[nextMode] ?? 'alphabetical') : prev.sort,
    }))
  }
  // Buffered text representations of `kind === 'text'` params (e.g. playtime
  // minutes). Kept separate from `state.smartParams` so the user can clear /
  // partially edit the input without committing intermediate values.
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const k of paramKeys) {
      out[k] = String(state.smartParams[k] ?? 0)
    }
    return out
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, PlatformAppMeta>>(new Map())
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0)
  const previewShelfId = `${shelf.id}-preview`
  const refreshPreview = () => {
    invalidateSmartShelfCache(previewShelfId)
    invalidateRandomSortCache(previewShelfId)
    setPreviewRefreshNonce((n) => n + 1)
  }
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf as any).highlightedAppIds?.length > 0)
  const [hiddenPickerOpen, setHiddenPickerOpen] = useState(((shelf as any).hiddenAppIds?.length ?? 0) > 0)
  const [alternatingMode, setAlternatingMode] = useState<'odd' | 'even' | null>(null)
  const prePatternHighlightsRef = useRef<number[] | null>(null)

  const primarySortKey = Array.isArray(state.sort) ? state.sort[0] : state.sort
  const isManual = primarySortKey === 'manual'
  const effectiveManualOrder = useMemo(() => {
    if (!isManual) return resolvedIds
    const idSet = new Set(resolvedIds)
    // See EditShelfModal — hidden cards stay in the preview (overlaid
    // with the ✕ marker by ShelfPreview); home filters them via
    // applyManualOrder.
    const out: number[] = []
    const tail: number[] = []
    const seen = new Set<number>()
    for (const id of state.manualOrder) {
      if (seen.has(id)) continue
      seen.add(id)
      if (idSet.has(id)) out.push(id)
      else tail.push(id)
    }
    for (const id of resolvedIds) if (!seen.has(id)) out.push(id)
    out.push(...tail)
    return out
  }, [isManual, resolvedIds, state.manualOrder])
  const reorderManual = (nextOrder: number[]) => setState((prev) => ({ ...prev, manualOrder: nextOrder }))

  const sortLabel = (item: typeof SORT_OPTIONS[number]) => (
    (item as any).requiresOnline
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><OnlineIcon size={14} style={{ opacity: 0.7 }} />{t(item.labelKey)}</span>
      : t(item.labelKey)
  ) as any
  // Smart shelves resolve against the local library — no price cache, so
  // online-only sorts (price_low, discount_high, original_price_high) are
  // excluded from both pickers.
  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS
      .filter((item) => !(item as any).requiresOnline)
      .map((item) => ({ data: item.value, label: sortLabel(item) })),
    [t],
  )
  // `random` is excluded under a manual sort: re-shuffling the manual order
  // every render would defeat the user's explicit ordering. Persisted values
  // stay intact — only the option is hidden from this dropdown.
  const baseSortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS
      .filter((item) => item.value !== 'manual' && item.value !== 'random' && !(item as any).requiresOnline)
      .map((item) => ({ data: item.value, label: sortLabel(item) })),
    [t],
  )

  const smartParamsKey = JSON.stringify(state.smartParams)
  const compositeKey = state.compositeModes.join(',') + ':' + state.compositeCombine
  const previewSource = useMemo(() => {
    const base: any = { type: 'smart' as const, mode: state.mode }
    if (state.filterGroup.items.length > 0) base.filterGroup = state.filterGroup
    if (paramKeys.length) base.smartParams = state.smartParams
    if (state.refreshIntervalMinutes > 0 && state.refreshIntervalMinutes !== DEFAULT_REFRESH_MINUTES) {
      base.refreshIntervalMinutes = state.refreshIntervalMinutes
    }
    if (state.compositeModes.length > 0) {
      base.compositeModes = state.compositeModes
      base.compositeCombine = state.compositeCombine
    }
    return base
  }, [state.mode, state.filterGroup, smartParamsKey, state.refreshIntervalMinutes, paramKeys.length, compositeKey])

  useEffect(() => {
    let cancelled = false
    setPreviewCount(null)
    const timer = setTimeout(() => {
      // Mirror Shelf.tsx wiring: forward asc/desc inversion to the resolver
      // and substitute `alphabetical` for an unset sort when reverse is on
      // (so applySortToIds runs and the reverse flag has somewhere to apply).
      const isManualSort = primarySortKey === 'manual'
      const previewReverse: boolean | boolean[] = isManualSort
        ? !!state.manualBaseSortReverse
        : (Array.isArray(state.sortReverse) ? state.sortReverse : !!state.sortReverse)
      const previewSort: string | string[] | undefined = isManualSort
        ? (state.manualBaseSort || 'alphabetical')
        : (state.sort || ((Array.isArray(previewReverse) ? previewReverse[0] : previewReverse) ? 'alphabetical' : undefined))
      resolveShelfAppIds(previewSource, Math.max(state.limit, 500), previewSort, previewShelfId, previewReverse)
        .then((ids) => {
          if (cancelled) return
          setPreviewCount(ids.length)
          setResolvedIds(ids.slice(0, state.limit))
        })
        .catch(() => {
          if (cancelled) return
          setPreviewCount(0)
          setResolvedIds([])
        })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [previewSource, state.limit, state.sort, state.manualBaseSort, state.sortReverse, state.manualBaseSortReverse, previewRefreshNonce])

  useEffect(() => {
    let cancelled = false
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return }
    ;void (async () => {
      const results = await Promise.all(resolvedIds.map(async (id): Promise<[number, PlatformAppMeta]> => {
        try { const m = await platform.getAppMeta(id); return [id, m ?? { appid: id, name: `App ${id}` }] }
        catch { return [id, { appid: id, name: `App ${id}` }] }
      }))
      if (!cancelled) setResolvedMeta(new Map(results))
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(',')])

  /* Meta for menu-added games (state.manualOrder entries NOT in
     resolvedIds — see EditShelfModal for the rationale). Without this
     the preview's `meta.get(tailId)` returns undefined and menu-added
     cards never render in non-source tabs. */
  useEffect(() => {
    const resolvedSet = new Set(resolvedIds)
    const tail = state.manualOrder.filter((id) => !resolvedSet.has(id) && id > 0)
    if (!tail.length) return
    let cancelled = false
    ;void (async () => {
      const results = await Promise.all(tail.map(async (id): Promise<[number, PlatformAppMeta]> => {
        try { const m = await platform.getAppMeta(id); return [id, m ?? { appid: id, name: `App ${id}` }] }
        catch { return [id, { appid: id, name: `App ${id}` }] }
      }))
      if (cancelled) return
      setResolvedMeta((prev) => {
        const next = new Map(prev)
        for (const [id, m] of results) {
          if (!next.has(id)) next.set(id, m)
        }
        return next
      })
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(','), state.manualOrder.join(',')])

  const handleSave = () => {
    closeModal?.()
    void persistSmartShelf({ state, shelf, mode, isManual, highlightPickerOpen, hiddenPickerOpen, paramKeys, actions })
  }

  const hourOptions = Array.from({ length: 24 }, (_, h) => ({ data: h, label: `${String(h).padStart(2, '0')}:00` }))
  const HourRange = ({ range, onUpdate, onRemove, canRemove }: { range: { start: number; end: number }; onUpdate: (k: 'start' | 'end', v: number) => void; onRemove: () => void; canRemove: boolean }) => (
    <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ width: 110 }}>
        <Dropdown rgOptions={hourOptions} selectedOption={range.start} onChange={(opt: unknown) => { const n = Number(optionData(opt) ?? 0); if (Number.isFinite(n)) onUpdate('start', n) }} />
      </div>
      <span style={{ opacity: 0.6, fontSize: 13 }}>→</span>
      <div style={{ width: 110 }}>
        <Dropdown rgOptions={hourOptions} selectedOption={range.end} onChange={(opt: unknown) => { const n = Number(optionData(opt) ?? 0); if (Number.isFinite(n)) onUpdate('end', n) }} />
      </div>
      <DialogButton style={{ minWidth: 36, width: 36, height: 36, padding: 0, marginLeft: 'auto', flex: 'none' }} onClick={onRemove} onOKButton={onRemove} disabled={!canRemove}>✕</DialogButton>
    </Focusable>
  )

  /* Preview card-selection wiring — the preview doubles as the highlight
     picker (Visual tab) and the hidden picker (Display tab). Which mode is
     active, its current set, and the per-card toggle are derived together
     from the open picker so the modal render stays flat. */
  const previewSel = (() => {
    const mode: 'highlight' | 'hidden' | undefined =
      activeTab === 'visual' && highlightPickerOpen ? 'highlight'
        : activeTab === 'display' && hiddenPickerOpen ? 'hidden'
          : undefined
    const set = mode === 'highlight' ? new Set(state.highlightedAppIds)
      : mode === 'hidden' ? new Set(state.hiddenAppIds)
        : undefined
    const onToggle = mode === 'highlight'
      ? (id: number) => setState((prev) => {
          setAlternatingMode(null)
          prePatternHighlightsRef.current = null
          const has = prev.highlightedAppIds.includes(id)
          return { ...prev, highlightedAppIds: has ? prev.highlightedAppIds.filter((x) => x !== id) : [...prev.highlightedAppIds, id] }
        })
      : mode === 'hidden'
        ? (id: number) => setState((prev) => {
            const has = prev.hiddenAppIds.includes(id)
            return { ...prev, hiddenAppIds: has ? prev.hiddenAppIds.filter((x) => x !== id) : [...prev.hiddenAppIds, id] }
          })
        : undefined
    return { mode, set, onToggle }
  })()

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
          <div style={{ display: 'flex', flexDirection: 'column', height: 'min(calc(100vh - 130px), 540px)', minHeight: 400 }}>
          <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            <Tabs
              activeTab={activeTab}
              onShowTab={(id: string) => setActiveTab(id as Tab)}
              tabs={[
                {
                  id: 'source',
                  title: t('edit_tab_source'),
                  content: (() => (
                    <FieldContainer scrollable>
                      {/* Smart-mode picker + inline saved-smart-filter dropdown.
                          The mode IS the smart shelf's "data source"; saved
                          smart filters are full configurations the user has
                          previously stored. Both live side-by-side per the
                          Source-tab UX. */}
                      <Field label={t('smart_mode')}>
                        <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Dropdown
                              rgOptions={SMART_MODE_OPTIONS.map((opt) => ({ data: opt, label: t(`smart_template_${opt}` as any) }))}
                              selectedOption={state.mode}
                              onChange={(opt: unknown) => {
                                const next = String(optionData(opt) ?? state.mode) as SmartShelfMode
                                handleModeChange(next)
                              }}
                            />
                          </div>
                        </Focusable>
                      </Field>
                      {/* Composite mode mixing — optional. When at least one
                          additional mode is added, the resolver evaluates each
                          mode and merges (union / intersection). Same mental
                          model as regular shelves' composite source. */}
                      <Field label={t('smart_composite_label' as any)} description={t('smart_composite_desc' as any)} bottomSeparator='standard'>
                        <Focusable style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Dropdown
                              rgOptions={[
                                { data: 'union', label: t('smart_composite_union' as any) },
                                { data: 'intersection', label: t('smart_composite_intersection' as any) },
                              ]}
                              selectedOption={state.compositeCombine}
                              onChange={(opt: unknown) => {
                                const next = String(optionData(opt) ?? 'union') as 'union' | 'intersection'
                                setState((prev) => ({ ...prev, compositeCombine: next }))
                              }}
                            />
                          </div>
                          {state.compositeModes.length > 0 && (
                            <Focusable style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {state.compositeModes.map((m) => (
                                <DialogButton
                                  key={m}
                                  style={{ height: 32, minWidth: 0, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                                  onClick={() => setState((prev) => ({ ...prev, compositeModes: prev.compositeModes.filter((x) => x !== m) }))}
                                  onOKActionDescription={t('smart_composite_remove' as any)}
                                >{t(`smart_template_${m}` as any)} ✕</DialogButton>
                              ))}
                            </Focusable>
                          )}
                          {state.compositeModes.length < 4 && (
                            <Dropdown
                              rgOptions={[
                                { data: '__add_placeholder__', label: t('smart_composite_add' as any) },
                                ...SMART_MODE_OPTIONS
                                  .filter((m) => m !== state.mode && !state.compositeModes.includes(m))
                                  .map((m) => ({ data: m, label: t(`smart_template_${m}` as any) })),
                              ]}
                              selectedOption={'__add_placeholder__'}
                              onChange={(opt: unknown) => {
                                const v = String(optionData(opt) ?? '__add_placeholder__')
                                if (v === '__add_placeholder__') return
                                setState((prev) => ({ ...prev, compositeModes: [...prev.compositeModes, v as SmartShelfMode] }))
                              }}
                            />
                          )}
                        </Focusable>
                      </Field>
                      {/* Saved smart filter picker — applies a previously-saved
                          full configuration (mode + smartParams + filterGroup +
                          sort + limit + visibility) to the current shelf. */}
                      <SavedSmartFiltersBar
                        controller={controller}
                        currentPayload={{
                          mode: state.mode,
                          smartParams: (() => {
                            const defaults = SMART_PARAM_DEFAULTS[state.mode] ?? {}
                            const out: Record<string, number> = {}
                            for (const k of paramKeys) {
                              if (state.smartParams[k] !== defaults[k]) out[k] = state.smartParams[k]
                            }
                            return Object.keys(out).length ? out : undefined
                          })(),
                          filterGroup: state.filterGroup.items.length > 0 ? state.filterGroup : undefined,
                          sort: state.sort || undefined,
                          sortReverse: state.sortReverse || undefined,
                          limit: state.limit,
                          visibleHours: (() => {
                            if (!state.visibleHoursEnabled) return undefined
                            const all = [
                              ...state.defaultHours,
                              ...Object.entries(state.dayOverrides).flatMap(([dayStr, ranges]) =>
                                ranges.map((r) => ({ ...r, days: [Number(dayStr)] }))
                              ),
                            ]
                            return all.length ? all : undefined
                          })(),
                          visibleDaysOfWeek: state.visibleDaysOfWeek.length === 7 ? undefined : state.visibleDaysOfWeek.slice().sort(),
                        }}
                        onApply={(filter) => {
                          const incomingHours = Array.isArray(filter.visibleHours) ? filter.visibleHours : []
                          const defaults = incomingHours.filter((r: any) => !Array.isArray(r.days) || r.days.length === 0).map((r: any) => ({ start: Number(r.start) || 0, end: Number(r.end) || 0 }))
                          const overrides: Record<string, Array<{ start: number; end: number }>> = {}
                          for (const r of incomingHours as any[]) {
                            if (Array.isArray(r.days) && r.days.length > 0) {
                              for (const day of r.days) {
                                const k = String(day)
                                if (!overrides[k]) overrides[k] = []
                                overrides[k].push({ start: Number(r.start) || 0, end: Number(r.end) || 0 })
                              }
                            }
                          }
                          const nextMode = (filter.mode || state.mode) as SmartShelfMode
                          setState((prev) => ({
                            ...prev,
                            mode: nextMode,
                            smartParams: { ...(SMART_PARAM_DEFAULTS[nextMode] ?? {}), ...(filter.smartParams ?? {}) },
                            filterGroup: filter.filterGroup ?? { mode: 'and', items: [] },
                            sort: firstOr(filter.sort, prev.sort),
                            sortReverse: firstOr(filter.sortReverse, false),
                            limit: filter.limit ?? prev.limit,
                            visibleHoursEnabled: incomingHours.length > 0,
                            defaultHours: defaults.length ? defaults : prev.defaultHours,
                            dayOverrides: Object.keys(overrides).length ? overrides : prev.dayOverrides,
                            allowDayOverrides: Object.keys(overrides).length > 0,
                            visibleDaysOfWeek: filter.visibleDaysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
                          }))
                        }}
                      />
                      <DSSliderField
                        label={t('limit')}
                        value={state.limit}
                        min={1}
                        max={50}
                        step={1}
                        bottomSeparator='thick'
                        onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))}
                      />
                      <SortField
                        label={t('smart_sort_override')}
                        options={sortOptions}
                        sort={state.sort}
                        onSortChange={(next) => setState((prev) => ({ ...prev, sort: next }))}
                        reverse={state.sortReverse}
                        onReverseChange={(next) => setState((prev) => ({ ...prev, sortReverse: next }))}
                        allowMultiKey
                      />
                      {isManual && (
                        <SortField
                          label={t('manual_base_sort')}
                          options={baseSortOptions}
                          sort={state.manualBaseSort}
                          onSortChange={(next) => setState((prev) => ({ ...prev, manualBaseSort: Array.isArray(next) ? (next[0] ?? 'alphabetical') : next }))}
                          reverse={state.manualBaseSortReverse}
                          onReverseChange={(next) => setState((prev) => ({ ...prev, manualBaseSortReverse: Array.isArray(next) ? !!next[0] : next }))}
                        />
                      )}
                      <Field
                        label={t('smart_refresh_interval')}
                        description={t('smart_refresh_interval_desc')}
                        bottomSeparator='none'
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
                    </FieldContainer>
                  ))(),
                },
                {
                  id: 'smart_filters',
                  title: (<TabLabel icon={<SparkleIcon />} text={t('edit_tab_smart_filters' as any)} />) as unknown as string,
                  content: (() => (
                    <FieldContainer scrollable>
                      {shelf.mode === 'time_of_day' && (
                        <Field
                          label={t('smart_time_of_day_info_label' as any)}
                          description={TIME_OF_DAY_WINDOWS.map((w) => `${String(w.start).padStart(2, '0')}–${String(w.end).padStart(2, '0')} → ${t(`smart_template_${w.subMode}` as any)}`).join('  ·  ')}
                        />
                      )}
                      {paramKeys.map((key) => {
                        const meta = SMART_PARAM_META[key]
                        if (!meta) return null
                        const value = state.smartParams[key] ?? 0
                        const unit = meta.unitKey ? t(meta.unitKey as any) : ''
                        if (meta.kind === 'dropdown' && meta.options) {
                          const opts = meta.options.map((o) => ({ data: o.value, label: t(o.labelKey as any) }))
                          return (
                            <DropdownItem
                              key={key}
                              label={t(meta.labelKey as any)}
                              rgOptions={opts}
                              selectedOption={value}
                              onChange={(opt: unknown) => {
                                const n = Number(optionData(opt) ?? meta.min)
                                if (Number.isFinite(n)) setSmartParam(key, n)
                              }}
                              bottomSeparator='thick'
                            />
                          )
                        }
                        if (meta.kind === 'text') {
                          const draft = paramDrafts[key] ?? String(value)
                          return (
                            <Field key={key} label={t(meta.labelKey as any)} bottomSeparator='thick'>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                                <div style={{ flex: 1, minWidth: 140 }}>
                                  <TextField
                                    value={draft}
                                    onChange={(value: unknown) => {
                                      const text = textFromDeckyChange(value)
                                      const digits = text.replace(/[^0-9]/g, '')
                                      setParamDrafts((prev) => ({ ...prev, [key]: digits }))
                                      if (digits === '') return
                                      const n = Math.max(meta.min, Math.min(meta.max, parseInt(digits, 10) || meta.min))
                                      setSmartParam(key, n)
                                    }}
                                    onBlur={() => {
                                      const n = parseInt(paramDrafts[key] ?? '', 10)
                                      const clamped = Number.isFinite(n) ? Math.max(meta.min, Math.min(meta.max, n)) : meta.min
                                      setParamDrafts((prev) => ({ ...prev, [key]: String(clamped) }))
                                      setSmartParam(key, clamped)
                                    }}
                                  />
                                </div>
                                {unit && <span style={{ opacity: 0.7, fontSize: 13, whiteSpace: 'nowrap' }}>{unit}</span>}
                              </div>
                            </Field>
                          )
                        }
                        return (
                          <DSSliderField
                            key={key}
                            label={t(meta.labelKey as any)}
                            value={value}
                            unit={unit ? ` ${unit}` : ''}
                            min={meta.min}
                            max={meta.max}
                            step={meta.step}
                            bottomSeparator='thick'
                            onChange={(v: number) => setSmartParam(key, v)}
                          />
                        )
                      })}
                      <ToggleField
                        label={t('smart_visible_hours_label')}
                        description={t('smart_visible_hours_desc')}
                        checked={state.visibleHoursEnabled}
                        onChange={(v: boolean) => setState((prev) => ({ ...prev, visibleHoursEnabled: v }))}
                      />
                      {state.visibleHoursEnabled && (
                        <Focusable style={{ padding: '4px 0 8px' }}>
                          <div style={{ padding: '4px 0 2px', fontSize: 12, opacity: 0.7, fontWeight: 600 }}>{t('smart_schedule_default_hours' as any)}</div>
                          {state.defaultHours.map((range, idx) => (
                            <HourRange
                              key={idx}
                              range={range}
                              onUpdate={(k, v) => setState((prev) => ({ ...prev, defaultHours: prev.defaultHours.map((r, i) => i === idx ? { ...r, [k]: v } : r) }))}
                              onRemove={() => setState((prev) => ({ ...prev, defaultHours: prev.defaultHours.filter((_, i) => i !== idx) }))}
                              canRemove={state.defaultHours.length > 1}
                            />
                          ))}
                          <DialogButton style={{ width: '100%', marginTop: 4 }} onClick={() => setState((prev) => ({ ...prev, defaultHours: [...prev.defaultHours, { start: 9, end: 17 }] }))} onOKButton={() => setState((prev) => ({ ...prev, defaultHours: [...prev.defaultHours, { start: 9, end: 17 }] }))}>
                            + {t('smart_visible_hours_add' as any)}
                          </DialogButton>
                        </Focusable>
                      )}
                      <Field label={t('smart_visible_days_label')} />
                      {state.visibleDaysOfWeek.length === 0 && (
                        <div style={{ padding: '4px 8px 8px', fontSize: 12, color: 'var(--ds-warn, #ff9800)' }}>{t('smart_visible_days_empty_warning' as any)}</div>
                      )}
                      <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '4px 0 8px', width: '100%', boxSizing: 'border-box' }}>
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const active = state.visibleDaysOfWeek.includes(day)
                          const toggleDay = () => setState((prev) => ({ ...prev, visibleDaysOfWeek: active ? prev.visibleDaysOfWeek.filter((d) => d !== day) : [...prev.visibleDaysOfWeek, day].sort() }))
                          return (
                            <DialogButton key={day} onClick={toggleDay} onOKButton={toggleDay} style={{ width: '100%', minWidth: 0, minHeight: 34, padding: '4px 2px', fontSize: 12, lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                <span style={{ width: 10, textAlign: 'center', flexShrink: 0, color: active ? '#4caf50' : 'rgba(255,255,255,0.3)' }}>{active ? '✓' : '·'}</span>
                                <span>{t((`smart_visible_day_${day}`) as any)}</span>
                              </span>
                            </DialogButton>
                          )
                        })}
                      </Focusable>
                      {state.visibleHoursEnabled && (
                        <ToggleField
                          label={t('smart_allow_day_overrides' as any)}
                          description={t('smart_allow_day_overrides_desc' as any)}
                          checked={state.allowDayOverrides}
                          onChange={(v: boolean) => {
                            setState((prev) => ({ ...prev, allowDayOverrides: v, dayOverrides: v ? prev.dayOverrides : {} }))
                            if (!v && activeTab === 'overrides') setActiveTab('smart_filters')
                          }}
                        />
                      )}
                      <Field label={t('visibility_rules_label' as any)} description={t('visibility_rules_desc' as any)} />
                      <VisibilityRulesEditor
                        value={state.visibility}
                        onChange={(v) => setState((prev) => ({ ...prev, visibility: v }))}
                        t={t as any}
                      />
                      <Field label={t('visibility_autopin_label' as any)} description={t('visibility_autopin_desc' as any)} />
                      <VisibilityRulesEditor
                        value={(state as any).autoPin}
                        onChange={(v) => setState((prev) => ({ ...prev, autoPin: v } as any))}
                        t={t as any}
                      />
                      <Field label={t('visibility_autocollapse_label' as any)} description={t('visibility_autocollapse_desc' as any)} />
                      <ToggleField
                        label={t('visibility_autocollapse_empty' as any)}
                        checked={(state as any).autoCollapseWhenEmpty === true}
                        onChange={(v: boolean) => setState((prev) => ({ ...prev, autoCollapseWhenEmpty: v } as any))}
                      />
                      <VisibilityRulesEditor
                        value={(state as any).autoCollapse}
                        onChange={(v) => setState((prev) => ({ ...prev, autoCollapse: v } as any))}
                        t={t as any}
                      />
                    </FieldContainer>
                  ))(),
                },
                ...(state.allowDayOverrides ? [{
                  id: 'overrides',
                  title: t('edit_tab_overrides' as any),
                  content: (() => {
                    const infoLines: string[] = []
                    if (state.visibleDaysOfWeek.length > 0 && state.visibleDaysOfWeek.length < 7)
                      infoLines.push(`${t('smart_visible_days_label')}: ${state.visibleDaysOfWeek.map((d) => t(`smart_visible_day_${d}` as any)).join(', ')}`)
                    if (state.visibleHoursEnabled && state.defaultHours.length > 0)
                      infoLines.push(`${t('smart_schedule_default_hours' as any)}: ${state.defaultHours.map((r) => `${String(r.start).padStart(2, '0')}:00–${String(r.end).padStart(2, '0')}:00`).join(', ')}`)
                    return (
                      <FieldContainer scrollable>
                        {infoLines.length > 0 && (
                          <Field label={t('smart_overrides_info_label' as any)} description={infoLines.join('  ·  ')} />
                        )}
                        {state.visibleDaysOfWeek.length === 0 && (
                          <div style={{ padding: '4px 8px 8px', fontSize: 12, color: 'var(--ds-warn, #ff9800)' }}>{t('smart_visible_days_empty_warning' as any)}</div>
                        )}
                        <div style={{ padding: '10px 0 2px', fontSize: 12, opacity: 0.7, fontWeight: 600 }}>{t('smart_schedule_day_overrides' as any)}</div>
                        <Focusable {...flowChildrenProps('horizontal')} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: '4px 0 8px', width: '100%', boxSizing: 'border-box' }}>
                          {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                            const hasOverride = !!state.dayOverrides[String(day)]
                            const toggle = () => setState((prev) => {
                              const next = { ...prev.dayOverrides }
                              if (hasOverride) { delete next[String(day)] } else { next[String(day)] = [{ start: 9, end: 17 }] }
                              return { ...prev, dayOverrides: next }
                            })
                            return (
                              <DialogButton key={day} onClick={toggle} onOKButton={toggle} style={{ width: '100%', minWidth: 0, minHeight: 34, padding: '4px 2px', fontSize: 12, lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                  <span style={{ width: 10, textAlign: 'center', flexShrink: 0, color: hasOverride ? '#4caf50' : 'rgba(255,255,255,0.3)' }}>{hasOverride ? '✓' : '·'}</span>
                                  <span>{t((`smart_visible_day_${day}`) as any)}</span>
                                </span>
                              </DialogButton>
                            )
                          })}
                        </Focusable>
                        {[0, 1, 2, 3, 4, 5, 6].filter((d) => !!state.dayOverrides[String(d)]).map((day) => {
                          const ranges = state.dayOverrides[String(day)]
                          return (
                            <Focusable key={day} style={{ padding: '4px 0 8px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4 }}>
                              <div style={{ fontSize: 12, opacity: 0.8, padding: '2px 0 4px' }}>{t((`smart_visible_day_${day}`) as any)}</div>
                              {ranges.map((range, idx) => (
                                <HourRange
                                  key={idx}
                                  range={range}
                                  onUpdate={(k, v) => setState((prev) => ({ ...prev, dayOverrides: { ...prev.dayOverrides, [String(day)]: prev.dayOverrides[String(day)].map((r, i) => i === idx ? { ...r, [k]: v } : r) } }))}
                                  onRemove={() => setState((prev) => ({ ...prev, dayOverrides: { ...prev.dayOverrides, [String(day)]: prev.dayOverrides[String(day)].filter((_, i) => i !== idx) } }))}
                                  canRemove={ranges.length > 1}
                                />
                              ))}
                              <DialogButton style={{ width: '100%', marginTop: 4 }} onClick={() => setState((prev) => ({ ...prev, dayOverrides: { ...prev.dayOverrides, [String(day)]: [...prev.dayOverrides[String(day)], { start: 9, end: 17 }] } }))} onOKButton={() => setState((prev) => ({ ...prev, dayOverrides: { ...prev.dayOverrides, [String(day)]: [...prev.dayOverrides[String(day)], { start: 9, end: 17 }] } }))}>
                                + {t('smart_visible_hours_add' as any)}
                              </DialogButton>
                            </Focusable>
                          )
                        })}
                      </FieldContainer>
                    )
                  })(),
                }] as any[] : []),
                {
                  id: 'filters',
                  title: (<TabLabel icon={<FunnelIcon />} text={t('edit_tab_additional_filters' as any)} />) as unknown as string,
                  content: (
                    <FieldContainer scrollable>
                      <SavedFiltersBar
                        controller={controller}
                        currentGroup={state.filterGroup}
                        onApply={(group) => setState((prev) => ({ ...prev, filterGroup: { ...group } }))}
                      />
                      <FilterPanel group={state.filterGroup} onChange={(group) => setState((prev) => ({ ...prev, filterGroup: group }))} controller={controller} allowOnlineFilters={false} />
                    </FieldContainer>
                  ),
                },
                {
                  id: 'visual',
                  title: t('edit_tab_visual'),
                  content: (
                    <VisualTabContent
                      t={t}
                      flags={{ matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightRandom: state.highlightRandom, enableLogo: state.enableLogo, enableIcon: state.enableIcon, enableDescription: state.enableDescription, descriptionBelowLogo: state.descriptionBelowLogo, logoPosition: state.logoPosition, descriptionPosition: state.descriptionPosition, logoSize: state.logoSize, logoTopOffset: state.logoTopOffset, iconVerticalAlign: state.iconVerticalAlign, shelfTitlePosition: state.shelfTitlePosition, gameNamePosition: state.gameNamePosition, playtimePosition: state.playtimePosition, descriptionHeight: state.descriptionHeight, descriptionLogoGap: state.descriptionLogoGap, descriptionScale: state.descriptionScale, fullPageShelf: state.fullPageShelf, heroEnabled: state.heroEnabled, gameInfoAbove: state.gameInfoAbove, friendsPlayingOverlay: state.friendsPlayingOverlay, friendsPlayingOverlayRecent: state.friendsPlayingOverlayRecent }}
                      setFlags={(patch: any) => setState((prev) => { const next = { ...prev, ...patch }; if (patch.gameInfoAbove === true) next.hideShelfTitle = true; return next; })}
                      highlightedAppIds={state.highlightedAppIds}
                      setHighlightedAppIds={(next) => setState((prev) => ({ ...prev, highlightedAppIds: next }))}
                      highlightPickerOpen={highlightPickerOpen}
                      setHighlightPickerOpen={setHighlightPickerOpen}
                      alternatingMode={alternatingMode}
                      setAlternatingMode={setAlternatingMode}
                      prePatternHighlightsRef={prePatternHighlightsRef}
                      effectiveManualOrder={effectiveManualOrder}
                    />
                  ),
                },
                {
                  id: 'display',
                  title: (<TabLabel icon={<EyeIcon />} text={t('edit_tab_display')} />) as unknown as string,
                  content: (
                    <DisplayTabContent
                      t={t}
                      display={{ hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideDiscountBadge: state.hideDiscountBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames === true, hideInstallIndicator: state.hideInstallIndicator === true, hideSeeMore: state.hideSeeMore === true, hideRefreshCard: state.hideRefreshCard === true }}
                      setDisplay={(patch: any) => setState((prev) => { const next = { ...prev, ...patch }; if (patch.hideShelfTitle === false && (prev as any).gameInfoAbove) next.gameInfoAbove = false; return next; })}
                      hasNonSteamBadges={hasNonSteamBadges}
                      dedupeByExactName={state.dedupeByExactName}
                      setDedupeByExactName={(v) => setState((prev) => ({ ...prev, dedupeByExactName: v }))}
                      setHiddenAppIds={(next) => setState((prev) => ({ ...prev, hiddenAppIds: next }))}
                      hiddenPickerOpen={hiddenPickerOpen}
                      setHiddenPickerOpen={setHiddenPickerOpen}
                    />
                  ),
                },
              ]}
            />
          </div>
          <PreviewPanel
            t={t}
            title={state.title}
            hideShelfTitle={state.hideShelfTitle}
            activeTab={activeTab}
            resolvedIds={resolvedIds}
            effectiveManualOrder={effectiveManualOrder}
            resolvedMeta={resolvedMeta}
            isManualSort={isManual}
            onReorderManual={reorderManual}
            highlightFirst={state.highlightFirst}
            highlightAll={state.highlightAll}
            highlightedAppIds={state.highlightedAppIds}
            alternatingMode={alternatingMode}
            hiddenAppIds={state.hiddenAppIds}
            hideStatusLine={state.hideStatusLine}
            hideNewBadge={state.hideNewBadge}
            hideCompatIcons={state.hideCompatIcons}
            hideNonSteamBadge={state.hideNonSteamBadge}
            hideGameNames={state.hideGameNames === true}
            hideInstallIndicator={state.hideInstallIndicator === true}
            hideSeeMore={state.hideSeeMore === true}
            hideRefreshCard={state.hideRefreshCard === true}
            limit={state.limit}
            shelfSource={previewSource}
            shelfSort={state.sort}
            onRefresh={refreshPreview}
            selectionMode={previewSel.mode}
            selectionSet={previewSel.set}
            onToggleSelection={previewSel.onToggle}
            removableSet={(() => {
              if (!state.manualOrder.length) return undefined
              const inSource = new Set(resolvedIds)
              const tail = state.manualOrder.filter((id) => !inSource.has(id))
              return tail.length ? new Set(tail) : undefined
            })()}
            onRemoveCard={(id) => setState((prev) => ({ ...prev, manualOrder: prev.manualOrder.filter((x) => x !== id) }))}
          />
          </div>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  )
}
