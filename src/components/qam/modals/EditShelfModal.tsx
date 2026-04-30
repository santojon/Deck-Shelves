import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DropdownItem,
  Focusable,
  SliderField,
  Tabs,
} from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../../../domain/settings'
import { FilterPanel } from '../../FilterPanel'
import { FieldContainer, ModalShell } from '../../ui'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds } from '../../../steam'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { BASE_SOURCE_TYPES, SORT_OPTIONS, type SourceType, type EditTab } from './editShelf/constants'
import type { EditableShelfState } from './editShelf/types'
import { optionData } from './editShelf/utils'
import { ManualSortRow } from './editShelf/ManualSortRow'
import { SavedFiltersBar } from './editShelf/SavedFiltersBar'
import { VisualTabContent } from './editShelf/VisualTabContent'
import { DisplayTabContent } from './editShelf/DisplayTabContent'
import { FunnelIcon, EyeIcon } from '../../icons'

// Tab title with optional leading icon — uses inline-flex so the icon
// aligns vertically with the label text. Applied selectively (not every
// tab) so the strip stays uncluttered.
function TabLabel({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      {text}
    </span>
  )
}
import { ModalHeader } from './editShelf/ModalHeader'


export function EditShelfModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  const { t, tabs: platformTabs, collections, actions } = controller
  const platform = usePlatform()
  const externalSources = useMemo(() => getExternalSources(), [])
  const initialSourceType = shelf.source.type as SourceType
  const initialFilter = normalizeFilter(shelf.source)
  const initialFilterGroup = getEffectiveFilterGroup(initialFilter)
  const [state, setState] = useState<EditableShelfState>({
    title: shelf.title,
    sourceType: initialSourceType,
    collectionId: shelf.source.type === 'collection' ? shelf.source.collectionId : String(collections[0]?.id ?? ''),
    tab: shelf.source.type === 'tab' ? shelf.source.tab : String(platformTabs[0]?.id ?? 'all'),
    externalSourceId: shelf.source.type === 'external' ? shelf.source.sourceId : (externalSources[0]?.id ?? ''),
    filter: initialFilter,
    filterGroup: initialFilterGroup,
    sort: (shelf as any).sort ?? 'alphabetical',
    manualBaseSort: (shelf as any).manualBaseSort ?? 'alphabetical',
    limit: shelf.limit,
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    highlightAll: shelf.highlightAll ?? false,
    highlightedAppIds: shelf.highlightedAppIds ?? [],
    manualOrder: (shelf as any).manualOrder ?? [],
    hideStatusLine: shelf.hideStatusLine ?? false,
    hideNewBadge: shelf.hideNewBadge ?? false,
    hideCompatIcons: shelf.hideCompatIcons ?? false,
    hideNonSteamBadge: shelf.hideNonSteamBadge ?? false,
    hideShelfTitle: (shelf as any).hideShelfTitle ?? false,
    hideGameNames: (shelf as any).hideGameNames ?? false,
    hideInstallIndicator: (shelf as any).hideInstallIndicator ?? false,
  })
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditTab>('source')
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>>(new Map())
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf.highlightedAppIds?.length ?? 0) > 0)
  const [alternatingMode, setAlternatingMode] = useState<'odd' | 'even' | null>(null)
  const prePatternHighlightsRef = useRef<number[] | null>(null)
  const activeSort = state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort
  const isManualSort = activeSort === 'manual'
  const effectiveManualOrder = useMemo(() => {
    if (!isManualSort) return resolvedIds
    const idSet = new Set(resolvedIds)
    const out: number[] = []
    for (const id of state.manualOrder) if (idSet.has(id) && !out.includes(id)) out.push(id)
    for (const id of resolvedIds) if (!out.includes(id)) out.push(id)
    return out
  }, [isManualSort, resolvedIds, state.manualOrder])
  const reorderManual = (nextOrder: number[]) => setState((prev) => ({ ...prev, manualOrder: nextOrder }))

  const previewSource = useMemo(() => {
    if (state.sourceType === 'collection') return { type: 'collection' as const, collectionId: state.collectionId }
    if (state.sourceType === 'tab') return { type: 'tab' as const, tab: state.tab }
    if (state.sourceType === 'external') return { type: 'external' as const, sourceId: state.externalSourceId }
    // When manual sort is active, use the configured base sort for the
    // preview so the mini-card row reflects the actual order of non-manual
    // positions at runtime (matches what Shelf.tsx resolves on home).
    const previewSort = state.filter.sort === 'manual' ? state.manualBaseSort : state.filter.sort
    const effectiveFilter = filterGroupToFilter(state.filterGroup, previewSort as ShelfFilter['sort'])
    return { type: 'filter' as const, filter: effectiveFilter }
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort, state.manualBaseSort])

  useEffect(() => {
    let cancelled = false
    setPreviewCount(null)
    const timer = setTimeout(() => {
      resolveShelfAppIds(previewSource, state.limit)
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
  }, [previewSource, state.limit])

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

  const allSourceTypes: SourceType[] = externalSources.length > 0 ? [...BASE_SOURCE_TYPES, 'external'] : BASE_SOURCE_TYPES
  const sourceTypeOptions: SingleDropdownOption[] = allSourceTypes.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') : value === 'tab' ? t('source_tab') : value === 'external' ? t('source_external') : t('source_filter'),
  }))
  const tabOptions: SingleDropdownOption[] = platformTabs.map((item) => ({ data: item.id, label: item.name }))
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
  const externalOptions: SingleDropdownOption[] = externalSources.map((src) => ({ data: src.id, label: src.displayName }))
  // Placeholder injection: when the current value isn't present in the
  // option list (no items discovered yet OR orphan id), prepend a
  // "Selecione" entry so the dropdown never renders blank. The placeholder
  // has empty `data` and disappears on first real pick.
  const placeholderOption: SingleDropdownOption = { data: '', label: t('select_placeholder' as any) }
  const withPlaceholder = (opts: SingleDropdownOption[], current: string): SingleDropdownOption[] =>
    !current || opts.some((o) => String(o.data) === current) ? opts : [placeholderOption, ...opts]
  const collectionOptionsFinal = collectionOptions.length === 0 ? [placeholderOption] : withPlaceholder(collectionOptions, state.collectionId)
  const tabOptionsFinal = tabOptions.length === 0 ? [placeholderOption] : withPlaceholder(tabOptions, state.tab)
  const externalOptionsFinal = externalOptions.length === 0 ? [placeholderOption] : withPlaceholder(externalOptions, state.externalSourceId)
  const collectionSelected = collectionOptions.some((o) => String(o.data) === state.collectionId) ? state.collectionId : ''
  const tabSelected = tabOptions.some((o) => String(o.data) === state.tab) ? state.tab : ''
  const externalSelected = externalOptions.some((o) => String(o.data) === state.externalSourceId) ? state.externalSourceId : ''
  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.map((item) => ({ data: item.value, label: t(item.labelKey) })),
    [t]
  )
  const baseSortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.filter((item) => item.value !== 'manual').map((item) => ({ data: item.value, label: t(item.labelKey) })),
    [t]
  )

  const changeSourceType = (type: SourceType) => {
    setState((prev) => {
      if (type === 'collection') {
        const first = collectionOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, collectionId: String(first?.data ?? ''), filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
      }
      if (type === 'tab') {
        const first = tabOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, tab: String(first?.data ?? 'all') }
      }
      if (type === 'external') {
        const first = externalOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, externalSourceId: String(first?.data ?? '') }
      }
      return { ...prev, sourceType: type, filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
    })
    if (type !== 'filter' && activeTab === 'filters') setActiveTab('source')
  }

  const changeFilterGroup = (group: FilterGroup) => {
    setState((prev) => ({ ...prev, filterGroup: group }))
  }

  const setCollection = (value: string) => {
    const selected = collectionOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, collectionId: value, title: String(selected?.label ?? prev.title) }))
  }
  const setPlatformTab = (value: string) => {
    const selected = tabOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, tab: value, title: String(selected?.label ?? prev.title) }))
  }
  const handleSave = () => {
    closeModal?.();
    (async () => {
      const title = state.title.trim() || t('newShelf');
      const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual'
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightedAppIds: (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined, manualOrder: (isManualSort && state.manualOrder.length) ? state.manualOrder : undefined, manualBaseSort: (isManualSort && state.manualBaseSort !== 'alphabetical') ? state.manualBaseSort : undefined, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames, hideInstallIndicator: state.hideInstallIndicator };
      if (state.sourceType === 'collection') { patch.source = { type: 'collection', collectionId: state.collectionId }; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else if (state.sourceType === 'tab') {
        const selectedTab = platformTabs.find((pt) => pt.id === state.tab)
        patch.source = selectedTab?.source ?? { type: 'tab', tab: state.tab };
        patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined;
      }
      else if (state.sourceType === 'external') { patch.source = { type: 'external', sourceId: state.externalSourceId }; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else patch.source = { type: 'filter', filter: filterGroupToFilter(state.filterGroup, state.filter.sort) };
      const ok = await actions.patchShelf(shelf.id, patch);
      logInfo("SETTINGS", "shelf updated", { shelfId: shelf.id, success: ok });
    })();
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
          <div style={{ position: 'relative', height: 'min(calc(100vh - 220px), 720px)', minHeight: 360, overflow: 'hidden' }}>
          <Tabs
            activeTab={activeTab}
            onShowTab={(id: string) => setActiveTab(id as EditTab)}
            tabs={[
              {
                id: 'source',
                title: t('edit_tab_source'),
                content: (
                  <FieldContainer scrollable>
                    <DropdownItem label={t('source')} rgOptions={sourceTypeOptions} selectedOption={state.sourceType} onChange={(opt: unknown) => changeSourceType(String(optionData(opt)) as SourceType)} bottomSeparator='thick' />
                    {state.sourceType === 'collection' && (
                      <DropdownItem label={t('source_collection')} rgOptions={collectionOptionsFinal} selectedOption={collectionSelected} onChange={(opt: unknown) => setCollection(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'tab' && (
                      <DropdownItem label={t('source_tab')} rgOptions={tabOptionsFinal} selectedOption={tabSelected} onChange={(opt: unknown) => setPlatformTab(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'external' && externalOptions.length > 0 && (
                      <DropdownItem label={t('source_external')} rgOptions={externalOptionsFinal} selectedOption={externalSelected} onChange={(opt: unknown) => setState((prev) => ({ ...prev, externalSourceId: String(optionData(opt)) }))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'filter'
                      ? <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.filter.sort ?? 'alphabetical'} onChange={(opt: unknown) => setState((prev) => ({ ...prev, filter: { ...prev.filter, sort: String(optionData(opt)) as ShelfFilter['sort'] } }))} bottomSeparator='thick' />
                      : <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.sort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, sort: String(optionData(opt)) }))} bottomSeparator='thick' />
                    }
                    {isManualSort && (
                      <DropdownItem label={t('manual_base_sort')} rgOptions={baseSortOptions} selectedOption={state.manualBaseSort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, manualBaseSort: String(optionData(opt)) }))} bottomSeparator='thick' />
                    )}
                    <SliderField
                      label={`${t('limit')} (${state.limit})`}
                      value={state.limit}
                      min={1}
                      max={40}
                      step={1}
                      bottomSeparator='thick'
                      onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))}
                    />
                    {isManualSort && (
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
              ...(state.sourceType === 'filter' ? [{
                id: 'filters',
                // Decky's Tab.title is typed `string` but Steam's underlying
                // Tabs component renders any ReactNode — cast lets us inline
                // a leading icon next to the label text.
                title: (<TabLabel icon={<FunnelIcon />} text={t('edit_tab_filters')} />) as unknown as string,
                content: (
                  <FieldContainer>
                    <SavedFiltersBar
                      controller={controller}
                      currentGroup={state.filterGroup}
                      onApply={changeFilterGroup}
                    />
                    <FilterPanel group={state.filterGroup} onChange={changeFilterGroup} />
                  </FieldContainer>
                ),
              }] : []),
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
                title: (<TabLabel icon={<EyeIcon />} text={t('edit_tab_display')} />) as unknown as string,
                content: (
                  <DisplayTabContent
                    t={t}
                    display={{ hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge, hideShelfTitle: state.hideShelfTitle, hideGameNames: state.hideGameNames === true, hideInstallIndicator: state.hideInstallIndicator === true }}
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
