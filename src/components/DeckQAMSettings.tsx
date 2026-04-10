import React, { useEffect, useMemo, useState } from 'react'
import {
  ConfirmModal,
  DialogButton,
  DropdownItem,
  Field,
  Focusable,
  Menu,
  MenuItem,
  PanelSection,
  ReorderableEntry,
  ReorderableList,
  SingleDropdownOption,
  SliderField,
  TextField,
  ToggleField,
  gamepadDialogClasses,
  showContextMenu,
  showModal,
} from '@decky/ui'
import { openFilePicker, toaster } from '@decky/api'
import { getMountFailed, getMountError, resetMountFailed } from '../runtime/homePatch'
import type { SettingsController } from '../features/settings/controller'
import type { FilterGroup, Shelf, ShelfFilter } from '../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../domain/settings'
import { FilterPanel } from './FilterPanel'
import { importSettingsFromFile, exportSettingsToFile } from '../settingsStore'
import { DeckModalStyles } from './styles/DeckModalStyles'
import { DeckQAMStyles } from './styles/DeckQAMStyles'
import { logInfo } from '../runtime/logger'
import { resolveShelfAppIds, findTabMasterContextValue } from '../steam'
import { extractTabMasterTabsForImport, tabContainerToShelfSource, isTabMasterInstalled, getTabMasterTabsFromSettingsFile } from '../integrations'
import { SHELF_TEMPLATES } from '../domain/templates'
import { getExternalSources } from '../core/pluginApi'

import { icons } from './qam/icons'

type EntryData = { id: string }
type SourceType = 'collection' | 'tab' | 'filter' | 'external'
const SORT_OPTIONS = [
  { value: 'alphabetical', labelKey: 'sort_alpha' },
  { value: 'recent', labelKey: 'sort_recent' },
  { value: 'playtime', labelKey: 'sort_playtime' },
  { value: 'release_date', labelKey: 'sort_release_date' },
  { value: 'size_on_disk', labelKey: 'sort_size_on_disk' },
  { value: 'metacritic', labelKey: 'sort_metacritic' },
  { value: 'review_score', labelKey: 'sort_review_score' },
  { value: 'added', labelKey: 'sort_added' },
] as const

function textFromDeckyChange(value: unknown): string {
  if (typeof value === 'string') return value
  const maybe = (value as any)?.target?.value ?? (value as any)?.currentTarget?.value ?? (value as any)?.value ?? value
  return typeof maybe === 'string' ? maybe : ''
}

function optionData(option: unknown) {
  return (option as any)?.data ?? option
}

function filenameWithJson(name: string) {
  const base = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').replace(/-+/g, '-') || 'deck-shelves'
  return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
}

function pickerPath(result: unknown): string {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return pickerPath(result[0])
  const maybe = result as any
  return String(maybe?.realpath ?? maybe?.path ?? maybe?.strPath ?? maybe?.filepath ?? maybe?.file_path ?? maybe?.selectedPath ?? '')
}

async function tryPickerCalls(calls: Array<() => Promise<unknown>>): Promise<string> {
  for (const fn of calls) {
    try {
      const value = pickerPath(await fn())
      if (value) return value
    } catch {
      // swallow and try next signature
    }
  }
  return ''
}

async function pickFolder(startPath: string) {
  // Avoid ambient const enums, use numeric values directly
  return await tryPickerCalls([
    async () => openFilePicker(1, startPath, false, true, undefined, undefined, false, false), // FOLDER = 1
    async () => openFilePicker(1, startPath),
    // Removed invalid call with object, only use valid signatures
  ])
}

async function pickJsonFile(startPath: string) {
  // FILE = 0
  return await tryPickerCalls([
    async () => openFilePicker(0, startPath, true, true, undefined, ['json'], false, false),
    async () => openFilePicker(0, startPath),
    // Removed invalid call with object, only use valid signatures
  ])
}

function openManagedModal(render: (close: () => void) => React.ReactElement) {
  let handle: any = null
  const close = () => {
    try {
      if (typeof handle === 'function') return handle()
      if (handle?.Close) return handle.Close()
      if (handle?.closeModal) return handle.closeModal()
      if (handle?.props?.closeModal) return handle.props.closeModal()
    } catch (e) { logInfo("SETTINGS", "modal close failed", String(e)) }
  }
  handle = showModal(render(close))
  return close
}

function ActionButton({ iconNode, onClick, okDescription }: { iconNode: React.ReactNode; onClick: () => void; okDescription: string }) {
  return (
    <Focusable className='deck-shelves-action-btn'>
      <DialogButton
        style={{
          height: '40px',
          width: '42px',
          minWidth: 0,
          padding: '10px 12px',
          marginLeft: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onClick={onClick}
        onOKButton={onClick}
        onOKActionDescription={okDescription}
      >
        {iconNode}
      </DialogButton>
    </Focusable>
  )
}

function ShelfListLabel({ shelf }: { shelf: Shelf }) {
  return (
    <div className={`deck-shelves-label-cont ${shelf.hidden ? 'deck-shelves-hidden' : ''}`}>
      <span className='deck-shelves-hidden-icon'>{shelf.hidden ? icons.eyeClosed : icons.eyeOpen}</span>
      <span className='deck-shelves-label-text'>{shelf.title}</span>
    </div>
  )
}

function DeleteConfirmModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  const { t, actions } = controller

  return (
    <ConfirmModal
      strTitle={t('deleteShelf')}
      strDescription={shelf.title}
      strOKButtonText={t('deleteShelf')}
      strCancelButtonText={t('cancel')}
      bDestructiveWarning
      onCancel={closeModal}
      onEscKeypress={closeModal}
      onOK={() => {
        closeModal?.();
        (async () => {
          const ok = await actions.removeShelf(shelf.id);
          logInfo("SETTINGS", "shelf deleted", { shelfId: shelf.id, success: ok });
        })();
      }}
    />
  )
}

function showDeleteConfirm(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <DeleteConfirmModal closeModal={close} controller={controller} shelf={shelf} />)
}

type ExportModalProps = {
  closeModal?: () => void
  controller: SettingsController
  folderPath: string
}

function ExportModal({ closeModal, controller, folderPath }: ExportModalProps) {
  const { t } = controller
  const [name, setName] = useState('deck-shelves')
  const [folder, setFolder] = useState(folderPath)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('export_settings')}
        strDescription={folder}
        strOKButtonText={saveBusy ? t('loading') : t('save')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          closeModal?.();
          setSaveBusy(true);
          (async () => {
            try {
              const target = `${folder}/${filenameWithJson(name)}`;
              const ok = await exportSettingsToFile(target);
              toaster.toast({ title: t('pluginName'), body: ok ? `${t('toast_exported_file')}: ${target}` : t('toast_failed_export') });
            } catch (error) {
              toaster.toast({ title: t('pluginName'), body: String(error) });
            } finally {
              setSaveBusy(false);
            }
          })();
        }}
      >
        <Focusable>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <Field description={<><div style={{ paddingBottom: '6px' }}>{t('file_name')}</div><div className='deck-shelves-extra-wide-field deck-shelves-filter-text-field'><TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} /></div></>} />
            <Field description={<><div style={{ paddingBottom: '6px' }}>{t('folder_label')}</div><div className='deck-shelves-extra-wide-field deck-shelves-filter-text-field'><TextField value={folder} onChange={(value: unknown) => setFolder(textFromDeckyChange(value))} /></div></>} />
            <div style={{ paddingTop: '10px' }}>
              <DialogButton
                onClick={async () => {
                  setBrowseBusy(true)
                  try {
                    const picked = await pickFolder(folder)
                    if (picked) setFolder(picked)
                  } catch (error) {
                    toaster.toast({ title: t('pluginName'), body: String(error) })
                  } finally {
                    setBrowseBusy(false)
                  }
                }}
              >{browseBusy ? t('loading') : t('browse')}</DialogButton>
            </div>
          </div>
        </Focusable>
      </ConfirmModal>
    </div>
  )
}

function ImportFromCustomFiltersModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
    const { t, actions } = controller
    const [tabs, setTabs] = React.useState<{ id: string; title: string; source?: any }[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)

  useEffect(() => {
    const loadTabs = async () => {
      setLoading(true)
      setError(null)
      // Primary: read TabMaster's settings.json via our own backend.
      // TabMaster exposes NO React context and NO inter-plugin IPC — the settings
      // file is the only reliable source of tab data.
      try {
        const entries = await getTabMasterTabsFromSettingsFile()
        if (entries.length > 0) {
          setTabs(entries.map((t) => ({
            id: t.id,
            title: t.title,
            source: t.filters && t.filters.length > 0
              ? tabContainerToShelfSource({ id: t.id, title: t.title, filters: t.filters })
              : { type: 'tab', tab: t.id },
          })))
          setLoading(false)
          return
        }
      } catch (e) {
        logInfo("SETTINGS", "TabMaster settings file read failed, trying fiber fallback", String(e))
      }

      // Fallback: React fiber traversal + globals (kept for forward-compatibility
      // in case a future TabMaster version exposes a React context).
      let manager: any = null
      try {
        const ctx = findTabMasterContextValue()
        if (ctx && (Array.isArray(ctx.visibleTabsList) || ctx.tabsMap instanceof Map)) manager = ctx
      } catch (e) { logInfo("SETTINGS", "TabMaster context lookup failed", String(e)) }
      if (!manager) {
        try {
          const gm = (globalThis as any)
          for (const k of Object.keys(gm)) {
            const v = gm[k]
            if (v && (Array.isArray(v?.visibleTabsList) || v?.tabsMap instanceof Map)) { manager = v; break }
          }
        } catch (e) { logInfo("SETTINGS", "TabMaster global scan failed", String(e)) }
      }
      if (manager) {
        try {
          const extracted = extractTabMasterTabsForImport(manager)
          if (extracted.length > 0) {
            setTabs(extracted.map((t: any) => ({ id: t.id, title: t.title, source: t.source })))
            setLoading(false)
            return
          }
        } catch (e) { logInfo("SETTINGS", "TabMaster extraction failed", String(e)) }
      }

      // All sources failed
      setLoading(false)
      setError(t('toast_failed_import'))
    }
    loadTabs()
  }, [])

  const doImport = async (entry: { id: string; title: string; source?: any }) => {
    try {
      const src = entry.source ?? { type: 'tab', tab: entry.id }
      const shelfSource = (src.type === 'tab' || src.type === 'collection' || src.type === 'filter') ? src : tabContainerToShelfSource(src)
      await actions.addShelfWith(entry.title, shelfSource)
      toaster.toast({ title: t('pluginName'), body: `${t('toast_imported')}: ${entry.title}` })
      closeModal?.()
    } catch (e) {
      toaster.toast({ title: t('pluginName'), body: String(e) })
    }
  }

  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('import_from_tabmaster')}
        strDescription={t('import_from_tabmaster_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <div style={{ padding: 8 }}>
          {loading ? (
            <div>{t('loading')}</div>
          ) : error && tabs.length === 0 ? (
            <div style={{ color: '#f59e0b' }}>{error}</div>
          ) : tabs.length === 0 ? (
            <div>{t('no_tabmaster_tabs')}</div>
          ) : (
            <div>
              {tabs.map((tab) => (
                <Field key={tab.id} label={tab.title}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DialogButton onClick={() => doImport(tab)} onOKButton={() => doImport(tab)} onOKActionDescription={t('import')}>{t('import')}</DialogButton>
                  </div>
                </Field>
              ))}
            </div>
          )}
        </div>
      </ConfirmModal>
    </div>
  )
}

type ImportModalProps = {
  closeModal?: () => void
  controller: SettingsController
  initialPath: string
}

function ImportModal({ closeModal, controller, initialPath }: ImportModalProps) {
  const { t } = controller
  const [path, setPath] = useState(initialPath)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('import_settings')}
        strDescription={path}
        strOKButtonText={importBusy ? t('loading') : t('import_settings')}
        strCancelButtonText={t('cancel')}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={() => {
          closeModal?.();
          setImportBusy(true);
          (async () => {
            try {
              const next = await importSettingsFromFile(path);
              if (next.shelves[0]?.id) controller.actions.selectShelf(next.shelves[0].id);
              toaster.toast({ title: t('pluginName'), body: next ? `${t('toast_imported')}: ${path}` : t('toast_failed_save') });
            } catch (error) {
              toaster.toast({ title: t('pluginName'), body: String(error) });
            } finally {
              setImportBusy(false);
            }
          })();
        }}
      >
        <Focusable>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <Field description={<><div style={{ paddingBottom: '6px' }}>{t('file_name')}</div><div className='deck-shelves-extra-wide-field deck-shelves-filter-text-field'><TextField value={path} onChange={(value: unknown) => setPath(textFromDeckyChange(value))} /></div></>} />
            <div style={{ paddingTop: '10px' }}>
              <DialogButton
                onClick={async () => {
                  setBrowseBusy(true)
                  try {
                    const picked = await pickJsonFile(initialPath)
                    if (picked) setPath(picked)
                  } catch (error) {
                    toaster.toast({ title: t('pluginName'), body: String(error) })
                  } finally {
                    setBrowseBusy(false)
                  }
                }}
              >{browseBusy ? t('loading') : t('browse')}</DialogButton>
            </div>
          </div>
        </Focusable>
      </ConfirmModal>
    </div>
  )
}

type EditableShelfState = {
  title: string
  sourceType: SourceType
  collectionId: string
  tab: string
  externalSourceId: string
  filter: ShelfFilter
  filterGroup: FilterGroup
  limit: number
  matchNativeSize: boolean
  highlightFirst: boolean
  hideStatusLine: boolean
}

type EditShelfModalProps = {
  closeModal?: () => void
  controller: SettingsController
  shelf: Shelf
}

function EditShelfModal({ closeModal, controller, shelf }: EditShelfModalProps) {
  const { t, tabs, collections, actions } = controller
  const externalSources = useMemo(() => getExternalSources(), [])
  const initialSourceType = shelf.source.type as SourceType
  const initialFilter = normalizeFilter(shelf.source)
  const initialFilterGroup = getEffectiveFilterGroup(initialFilter)
  const [state, setState] = useState<EditableShelfState>({
    title: shelf.title,
    sourceType: initialSourceType,
    collectionId: shelf.source.type === 'collection' ? shelf.source.collectionId : String(collections[0]?.id ?? ''),
    tab: shelf.source.type === 'tab' ? shelf.source.tab : String(tabs[0]?.id ?? 'all'),
    externalSourceId: shelf.source.type === 'external' ? shelf.source.sourceId : (externalSources[0]?.id ?? ''),
    filter: initialFilter,
    filterGroup: initialFilterGroup,
    limit: shelf.limit,
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    hideStatusLine: shelf.hideStatusLine ?? false,
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)

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

  const baseSourceTypes: SourceType[] = ['collection', 'tab', 'filter']
  const allSourceTypes: SourceType[] = externalSources.length > 0 ? [...baseSourceTypes, 'external'] : baseSourceTypes
  const sourceTypeOptions: SingleDropdownOption[] = allSourceTypes.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') : value === 'tab' ? t('source_tab') : value === 'external' ? t('source_external') : t('source_filter'),
  }))
  const tabOptions: SingleDropdownOption[] = tabs.map((item) => ({ data: item.id, label: item.name }))
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
  const externalOptions: SingleDropdownOption[] = externalSources.map((src) => ({ data: src.id, label: src.displayName }))
  const sortOptions: SingleDropdownOption[] = SORT_OPTIONS.map((item) => ({ data: item.value, label: t(item.labelKey) }))

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
  }

  const changeFilterGroup = (group: FilterGroup) => {
    setState((prev) => ({ ...prev, filterGroup: group }))
  }

  const setCollection = (value: string) => {
    const selected = collectionOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, collectionId: value, title: String(selected?.label ?? prev.title) }))
  }
  const setTab = (value: string) => {
    const selected = tabOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, tab: value, title: String(selected?.label ?? prev.title) }))
  }
  const handleSave = () => {
    closeModal?.();
    (async () => {
      const title = state.title.trim() || t('newShelf');
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst };
      if (typeof state.hideStatusLine === 'boolean') patch.hideStatusLine = state.hideStatusLine;
      if (state.sourceType === 'collection') patch.source = { type: 'collection', collectionId: state.collectionId };
      else if (state.sourceType === 'tab') {
        const selectedTab = tabs.find((t) => t.id === state.tab)
        patch.source = selectedTab?.source ?? { type: 'tab', tab: state.tab }
      }
      else if (state.sourceType === 'external') patch.source = { type: 'external', sourceId: state.externalSourceId };
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
        <Focusable onMenuButton={handleSave} onMenuActionDescription={t('save')}>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <Field
              description={
                <>
                  <div style={{ paddingBottom: '6px' }}>{t('title')}</div>
                  <TextField
                    value={state.title}
                    // Decky TextField may not support placeholder, so use description above
                    onChange={(value: unknown) => setState((prev) => ({ ...prev, title: textFromDeckyChange(value) }))}
                  />
                </>
              }
            />
          </div>
          <div style={{ padding: '0 16px 10px', fontSize: '12px', color: previewCount === 0 ? '#f59e0b' : '#8b949e' }}>
            {previewCount === null ? t('preview_loading') : previewCount === 0 ? `⚠️ ${t('preview_empty')}` : t('preview_count', { count: previewCount })}
          </div>
          <div className='field-item-container'>
            <DropdownItem label={t('source')} rgOptions={sourceTypeOptions} selectedOption={state.sourceType} onChange={(opt: unknown) => changeSourceType(String(optionData(opt)) as SourceType)} bottomSeparator='thick' />
            {state.sourceType === 'collection' ? (
              <DropdownItem label={t('source_collection')} rgOptions={collectionOptions} selectedOption={state.collectionId} onChange={(opt: unknown) => setCollection(String(optionData(opt)))} bottomSeparator='thick' />
            ) : null}
            {state.sourceType === 'tab' ? (
              <DropdownItem label={t('source_tab')} rgOptions={tabOptions} selectedOption={state.tab} onChange={(opt: unknown) => setTab(String(optionData(opt)))} bottomSeparator='thick' />
            ) : null}
            {state.sourceType === 'external' && externalOptions.length > 0 ? (
              <DropdownItem label={t('source_external')} rgOptions={externalOptions} selectedOption={state.externalSourceId} onChange={(opt: unknown) => setState((prev) => ({ ...prev, externalSourceId: String(optionData(opt)) }))} bottomSeparator='thick' />
            ) : null}
            {state.sourceType === 'filter' ? (
              <>
                <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.filter.sort ?? 'alphabetical'} onChange={(opt: unknown) => setState((prev) => ({ ...prev, filter: { ...prev.filter, sort: String(optionData(opt)) as ShelfFilter['sort'] } }))} bottomSeparator='thick' />
                <div style={{ padding: '4px 0' }}>
                  <FilterPanel group={state.filterGroup} onChange={changeFilterGroup} />
                </div>
              </>
            ) : null}
            <Field label={`${t('limit')} (${state.limit})`}>
              <SliderField label='' value={state.limit} min={1} max={40} step={1} onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))} />
            </Field>
            <div style={{ paddingLeft: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ToggleField label={t('match_native_size')} checked={state.matchNativeSize} onChange={(value: boolean) => setState((prev) => ({ ...prev, matchNativeSize: value }))} />
              <ToggleField label={t('highlight_first')} checked={state.highlightFirst} onChange={(value: boolean) => setState((prev) => ({ ...prev, highlightFirst: value }))} />
              <ToggleField label={t('hide_status_line')} checked={state.hideStatusLine} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideStatusLine: value }))} />
            </div>
          </div>
        </Focusable>
      </ConfirmModal>
    </div>
  )
}

function showEditShelfModal(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={shelf} />)
}

function TemplatePickerModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t, actions } = controller
  const handleTemplate = async (tpl: typeof SHELF_TEMPLATES[0]) => {
    closeModal?.()
    await actions.addShelfWith(t(tpl.titleKey as any), tpl.source)
  }
  const handleBlank = async () => {
    closeModal?.()
    await actions.addShelf()
  }
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        strTitle={t('template_picker_title')}
        strDescription={t('template_picker_desc')}
        strOKButtonText={t('close')}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <div style={{ padding: 8 }}>
          {SHELF_TEMPLATES.map((tpl) => (
            <Field key={tpl.id} label={t(tpl.titleKey as any)}>
              <DialogButton
                onClick={() => handleTemplate(tpl)}
                onOKButton={() => handleTemplate(tpl)}
                onOKActionDescription={t('addShelf')}
              >{t('addShelf')}</DialogButton>
            </Field>
          ))}
          <Field label={t('template_blank')}>
            <DialogButton
              onClick={handleBlank}
              onOKButton={handleBlank}
              onOKActionDescription={t('addShelf')}
            >{t('addShelf')}</DialogButton>
          </Field>
        </div>
      </ConfirmModal>
    </div>
  )
}

function FirstRunBanner({ controller }: { controller: SettingsController }) {
  const { t, actions } = controller
  return (
    <div style={{ margin: '12px 0', padding: '12px 16px', background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t('first_run_title')}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>{t('first_run_desc')}</div>
      <Focusable style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <DialogButton
          onClick={() => actions.createDefaultShelves()}
          onOKButton={() => actions.createDefaultShelves()}
          onOKActionDescription={t('first_run_create_defaults')}
          style={{ flex: 1, minWidth: 0 }}
        >{t('first_run_create_defaults')}</DialogButton>
      </Focusable>
    </div>
  )
}

function ShelfActionsContextMenu({ controller, shelf }: { controller: SettingsController; shelf: Shelf }) {
  const { t, shelves, actions } = controller
  const index = shelves.findIndex((s) => s.id === shelf.id)
  return (
    <Menu label={t('actions')}>
      <MenuItem onSelected={() => showEditShelfModal(controller, shelf)}>{t('editShelf')}</MenuItem>
      <MenuItem onSelected={() => actions.duplicateShelf(shelf.id)}>{t('duplicateShelf')}</MenuItem>
      <MenuItem onSelected={() => actions.toggleShelfHidden(shelf.id)}>{shelf.hidden ? t('show_shelf') : t('hide_shelf')}</MenuItem>
      <MenuItem disabled={index <= 0} onSelected={() => actions.moveShelf(shelf.id, -1)}>{t('move_up')}</MenuItem>
      <MenuItem disabled={index >= shelves.length - 1} onSelected={() => actions.moveShelf(shelf.id, 1)}>{t('move_down')}</MenuItem>
      <MenuItem onSelected={() => showDeleteConfirm(controller, shelf)}>{t('deleteShelf')}</MenuItem>
    </Menu>
  )
}

function ShelfActionsButton({ controller, shelf }: { controller: SettingsController; shelf: Shelf }) {
  const onClick = () => showContextMenu(<ShelfActionsContextMenu controller={controller} shelf={shelf} />)
  return (
    <DialogButton style={{ height: '40px', minWidth: '40px', width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', marginRight: '8px' }} onClick={onClick} onOKButton={onClick} onOKActionDescription='Open shelf options'>
      {icons.ellipsis}
    </DialogButton>
  )
}

function ShelvesPanelSection({ controller }: { controller: SettingsController }) {
  const { shelves, actions, t } = controller
  function ShelfEntryInteractables({ entry }: { entry: ReorderableEntry<EntryData> }) {
    const shelf = shelves.find((item) => item.id === entry.data!.id)
    return shelf ? <ShelfActionsButton controller={controller} shelf={shelf} /> : null
  }
  const entries: ReorderableEntry<EntryData>[] = shelves.map((shelf, idx) => ({ label: <ShelfListLabel shelf={shelf} />, position: idx, data: { id: shelf.id } }))
  return (
    <PanelSection>
      <div className='deck-shelves-separator' />
      {entries.length ? (
        <ReorderableList<EntryData> entries={entries} interactables={ShelfEntryInteractables} onSave={(nextEntries: ReorderableEntry<EntryData>[]) => actions.reorderShelfIds(nextEntries.map((entry) => entry.data!.id))} />
      ) : (
        <div className='deck-shelves-empty'>{t('noShelves')}</div>
      )}
    </PanelSection>
  )
}

export function DeckQAMSettings({ controller }: { controller: SettingsController }) {
  const { t, settings, shelves, actions } = controller
  if (!settings) return <div style={{ padding: 16 }}>{t('loading')}</div>
  const isFirstRun = shelves.length === 0 && !settings.enabled
  const handleAdd = () => openManagedModal((close) => <TemplatePickerModal closeModal={close} controller={controller} />)
  const handleImport = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves.json'} />)
  const [hasCustomFilters] = useState(() => isTabMasterInstalled())
  const handleImportFromCustomFilters = () => openManagedModal((close) => <ImportFromCustomFiltersModal closeModal={close} controller={controller} />)
  const handleExport = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} />)
  const [mountCrashed, setMountCrashed] = useState(() => getMountFailed())
  const crashError = getMountError()

  return (
    <div className='deck-shelves-qam-scope'>
      <DeckQAMStyles />
      <ToggleField
        label={t('enabled')}
        checked={settings.enabled && !mountCrashed}
        disabled={mountCrashed}
        onChange={(value: boolean) => actions.setEnabled(value)}
        bottomSeparator={mountCrashed ? 'none' : 'thick'}
      />
      {mountCrashed && (
        <div style={{ padding: '6px 16px 10px', fontSize: 11, color: '#f87171', lineHeight: 1.4 }}>
          {t('mount_crash_warning')}
          {crashError ? <span style={{ opacity: 0.7, display: 'block', marginTop: 2 }}>{crashError.substring(0, 80)}</span> : null}
          <DialogButton
            style={{ marginTop: 6, padding: '4px 10px', fontSize: 11, height: 'auto', minWidth: 0 }}
            onClick={() => { resetMountFailed(); setMountCrashed(false); }}
            onOKButton={() => { resetMountFailed(); setMountCrashed(false); }}
          >
            {t('mount_crash_reset')}
          </DialogButton>
        </div>
      )}
      {!mountCrashed && <ToggleField label={t('hide_recents')} checked={settings.hideRecents === true} onChange={(value: boolean) => actions.setHideRecents(value)} />}
      {!mountCrashed && settings.hideRecents && (
        <div style={{ paddingLeft: 14, fontSize: 12, opacity: 0.95 }}>
          <ToggleField label={t('shelf_hero_background')} checked={settings.shelfHeroBackground === true} onChange={(value: boolean) => actions.setShelfHeroBackground(value)} />
        </div>
      )}
      
      {isFirstRun ? <FirstRunBanner controller={controller} /> : null}
      <Field className='no-sep'>
        <Focusable style={{ width: '100%', display: 'flex' }}>
          <ActionButton iconNode={icons.add} onClick={handleAdd} okDescription={t('addShelf')} />
          <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.import} onClick={handleImport} okDescription={t('import_settings')} /></div>
          {hasCustomFilters ? <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.customFilters} onClick={handleImportFromCustomFilters} okDescription={t('import_from_tabmaster')} /></div> : null}
          <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExport} okDescription={t('export_settings')} /></div>
        </Focusable>
      </Field>
      <ShelvesPanelSection controller={controller} />
      <PanelSection>
        <div className='deck-shelves-separator' />
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, paddingLeft: 0 }}>{t('apply_globally')}</div>
          <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} onChange={(value: boolean) => actions.setGlobalMatchNativeSize(value)} />
          <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} onChange={(value: boolean) => actions.setGlobalHighlightFirst(value)} />
          <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} onChange={(value: boolean) => actions.setGlobalHideStatusLine(value)} bottomSeparator='thick' />
        </div>
      </PanelSection>
    </div>
  )
}
