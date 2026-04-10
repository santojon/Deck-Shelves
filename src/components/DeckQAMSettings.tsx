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
import { ActionButton } from './qam/common/ActionButton'
import { ShelfListLabel } from './qam/common/ShelfListLabel'
import { DeleteConfirmModal } from './qam/modals/DeleteConfirmModal'
import { ExportModal } from './qam/modals/ExportModal'
import { ImportFromCustomFiltersModal } from './qam/modals/ImportFromCustomFiltersModal'
import { ImportModal } from './qam/modals/ImportModal'
import { EditShelfModal } from './qam/modals/EditShelfModal'
import { TemplatePickerModal } from './qam/modals/TemplatePickerModal'
import { FirstRunBanner } from './qam/modals/FirstRunBanner'

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

function showDeleteConfirm(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <DeleteConfirmModal closeModal={close} controller={controller} shelf={shelf} />)
}

type ExportModalProps = {
  closeModal?: () => void
  controller: SettingsController
  folderPath: string
}
// ExportModal is implemented in ./qam/modals/ExportModal

// ImportFromCustomFiltersModal is now in ./qam/modals/ImportFromCustomFiltersModal

type ImportModalProps = {
  closeModal?: () => void
  controller: SettingsController
  initialPath: string
}
// ImportModal is implemented in ./qam/modals/ImportModal

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

// EditShelfModal is implemented in ./qam/modals/EditShelfModal

function showEditShelfModal(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={shelf} />)
}

// TemplatePickerModal moved to ./qam/modals/TemplatePickerModal

// FirstRunBanner moved to ./qam/modals/FirstRunBanner

import { ShelvesPanelSection } from './qam/list/ShelvesPanelSection'

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
      <div className='deck-shelves-separator' />
      <Field className='no-sep'>
        <Focusable style={{ width: '100%', display: 'flex' }}>
          <ActionButton iconNode={icons.add} onClick={handleAdd} okDescription={t('addShelf')} />
          <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.import} onClick={handleImport} okDescription={t('import_settings')} /></div>
          {hasCustomFilters ? <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.customFilters} onClick={handleImportFromCustomFilters} okDescription={t('import_from_tabmaster')} /></div> : null}
          <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExport} okDescription={t('export_settings')} /></div>
        </Focusable>
      </Field>
      <ShelvesPanelSection controller={controller} />
      <div className='deck-shelves-separator' />
      <div style={{ fontWeight: 600, marginBottom: 8, paddingLeft: 8, paddingTop: 8 }}>{t('apply_globally')}</div>
      {!mountCrashed && <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} onChange={(value: boolean) => actions.setGlobalMatchNativeSize(value)} /> }
      {!mountCrashed && <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} onChange={(value: boolean) => actions.setGlobalHighlightFirst(value)} /> }
      {!mountCrashed && <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} onChange={(value: boolean) => actions.setGlobalHideStatusLine(value)} /> }
    </div>
  )
}
