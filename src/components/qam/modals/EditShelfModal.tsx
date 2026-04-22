import { useEffect, useMemo, useState } from 'react'
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
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../../../domain/settings'
import { FilterPanel } from '../../FilterPanel'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds } from '../../../steam'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'

type SourceType = 'collection' | 'tab' | 'filter' | 'external'
type EditTab = 'source' | 'filters' | 'visual' | 'display'

const BASE_SOURCE_TYPES: SourceType[] = ['collection', 'tab', 'filter']

const SORT_OPTIONS = [
  { value: 'alphabetical', labelKey: 'sort_alpha' },
  { value: 'recent', labelKey: 'sort_recent' },
  { value: 'playtime', labelKey: 'sort_playtime' },
  { value: 'release_date', labelKey: 'sort_release_date' },
  { value: 'size_on_disk', labelKey: 'sort_size_on_disk' },
  { value: 'metacritic', labelKey: 'sort_metacritic' },
  { value: 'review_score', labelKey: 'sort_review_score' },
  { value: 'added', labelKey: 'sort_added' },
  { value: 'random', labelKey: 'sort_random' },
] as const

type EditableShelfState = {
  title: string
  sourceType: SourceType
  collectionId: string
  tab: string
  externalSourceId: string
  filter: ShelfFilter
  filterGroup: FilterGroup
  sort: string
  limit: number
  matchNativeSize: boolean
  highlightFirst: boolean
  highlightAll: boolean
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
}

import { textFromDeckyChange } from './modalUtils'

function optionData(option: unknown) {
  return (option as any)?.data ?? option
}

export function EditShelfModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  const { t, tabs: platformTabs, collections, actions } = controller
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
    limit: shelf.limit,
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    highlightAll: shelf.highlightAll ?? false,
    hideStatusLine: shelf.hideStatusLine ?? false,
    hideNewBadge: shelf.hideNewBadge ?? false,
    hideCompatIcons: shelf.hideCompatIcons ?? false,
    hideNonSteamBadge: shelf.hideNonSteamBadge ?? false,
  })
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditTab>('source')

  const previewSource = useMemo(() => {
    if (state.sourceType === 'collection') return { type: 'collection' as const, collectionId: state.collectionId }
    if (state.sourceType === 'tab') return { type: 'tab' as const, tab: state.tab }
    if (state.sourceType === 'external') return { type: 'external' as const, sourceId: state.externalSourceId }
    const effectiveFilter = filterGroupToFilter(state.filterGroup, state.filter.sort)
    return { type: 'filter' as const, filter: effectiveFilter }
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort])

  useEffect(() => {
    let cancelled = false
    setPreviewCount(null)
    const timer = setTimeout(() => {
      resolveShelfAppIds(previewSource, state.limit)
        .then((ids) => { if (!cancelled) setPreviewCount(ids.length) })
        .catch(() => { if (!cancelled) setPreviewCount(0) })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [previewSource, state.limit])

  const allSourceTypes: SourceType[] = externalSources.length > 0 ? [...BASE_SOURCE_TYPES, 'external'] : BASE_SOURCE_TYPES
  const sourceTypeOptions: SingleDropdownOption[] = allSourceTypes.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') : value === 'tab' ? t('source_tab') : value === 'external' ? t('source_external') : t('source_filter'),
  }))
  const tabOptions: SingleDropdownOption[] = platformTabs.map((item) => ({ data: item.id, label: item.name }))
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
  const externalOptions: SingleDropdownOption[] = externalSources.map((src) => ({ data: src.id, label: src.displayName }))
  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.map((item) => ({ data: item.value, label: t(item.labelKey) })),
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
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge };
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
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        bAllowFullSize
        onCancel={closeModal}
        onEscKeypress={closeModal}
        strTitle={`${t('editing')}: ${shelf.title}`}
        onOK={handleSave}
        strOKButtonText={t('save')}
      >
        <Focusable onMenuButton={handleSave} onMenuActionDescription={t('save')} style={{ paddingBottom: 56 }}>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <Field
              description={
                <>
                  <div style={{ paddingBottom: '6px' }}>{t('title')}</div>
                  <TextField
                    value={state.title}
                    onChange={(value: unknown) => setState((prev) => ({ ...prev, title: textFromDeckyChange(value) }))}
                  />
                </>
              }
            />
          </div>
          <div style={{ padding: '0 16px 8px', fontSize: '12px', color: previewCount === 0 ? '#f59e0b' : '#8b949e' }}>
            {previewCount === null ? t('preview_loading') : previewCount === 0 ? `⚠️ ${t('preview_empty')}` : t('preview_count', { count: previewCount })}
          </div>
          <div style={{ position: 'relative', height: 320, overflow: 'hidden' }}>
          <Tabs
            activeTab={activeTab}
            onShowTab={(id: string) => setActiveTab(id as EditTab)}
            tabs={[
              {
                id: 'source',
                title: t('edit_tab_source'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px' }}>
                    <DropdownItem label={t('source')} rgOptions={sourceTypeOptions} selectedOption={state.sourceType} onChange={(opt: unknown) => changeSourceType(String(optionData(opt)) as SourceType)} bottomSeparator='thick' />
                    {state.sourceType === 'collection' && (
                      <DropdownItem label={t('source_collection')} rgOptions={collectionOptions} selectedOption={state.collectionId} onChange={(opt: unknown) => setCollection(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'tab' && (
                      <DropdownItem label={t('source_tab')} rgOptions={tabOptions} selectedOption={state.tab} onChange={(opt: unknown) => setPlatformTab(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'external' && externalOptions.length > 0 && (
                      <DropdownItem label={t('source_external')} rgOptions={externalOptions} selectedOption={state.externalSourceId} onChange={(opt: unknown) => setState((prev) => ({ ...prev, externalSourceId: String(optionData(opt)) }))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'filter'
                      ? <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.filter.sort ?? 'alphabetical'} onChange={(opt: unknown) => setState((prev) => ({ ...prev, filter: { ...prev.filter, sort: String(optionData(opt)) as ShelfFilter['sort'] } }))} bottomSeparator='thick' />
                      : <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.sort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, sort: String(optionData(opt)) }))} bottomSeparator='thick' />
                    }
                    <Field label={`${t('limit')} (${state.limit})`}>
                      <SliderField label='' value={state.limit} min={1} max={40} step={1} onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))} />
                    </Field>
                  </div>
                ),
              },
              ...(state.sourceType === 'filter' ? [{
                id: 'filters',
                title: t('edit_tab_filters'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px' }}>
                    <FilterPanel group={state.filterGroup} onChange={changeFilterGroup} />
                  </div>
                ),
              }] : []),
              {
                id: 'visual',
                title: t('edit_tab_visual'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px' }}>
                    <ToggleField label={t('match_native_size')} checked={state.matchNativeSize} onChange={(value: boolean) => setState((prev) => ({ ...prev, matchNativeSize: value }))} />
                    <ToggleField label={t('highlight_first')} checked={state.highlightFirst} onChange={(value: boolean) => setState((prev) => ({ ...prev, highlightFirst: value }))} />
                    <ToggleField label={t('highlight_all')} checked={state.highlightAll} onChange={(value: boolean) => setState((prev) => ({ ...prev, highlightAll: value }))} />
                  </div>
                ),
              },
              {
                id: 'display',
                title: t('edit_tab_display'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px' }}>
                    <ToggleField label={t('hide_status_line')} checked={state.hideStatusLine} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideStatusLine: value }))} />
                    <ToggleField label={t('hide_new_badge')} checked={state.hideNewBadge} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideNewBadge: value }))} />
                    <ToggleField label={t('hide_compat_icons')} checked={state.hideCompatIcons} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideCompatIcons: value }))} />
                    {hasNonSteamBadges && (
                      <ToggleField label={t('hide_non_steam_badge')} checked={state.hideNonSteamBadge} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideNonSteamBadge: value }))} />
                    )}
                  </div>
                ),
              },
            ]}
          />
          </div>
        </Focusable>
      </ConfirmModal>
    </div>
  )
}
