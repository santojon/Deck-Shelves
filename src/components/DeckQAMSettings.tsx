import { useEffect, useState } from 'react'
import {
  DialogButton,
  Field,
  Focusable,
  ToggleField,
  showModal,
} from '@decky/ui'
import { getMountFailed, getMountError, subscribeMountFailed } from '../runtime/homePatch'
import type { SettingsController } from '../features/settings/controller'
import { usePlatform } from '../runtime/platformContext'
import { DeckQAMStyles } from './styles/DeckQAMStyles'
import { logInfo } from '../runtime/logger'
import { isTabMasterInstalled } from '../integrations'

import { icons } from './qam/icons'
import { ActionButton } from './qam/common/ActionButton'
import { ExportModal } from './qam/modals/ExportModal'
import { ImportFromCustomFiltersModal } from './qam/modals/ImportFromCustomFiltersModal'
import { ImportModal } from './qam/modals/ImportModal'
import { TemplatePickerModal } from './qam/modals/TemplatePickerModal'
import { FirstRunBanner } from './qam/modals/FirstRunBanner'
import { MountCrashBanner } from './qam/modals/MountCrashBanner'
import { ResetAllModal } from './qam/modals/ResetAllModal'
import { ShelvesPanelSection } from './qam/list/ShelvesPanelSection'

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

export function DeckQAMSettings({ controller }: { controller: SettingsController }) {
  const { t, settings, shelves, actions } = controller
  const platform = usePlatform();
  const [disableHideRecents, setDisableHideRecents] = useState(false);
  if (!settings) return <div style={{ padding: 16 }}>{t('loading')}</div>
  const isFirstRun = shelves.length === 0 && !settings.enabled
  const handleAdd = () => openManagedModal((close) => <TemplatePickerModal closeModal={close} controller={controller} />)
  const handleImport = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves.json'} />)
  const [hasTabMaster] = useState(() => isTabMasterInstalled())
  const handleImportFromTabMaster = () => openManagedModal((close) => <ImportFromCustomFiltersModal closeModal={close} controller={controller} />)
  const handleExport = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} />)
  const [mountCrashed, setMountCrashed] = useState(() => getMountFailed())
  const [crashError, setCrashError] = useState<string | null>(() => getMountError())
  useEffect(() => {
    const sync = () => { setMountCrashed(getMountFailed()); setCrashError(getMountError()) }
    const unsub = subscribeMountFailed(sync)
    sync()
    return unsub
  }, [])
  const handleResetAll = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} />)

  // Compute whether the "hide recents" and "hero background" toggles should be
  // inactive.  They become disabled when there are no visible shelves or none of
  // the visible shelves resolve to results.  This runs regardless of the current
  // toggle value so that the UI accurately reflects the shelf state.
  // IMPORTANT: we never force-change the toggle values — only disable interaction.
  useEffect(() => {
    let alive = true;
    const compute = async () => {
      try {
        const visible = (shelves ?? []).filter((s) => s.enabled && !s.hidden);
        if (!visible.length) { if (alive) setDisableHideRecents(true); return; }
        const resolved = await Promise.all(visible.map((sh) => platform.resolveShelfAppIds(sh.source, sh.limit).catch(() => [])));
        const anyHas = resolved.some((r) => Array.isArray(r) && r.length > 0);
        if (alive) setDisableHideRecents(!anyHas);
      } catch {
        if (alive) setDisableHideRecents(false);
      }
    };
    compute();
    const onEvent = (e: Event) => { const d = (e as CustomEvent)?.detail; setDisableHideRecents(Boolean(d?.disabled)); };
    globalThis.addEventListener('deck-shelves-hideRecents-disabled', onEvent);
    return () => { alive = false; globalThis.removeEventListener('deck-shelves-hideRecents-disabled', onEvent); };
  }, [shelves, platform]);

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
        <MountCrashBanner controller={controller} error={crashError} onDismiss={() => { setMountCrashed(false); setCrashError(null) }} />
      )}
      {settings.enabled && (
        <ToggleField label={t('hide_recents')} checked={settings.hideRecents === true} disabled={mountCrashed || disableHideRecents} onChange={(value: boolean) => actions.setHideRecents(value)} />
      )}
      {settings.enabled && settings.hideRecents === true && (
        <div style={{ paddingLeft: 14, fontSize: 12 }}>
          <ToggleField label={t('shelf_hero_background')} checked={settings.shelfHeroBackground === true} disabled={mountCrashed || disableHideRecents} onChange={(value: boolean) => actions.setShelfHeroBackground(value)} />
        </div>
      )}
      
      {isFirstRun ? <FirstRunBanner controller={controller} /> : null}
      <div className='deck-shelves-section-header' style={{ marginTop: 12 }}>{t('shelves_section')}</div>
      <div className='deck-shelves-separator' />
      <Field className='no-sep'>
        <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex' }}>
            <ActionButton iconNode={icons.add} onClick={handleAdd} okDescription={t('addShelf')} />
            <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.import} onClick={handleImport} okDescription={t('import_settings')} /></div>
            <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExport} okDescription={t('export_settings')} /></div>
          </div>
          {hasTabMaster ? <ActionButton iconNode={icons.tabMaster} onClick={handleImportFromTabMaster} okDescription={t('import_from_tabmaster')} /> : null}
        </Focusable>
      </Field>
      <div className='deck-shelves-separator' />
      <ShelvesPanelSection controller={controller} />
      <div className='deck-shelves-section-header' style={{ marginTop: 8 }}>{t('apply_globally')}</div>
      <div className='deck-shelves-separator' />
      <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalMatchNativeSize(value)} />
      <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightFirst(value)} />
      <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideStatusLine(value)} />
      <Field className='no-sep'>
        <Focusable style={{ width: '100%', padding: '0 16px', boxSizing: 'border-box' }}>
          <DialogButton
            onClick={handleResetAll}
            onOKButton={handleResetAll}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {icons.reset}
            <span>{t('reset_all_button')}</span>
          </DialogButton>
        </Focusable>
      </Field>
    </div>
  )
}
