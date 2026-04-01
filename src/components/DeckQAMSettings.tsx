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
  showContextMenu,
  showModal,
} from '@decky/ui'
import { openFilePicker, toaster } from '@decky/api'
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

function icon(paths: React.ReactNode, size = 18, fill = 'none') {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill={fill} stroke='currentColor' strokeWidth='2.1' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      {paths}
    </svg>
  )
}

const icons = {
  add: icon(<><path d='M12 5v14' /><path d='M5 12h14' /></>),
  import: icon(<><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' /><polyline points='14 2 14 8 20 8' /><path d='M12 18v-6' /><path d='m9 15 3 3 3-3' /></>),
  export: icon(<><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' /><polyline points='14 2 14 8 20 8' /><path d='M12 12v6' /><path d='m15 15-3-3-3 3' /></>),
  edit: icon(<><path d='m4 20 4.5-1 9-9a2 2 0 1 0-2.8-2.8l-9 9L4 20Z' /><path d='m13.7 6.3 4 4' /></>),
  duplicate: icon(<><rect x='8' y='8' width='10' height='10' rx='2' /><rect x='5' y='5' width='10' height='10' rx='2' opacity='0.7' /></>),
  eyeOpen: icon(<><path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z' /><circle cx='12' cy='12' r='3' /></>),
  eyeClosed: icon(<><path d='M3 3l18 18' /><path d='M9.7 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-.9' /><path d='M6.2 6.4A12.7 12.7 0 0 0 2 12s3.5 6 10 6c2.2 0 4-.6 5.5-1.5M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.8 3.8' /></>),
  up: icon(<path d='m6 14 6-6 6 6' />),
  down: icon(<path d='m6 10 6 6 6-6' />),
  trash: icon(<><path d='M3 6h18' /><path d='M8 6V4h8v2' /><path d='M10 10v6' /><path d='M14 10v6' /><path d='M6 6l1 14h10l1-14' /></>),
  ellipsis: icon(<><circle cx='6' cy='12' r='1.4' fill='currentColor' stroke='none' /><circle cx='12' cy='12' r='1.4' fill='currentColor' stroke='none' /><circle cx='18' cy='12' r='1.4' fill='currentColor' stroke='none' /></>, 16),
  customFilters: icon(<><rect x='2' y='8' width='20' height='13' rx='2' /><path d='M2 12h20' /><rect x='6' y='5' width='6' height='3' rx='1' /></>),
}

type EntryData = { id: string }
type SourceType = 'collection' | 'tab' | 'filter'
const SOURCE_TYPES: SourceType[] = ['collection', 'tab', 'filter']
const SORT_OPTIONS = [
  { value: 'alphabetical', labelKey: 'sort_alpha' },
  { value: 'recent', labelKey: 'sort_recent' },
  { value: 'playtime', labelKey: 'sort_playtime' },
  { value: 'release_date', labelKey: 'sort_release_date' },
  { value: 'size_on_disk', labelKey: 'sort_size_on_disk' },
  { value: 'metacritic', labelKey: 'sort_metacritic' },
  { value: 'review_score', labelKey: 'sort_review_score' },
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
    } catch {}
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

  // Inject a scoped style to make the OK button red only while this modal is mounted.
  // We avoid bDestructiveWarning because it leaks a global CSS state into Steam's UI.
  // Use ConfirmModal's destructive flag to style the OK button red

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
            <Field description={<><div style={{ paddingBottom: '6px' }}>Folder</div><div className='deck-shelves-extra-wide-field deck-shelves-filter-text-field'><TextField value={folder} onChange={(value: unknown) => setFolder(textFromDeckyChange(value))} /></div></>} />
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
              >{browseBusy ? t('loading') : 'Browse'}</DialogButton>
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

  useEffect(() => {
    const loadTabs = async () => {
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
          return
        }
      } catch {}

      // Fallback: React fiber traversal + globals (kept for forward-compatibility
      // in case a future TabMaster version exposes a React context).
      let manager: any = null
      try {
        const ctx = findTabMasterContextValue()
        if (ctx && (Array.isArray(ctx.visibleTabsList) || ctx.tabsMap instanceof Map)) manager = ctx
      } catch {}
      if (!manager) {
        try {
          const gm = (globalThis as any)
          for (const k of Object.keys(gm)) {
            const v = gm[k]
            if (v && (Array.isArray(v?.visibleTabsList) || v?.tabsMap instanceof Map)) { manager = v; break }
          }
        } catch {}
      }
      if (manager) {
        try {
          const extracted = extractTabMasterTabsForImport(manager)
          if (extracted.length > 0) {
            setTabs(extracted.map((t: any) => ({ id: t.id, title: t.title, source: t.source })))
          }
        } catch {}
      }
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
          {tabs.length === 0 ? <div>{t('no_tabmaster_tabs')}</div> : (
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
              >{browseBusy ? t('loading') : 'Browse'}</DialogButton>
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
  filter: ShelfFilter
  filterGroup: FilterGroup
  limit: number
}

type EditShelfModalProps = {
  closeModal?: () => void
  controller: SettingsController
  shelf: Shelf
}

function EditShelfModal({ closeModal, controller, shelf }: EditShelfModalProps) {
  const { t, tabs, collections, actions } = controller
  const initialSourceType = shelf.source.type as SourceType
  const initialFilter = normalizeFilter(shelf.source)
  const initialFilterGroup = getEffectiveFilterGroup(initialFilter)
  const [state, setState] = useState<EditableShelfState>({
    title: shelf.title,
    sourceType: initialSourceType,
    collectionId: shelf.source.type === 'collection' ? shelf.source.collectionId : String(collections[0]?.id ?? ''),
    tab: shelf.source.type === 'tab' ? shelf.source.tab : String(tabs[0]?.id ?? 'all'),
    filter: initialFilter,
    filterGroup: initialFilterGroup,
    limit: shelf.limit,
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  const previewSource = useMemo(() => {
    if (state.sourceType === 'collection') return { type: 'collection' as const, collectionId: state.collectionId }
    if (state.sourceType === 'tab') return { type: 'tab' as const, tab: state.tab }
    const effectiveFilter = filterGroupToFilter(state.filterGroup, state.filter.sort)
    return { type: 'filter' as const, filter: effectiveFilter }
  }, [state.sourceType, state.collectionId, state.tab, state.filterGroup, state.filter.sort])

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

  const sourceTypeOptions: SingleDropdownOption[] = SOURCE_TYPES.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') : value === 'tab' ? t('source_tab') : t('source_filter'),
  }))
  const tabOptions: SingleDropdownOption[] = tabs.map((item) => ({ data: item.id, label: item.name }))
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
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
      const patch: Partial<Shelf> = { title, limit: state.limit };
      if (state.sourceType === 'collection') patch.source = { type: 'collection', collectionId: state.collectionId };
      else if (state.sourceType === 'tab') {
        const selectedTab = tabs.find((t) => t.id === state.tab)
        patch.source = selectedTab?.source ?? { type: 'tab', tab: state.tab }
      }
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
          <div className='field-item-container'>
            <DropdownItem label={t('source')} rgOptions={sourceTypeOptions} selectedOption={state.sourceType} onChange={(opt: unknown) => changeSourceType(String(optionData(opt)) as SourceType)} bottomSeparator='thick' />
            {state.sourceType === 'collection' ? (
              <DropdownItem label={t('source_collection')} rgOptions={collectionOptions} selectedOption={state.collectionId} onChange={(opt: unknown) => setCollection(String(optionData(opt)))} bottomSeparator='thick' />
            ) : null}
            {state.sourceType === 'tab' ? (
              <DropdownItem label={t('source_tab')} rgOptions={tabOptions} selectedOption={state.tab} onChange={(opt: unknown) => setTab(String(optionData(opt)))} bottomSeparator='thick' />
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
            <div style={{ padding: '8px 16px', fontSize: '12px', color: previewCount === 0 ? '#f59e0b' : '#8b949e' }}>
              {previewCount === null ? t('preview_loading') : previewCount === 0 ? `⚠️ ${t('preview_empty')}` : t('preview_count', { count: previewCount })}
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
  const { t, settings, actions } = controller
  if (!settings) return <div style={{ padding: 16 }}>{t('loading')}</div>
  const handleAdd = () => actions.addShelf()
  const handleImport = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves.json'} />)
  const [hasCustomFilters] = useState(() => isTabMasterInstalled())
  const handleImportFromCustomFilters = () => openManagedModal((close) => <ImportFromCustomFiltersModal closeModal={close} controller={controller} />)
  const handleExport = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} />)
  return (
    <div className='deck-shelves-qam-scope'>
      <DeckQAMStyles />
      <ToggleField label={t('enabled')} checked={settings.enabled} onChange={(value: boolean) => actions.setEnabled(value)} bottomSeparator='thick' />
      <Field className='no-sep'>
        <Focusable style={{ width: '100%', display: 'flex' }}>
          <ActionButton iconNode={icons.add} onClick={handleAdd} okDescription={t('addShelf')} />
          <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.import} onClick={handleImport} okDescription={t('import_settings')} /></div>
          {hasCustomFilters ? <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.customFilters} onClick={handleImportFromCustomFilters} okDescription={t('import_from_tabmaster')} /></div> : null}
          <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExport} okDescription={t('export_settings')} /></div>
        </Focusable>
      </Field>
      <ShelvesPanelSection controller={controller} />
    </div>
  )
}
