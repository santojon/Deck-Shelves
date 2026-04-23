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
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../../../domain/settings'
import { FilterPanel } from '../../FilterPanel'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds } from '../../../steam'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { ChevronIcon } from '../../filter/utils'
import { getLandscapeUrls, getPortraitFallbacks } from '../../../core/steamAssets'

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
  highlightedAppIds: number[]
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
}

import { textFromDeckyChange } from './modalUtils'

function optionData(option: unknown) {
  return (option as any)?.data ?? option
}

function HighlightMiniCard({
  appid, name, portraitUrl, heroUrl, selected, width, height, onToggle,
}: {
  appid: number; name: string; portraitUrl?: string; heroUrl?: string;
  selected: boolean; width: number; height: number; onToggle: () => void;
}) {
  const urls = useMemo(() => {
    const list: string[] = []
    if (selected && appid > 0) {
      for (const u of getLandscapeUrls(appid)) list.push(u)
      if (heroUrl && !list.includes(heroUrl)) list.push(heroUrl)
    } else {
      if (appid > 0) {
        list.push(`/customimages/${appid}p.png`)
        list.push(`/customimages/${appid}p.jpg`)
      }
      if (portraitUrl && !list.includes(portraitUrl)) list.push(portraitUrl)
      if (heroUrl && !list.includes(heroUrl)) list.push(heroUrl)
      if (appid > 0) {
        for (const u of getPortraitFallbacks(appid)) if (!list.includes(u)) list.push(u)
      }
    }
    return list
  }, [appid, portraitUrl, heroUrl, selected])

  const imgRef = useRef<HTMLImageElement>(null)
  const idxRef = useRef(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    idxRef.current = 0
    setFailed(false)
    if (imgRef.current && urls[0]) imgRef.current.src = urls[0]
  }, [urls])

  const onErr = () => {
    idxRef.current += 1
    if (imgRef.current && idxRef.current < urls.length) imgRef.current.src = urls[idxRef.current]
    else setFailed(true)
  }

  return (
    <Focusable
      onClick={onToggle}
      onOKButton={onToggle}
      style={{
        width, minWidth: width, height, flexShrink: 0,
        overflow: 'hidden', cursor: 'pointer',
        background: 'linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))',
        outline: selected ? '2px solid #4caf50' : '1px solid rgba(255,255,255,0.12)',
        transition: 'width 0.15s ease',
        position: 'relative',
        borderRadius: 0,
      }}
    >
      {failed || !urls[0] ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: selected ? 16 : 6, boxSizing: 'border-box', textAlign: 'center' }}>
          <span style={{ fontSize: selected ? 12 : 10, opacity: 0.6, wordBreak: 'break-word', lineHeight: 1.3 }}>{name}</span>
        </div>
      ) : (
        <img ref={imgRef} src={urls[0]} alt={name} loading='lazy' onError={onErr} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {selected && (
        <div style={{ position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: '50%', background: '#4caf50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.6)' }} aria-hidden='true'>✓</div>
      )}
    </Focusable>
  )
}

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
    limit: shelf.limit,
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    highlightAll: shelf.highlightAll ?? false,
    highlightedAppIds: shelf.highlightedAppIds ?? [],
    hideStatusLine: shelf.hideStatusLine ?? false,
    hideNewBadge: shelf.hideNewBadge ?? false,
    hideCompatIcons: shelf.hideCompatIcons ?? false,
    hideNonSteamBadge: shelf.hideNonSteamBadge ?? false,
  })
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditTab>('source')
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>>(new Map())
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf.highlightedAppIds?.length ?? 0) > 0)
  const [highlightListExpanded, setHighlightListExpanded] = useState(false)

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
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightedAppIds: state.highlightedAppIds.length ? state.highlightedAppIds : undefined, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge };
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
                    <ToggleField
                      label={t('highlight_specific_games')}
                      checked={highlightPickerOpen}
                      onChange={(value: boolean) => {
                        setHighlightPickerOpen(value)
                        if (!value) {
                          setHighlightListExpanded(false)
                          setState((prev) => ({ ...prev, highlightedAppIds: [] }))
                        }
                      }}
                    />
                    {highlightPickerOpen && (
                      <div style={{ width: '100%', padding: 0, margin: 0 }}>
                        <Focusable onClick={() => setHighlightListExpanded((v) => !v)} onOKButton={() => setHighlightListExpanded((v) => !v)}>
                          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '8px 0', marginLeft: -24, marginRight: -24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                              {t('highlight_games_list')}
                              {state.highlightedAppIds.length > 0 && (
                                <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>({state.highlightedAppIds.length})</span>
                              )}
                            </div>
                            <div style={{ flexGrow: 1, height: 1, background: 'rgba(255,255,255,0.2)' }} />
                            <ChevronIcon open={highlightListExpanded} />
                          </div>
                        </Focusable>
                        {highlightListExpanded && (
                          resolvedIds.length === 0 ? (
                            <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
                          ) : (
                            <Focusable style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 0', width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
                              {resolvedIds.map((id) => {
                                const checked = state.highlightedAppIds.includes(id)
                                const toggle = () => setState((prev) => ({
                                  ...prev,
                                  highlightedAppIds: prev.highlightedAppIds.includes(id)
                                    ? prev.highlightedAppIds.filter((x) => x !== id)
                                    : [...prev.highlightedAppIds, id],
                                }))
                                const meta = resolvedMeta.get(id)
                                const h = 84
                                const w = checked ? 180 : 56
                                return (
                                  <HighlightMiniCard
                                    key={id}
                                    appid={id}
                                    name={meta?.name ?? `App ${id}`}
                                    portraitUrl={meta?.portraitUrl}
                                    heroUrl={meta?.heroUrl}
                                    selected={checked}
                                    width={w}
                                    height={h}
                                    onToggle={toggle}
                                  />
                                )
                              })}
                            </Focusable>
                          )
                        )}
                      </div>
                    )}
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
