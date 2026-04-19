import { useEffect, useState } from 'react'
import {
  DialogButton,
  Field,
  Focusable,
  SliderField,
  ToggleField,
  showModal,
} from '@decky/ui'
import { getMountFailed, getMountError, subscribeMountFailed } from '../runtime/homePatch'
import type { SettingsController } from '../features/settings/controller'
import { usePlatform } from '../runtime/platformContext'
import { DeckQAMStyles } from './styles/DeckQAMStyles'
import { logInfo } from '../runtime/logger'
import { isTabMasterInstalled, isNonSteamBadgesAvailable } from '../integrations'

import { icons } from './qam/icons'
import { ActionButton } from './qam/common/ActionButton'
import { ExportModal } from './qam/modals/ExportModal'
import { ImportFromCustomFiltersModal } from './qam/modals/ImportFromCustomFiltersModal'
import { ImportModal } from './qam/modals/ImportModal'
import { TemplatePickerModal } from './qam/modals/TemplatePickerModal'
import { FirstRunBanner } from './qam/modals/FirstRunBanner'
import { MountCrashBanner } from './qam/modals/MountCrashBanner'
import { RecentsReplaceErrorBanner } from './qam/modals/RecentsReplaceErrorBanner'
import { getRecentsReplaceFailed, getRecentsReplaceError, subscribeRecentsReplaceFailed } from '../runtime/recentsReplace'
import { ResetAllModal } from './qam/modals/ResetAllModal'
import { ShelvesPanelSection } from './qam/list/ShelvesPanelSection'
import { SmartShelvesPanelSection } from './qam/list/SmartShelvesPanelSection'
import { SmartShelvesFirstRunBanner } from './qam/modals/SmartShelvesFirstRunBanner'
import { SmartShelfTemplateModal } from './qam/modals/SmartShelfTemplateModal'

const SECTIONS_KEY = 'ds-qam-sections'
function loadSections(): Record<string, boolean> {
  try { const raw = localStorage.getItem(SECTIONS_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function saveSections(state: Record<string, boolean>) {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(state)) } catch {}
}
const _sectionOpen: Record<string, boolean> = loadSections()

function CollapsibleSection({ id, title, count, initialOpen, children }: { id: string; title: string; count: number; initialOpen?: boolean; children: React.ReactNode }) {
  const defaultOpen = id in _sectionOpen ? _sectionOpen[id] : (initialOpen !== undefined ? initialOpen : count > 0)
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen(o => { const next = !o; _sectionOpen[id] = next; saveSections(_sectionOpen); return next })
  return (
    <>
      <div style={{ marginTop: 8 }}>
        <Focusable className='ds-collapsible-header' onClick={toggle} onOKButton={toggle}>
          <span>{title}</span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {!open && count > 0 && <span className='ds-collapsible-badge'>{count}</span>}
            <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
          </span>
        </Focusable>
      </div>
      <div className='deck-shelves-separator' />
      {open && children}
    </>
  )
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

export function DeckQAMSettings({ controller }: { controller: SettingsController }) {
  const { t, settings, shelves, actions } = controller
  const platform = usePlatform();
  const [disableHideRecents, setDisableHideRecents] = useState(false);
  if (!settings) return <div style={{ padding: 16 }}>{t('loading')}</div>
  const isFirstRun = shelves.length === 0 && !settings.enabled
  const handleAdd = () => openManagedModal((close) => <TemplatePickerModal closeModal={close} controller={controller} />)
  const handleImport = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves.json'} />)
  const [hasTabMaster] = useState(() => isTabMasterInstalled())
  const [hasNonSteamBadges] = useState(() => isNonSteamBadgesAvailable())
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
  const [replaceFailed, setReplaceFailed] = useState(() => getRecentsReplaceFailed())
  const [replaceError, setReplaceError] = useState<string | null>(() => getRecentsReplaceError())
  useEffect(() => {
    const sync = () => { setReplaceFailed(getRecentsReplaceFailed()); setReplaceError(getRecentsReplaceError()) }
    const unsub = subscribeRecentsReplaceFailed(sync)
    sync()
    return unsub
  }, [])
  const handleResetAll = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} />)
  const handleAddSmart = () => openManagedModal((close) => <SmartShelfTemplateModal closeModal={close} controller={controller} />)

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
      {isFirstRun ? <FirstRunBanner controller={controller} /> : null}

      <CollapsibleSection id='behavior' title={t('section_behavior')} count={[settings.hideRecents, settings.hideHomeTabs].filter(Boolean).length}>
        {settings.enabled && (
          <ToggleField label={t('hide_recents')} checked={settings.hideRecents === true} disabled={mountCrashed || disableHideRecents} onChange={(value: boolean) => actions.setHideRecents(value)} />
        )}
        {settings.enabled && settings.hideRecents === true && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            <ToggleField label={t('shelf_hero_background')} checked={settings.shelfHeroBackground === true} disabled={mountCrashed || disableHideRecents} onChange={(value: boolean) => actions.setShelfHeroBackground(value)} />
            <ToggleField label={t('recents_replace_source')} checked={settings.recentsReplaceSource === true && !replaceFailed} disabled={mountCrashed || disableHideRecents || replaceFailed} onChange={(value: boolean) => actions.setRecentsReplaceSource(value)} />
          </div>
        )}
        <ToggleField label={t('hide_home_tabs')} checked={settings.hideHomeTabs === true} onChange={(value: boolean) => actions.setHideHomeTabs(value)} />
      </CollapsibleSection>

      {replaceFailed && (
        <RecentsReplaceErrorBanner controller={controller} error={replaceError} onDismiss={() => { setReplaceFailed(false); setReplaceError(null) }} />
      )}

      <CollapsibleSection id='shelves' title={t('shelves_section')} count={shelves.filter(s => s.enabled && !s.hidden).length} initialOpen>
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
      </CollapsibleSection>

      {settings.enabled && (
      <CollapsibleSection id='smart' title={t('smart_section_header')} count={settings.smartShelvesEnabled ? 1 : 0}>
        <ToggleField
          label={t('smart_shelves_enabled')}
          checked={settings.smartShelvesEnabled === true}
          disabled={mountCrashed}
          onChange={(value: boolean) => actions.setSmartShelvesEnabled(value)}
        />
        {settings.smartShelvesEnabled && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            <ToggleField
              label={t('smart_shelves_at_bottom')}
              checked={settings.smartShelvesAtBottom === true}
              disabled={mountCrashed}
              onChange={(value: boolean) => actions.setSmartShelvesAtBottom(value)}
            />
            <ToggleField
              label={t('smart_surprise_me')}
              checked={settings.smartSurpriseMe === true}
              disabled={mountCrashed}
              onChange={(value: boolean) => actions.setSmartSurpriseMe(value)}
            />
          </div>
        )}
        {settings.smartShelvesEnabled && settings.smartSurpriseMe && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            <SliderField
              label={t('smart_surprise_count')}
              description={!settings.smartSurpriseMeCount ? t('smart_surprise_count_auto') : undefined}
              value={settings.smartSurpriseMeCount ?? 0}
              min={0}
              max={5}
              step={1}
              onChange={(v: number) => actions.setSmartSurpriseMeCount(v)}
            />
          </div>
        )}
        {settings.smartShelvesEnabled && !settings.smartSurpriseMe && (settings.smartShelves ?? []).length === 0 && (
          <SmartShelvesFirstRunBanner controller={controller} onAdd={handleAddSmart} />
        )}
        {settings.smartShelvesEnabled && !settings.smartSurpriseMe && (settings.smartShelves ?? []).length > 0 && (
          <>
            <div style={{ marginTop: 8 }} />
            <div className='deck-shelves-separator' />
            <Field className='no-sep'>
              <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '0 16px', boxSizing: 'border-box' }}>
                <ActionButton iconNode={icons.add} onClick={handleAddSmart} okDescription={t('smart_add_shelf')} />
              </Focusable>
            </Field>
            <div className='deck-shelves-separator' />
            <SmartShelvesPanelSection controller={controller} />
          </>
        )}
      </CollapsibleSection>
      )}

      {settings.enabled && (
      <CollapsibleSection
        id='visual_global'
        title={t('section_visual_global')}
        count={[settings.globalMatchNativeSize, settings.globalHighlightFirst, settings.globalHighlightAll, settings.globalHideStatusLine, settings.globalHideNewBadge, settings.globalHideCompatIcons, settings.globalHideNonSteamBadge].filter(Boolean).length}
      >
        <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalMatchNativeSize(value)} />
        <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightFirst(value)} />
        <ToggleField label={t('highlight_all')} checked={settings.globalHighlightAll === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightAll(value)} />
        <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideStatusLine(value)} />
        <ToggleField label={t('hide_new_badge')} checked={settings.globalHideNewBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideNewBadge(value)} />
        <ToggleField label={t('hide_compat_icons')} checked={settings.globalHideCompatIcons === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideCompatIcons(value)} />
        {hasNonSteamBadges && (
          <ToggleField label={t('hide_non_steam_badge')} checked={settings.globalHideNonSteamBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideNonSteamBadge(value)} />
        )}
      </CollapsibleSection>
      )}
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
