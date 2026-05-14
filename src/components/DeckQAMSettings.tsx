import { useEffect, useState } from 'react'
import {
  ConfirmModal,
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
import { ImportMenuButton, type ImportEntry } from './qam/common/ImportMenuButton'
import { getExternalImportTypesForTarget, registerInternalImportType } from '../core/pluginApi'
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
import { SavedFilterRow } from './qam/list/SavedFilterRow'
import { SmartShelvesFirstRunBanner } from './qam/modals/SmartShelvesFirstRunBanner'
import { SmartShelfTemplateModal } from './qam/modals/SmartShelfTemplateModal'
import { CollapsibleSection } from './ui'
import { GearIcon, StackIcon, SparkleIcon, WandIcon, BookmarkIcon, PlusCircleIcon } from './icons'
import { UpdateBanner } from './qam/UpdateBanner'

function OnlinePrivacyModal({ closeModal, t, onAccept }: { closeModal?: () => void; t: (k: string) => string; onAccept: () => void }) {
  return (
    <ConfirmModal
      strTitle={t('online_privacy_title')}
      strOKButtonText={t('online_privacy_accept')}
      strCancelButtonText={t('close')}
      onOK={() => { closeModal?.(); onAccept(); }}
      onCancel={() => closeModal?.()}
    >
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>{t('online_privacy_body')}</div>
      <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
        <div style={{ marginBottom: 4 }}>📋 {t('online_privacy_item_wishlist')}</div>
        <div style={{ marginBottom: 4 }}>💰 {t('online_privacy_item_price')}</div>
        <div>🌐 {t('online_privacy_item_ping')}</div>
      </div>
    </ConfirmModal>
  );
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

function SavedFiltersList({ controller }: { controller: SettingsController }) {
  const { t, settings } = controller
  const saved = settings?.savedFilters ?? []
  if (saved.length === 0) {
    return <div style={{ padding: '4px 16px', opacity: 0.7 }}>{t('saved_filter_empty')}</div>
  }
  return (
    <div className='deck-shelves-shelf-list'>
      {saved.map((f) => <SavedFilterRow key={f.id} controller={controller} savedFilter={f} />)}
    </div>
  )
}

export function DeckQAMSettings({ controller }: { controller: SettingsController }) {
  const { t, settings, shelves, actions } = controller
  const platform = usePlatform();
  const [disableHideRecents, setDisableHideRecents] = useState(false);
  if (!settings) return <div style={{ padding: 16 }}>{t('loading')}</div>
  const isFirstRun = shelves.length === 0 && !settings.enabled
  const handleAdd = () => openManagedModal((close) => <TemplatePickerModal closeModal={close} controller={controller} />)
  const handleImport = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves-shelves.json'} scope='shelves' />)
  const handleExport = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} scope='shelves' />)
  const handleImportSmart = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves-smart-shelves.json'} scope='smart' />)
  const handleExportSmart = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} scope='smart' />)
  const handleImportAll = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={'/home/deck/Downloads/deck-shelves.json'} scope='all' />)
  const handleExportAll = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={'/home/deck/Downloads'} scope='all' />)
  const [hasTabMaster] = useState(() => isTabMasterInstalled())
  const [hasNonSteamBadges] = useState(() => isNonSteamBadgesAvailable())
  const handleImportFromTabMaster = () => openManagedModal((close) => <ImportFromCustomFiltersModal closeModal={close} controller={controller} />)

  // Register TabMaster import as a first-party entry on the public registry
  // when TabMaster is installed. External plugins can register additional
  // descriptors via `__DECK_SHELVES_API__.registerImportType(...)` with
  // `target: "shelves"` (or `"smart_shelves"`) and they show up in the same
  // ImportMenuButton overflow menu — single registered entry collapses to a
  // direct icon, two or more collapse behind `[…]`.
  useEffect(() => {
    if (!hasTabMaster) return
    const unsub = registerInternalImportType({
      id: 'tabmaster',
      displayName: t('import_from_tabmaster'),
      target: 'shelves',
      icon: icons.tabMaster,
      runImport: () => { handleImportFromTabMaster() },
    })
    return unsub
  // Re-register only when TabMaster availability or `t` (locale) changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTabMaster, t])

  // Force re-render when external plugins (un)register import descriptors
  // so the ImportMenuButton picks up the change without a full QAM remount.
  // Plugins fire `deck-shelves-ready`/teardown — listening cheaply via
  // those plus a small bump counter is enough.
  const [importsBump, setImportsBump] = useState(0)
  useEffect(() => {
    const bump = () => setImportsBump((v) => v + 1)
    window.addEventListener('deck-shelves-ready', bump)
    window.addEventListener('deck-shelves-teardown', bump)
    return () => {
      window.removeEventListener('deck-shelves-ready', bump)
      window.removeEventListener('deck-shelves-teardown', bump)
    }
  }, [])

  const buildImportEntries = (target: 'shelves' | 'smart_shelves'): ImportEntry[] => {
    void importsBump // re-evaluate on registry changes
    return getExternalImportTypesForTarget(target).map((d) => ({
      id: d.id,
      label: d.displayName,
      icon: d.icon ?? icons.import,
      okDescription: d.displayName,
      onActivate: async () => {
        if (typeof d.runImport === 'function') {
          try { await d.runImport() } catch {}
          return
        }
        // No `runImport` registered: descriptor must surface its own UX. The
        // default file-picker flow (using `parse`) is reserved for a future
        // pass once we have a generic format-aware picker.
        if (typeof d.parse === 'function') {
          logInfo('SETTINGS', 'import descriptor has parse() but no runImport()', { id: d.id })
        }
      },
    }))
  }
  const handleResetShelves = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='shelves' />)
  const handleResetSmart = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='smart' />)
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

      <UpdateBanner controller={controller} />

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

      <CollapsibleSection id='behavior' icon={<GearIcon />} title={t('section_behavior')} count={[settings.hideRecents, settings.hideHomeTabs].filter(Boolean).length}>
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

      <CollapsibleSection id='additional' icon={<PlusCircleIcon />} title={t('section_additional_features')} count={[settings.updateNotifyEnabled !== false, settings.onlineFeaturesEnabled === true].filter(Boolean).length}>
        <ToggleField label={t('check_for_updates')} checked={settings.updateNotifyEnabled !== false} onChange={(value: boolean) => actions.setUpdateNotifyEnabled(value)} />
        <ToggleField
          label={t('online_features')}
          checked={settings.onlineFeaturesEnabled === true}
          onChange={(value: boolean) => {
            if (value && !settings.onlinePrivacyAccepted) {
              openManagedModal((close) => (
                <OnlinePrivacyModal
                  closeModal={close}
                  t={t}
                  onAccept={() => { void actions.acceptOnlinePrivacy().then(() => actions.setOnlineFeaturesEnabled(true)); }}
                />
              ));
            } else {
              void actions.setOnlineFeaturesEnabled(value);
            }
          }}
        />
        <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
          {t('online_features_desc')}
        </div>
        {settings.onlineFeaturesEnabled === true && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            <ToggleField label={t('online_wishlist')} checked={settings.onlineWishlistEnabled !== false} onChange={(value: boolean) => void actions.setOnlineWishlistEnabled(value)} />
            <ToggleField label={t('online_price_sort')} checked={settings.onlinePriceSortEnabled !== false} onChange={(value: boolean) => void actions.setOnlinePriceSortEnabled(value)} />
            <ToggleField label={t('online_hide_owned')} checked={settings.onlineHideOwnedGames !== false} onChange={(value: boolean) => { void actions.setOnlineHideOwnedGames(value); if (!value) void actions.setOnlineHideOwnedNonSteam(false); }} />
            <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
              {t('online_hide_owned_desc')}
            </div>
            {settings.onlineHideOwnedGames !== false && (
              <div style={{ paddingLeft: 16 }}>
                <ToggleField label={t('hide_owned_non_steam')} checked={settings.onlineHideOwnedNonSteam === true} onChange={(value: boolean) => void actions.setOnlineHideOwnedNonSteam(value)} />
                <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
                  {t('hide_owned_non_steam_desc')}
                </div>
              </div>
            )}
          </div>
        )}
        <ToggleField label={t('force_themes_label')} checked={settings.forceCssLoaderThemes === true} onChange={(value: boolean) => void actions.setForceCssLoaderThemes(value)} />
        <div style={{ paddingLeft: 14, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
          {t('force_themes_desc')}
        </div>
      </CollapsibleSection>

      {replaceFailed && (
        <RecentsReplaceErrorBanner controller={controller} error={replaceError} onDismiss={() => { setReplaceFailed(false); setReplaceError(null) }} />
      )}

      <CollapsibleSection id='shelves' icon={<StackIcon />} title={t('shelves_section')} count={shelves.filter(s => s.enabled && !s.hidden).length} initialOpen>
        <Field className='no-sep'>
          <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex' }}>
              <ActionButton iconNode={icons.add} onClick={handleAdd} okDescription={t('addShelf')} />
              <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.import} onClick={handleImport} okDescription={t('import_shelves')} /></div>
              <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExport} okDescription={t('export_shelves')} /></div>
            </div>
            <div style={{ display: 'flex' }}>
              {(() => {
                const shelfImports = buildImportEntries('shelves')
                if (shelfImports.length === 0) return null
                return (
                  <div style={{ marginRight: 10 }}>
                    <ImportMenuButton entries={shelfImports} overflowDescription={t('import_more_options' as any)} />
                  </div>
                )
              })()}
              <ActionButton iconNode={icons.reset} onClick={handleResetShelves} okDescription={t('reset_shelves')} />
            </div>
          </Focusable>
        </Field>
        <div className='deck-shelves-separator' />
        <ShelvesPanelSection controller={controller} />
      </CollapsibleSection>

      {settings.enabled && (
      <CollapsibleSection id='smart' icon={<SparkleIcon />} title={t('smart_section_header')} count={settings.smartShelvesEnabled ? (settings.smartShelves ?? []).filter((s: any) => !s.hidden).length : 0}>
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
              label={settings.smartSurpriseMeCount ? `${t('smart_surprise_count')} (${settings.smartSurpriseMeCount})` : t('smart_surprise_count')}
              value={settings.smartSurpriseMeCount ?? 0}
              min={0}
              max={5}
              step={1}
              onChange={(v: number) => actions.setSmartSurpriseMeCount(v)}
            />
            {!settings.smartSurpriseMeCount && (
              <div style={{ textAlign: 'center', padding: '4px 12px 8px', fontSize: 12, opacity: 0.7 }}>
                {t('smart_surprise_count_auto')}
              </div>
            )}
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
              <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex' }}>
                  <ActionButton iconNode={icons.add} onClick={handleAddSmart} okDescription={t('smart_add_shelf')} />
                  <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.import} onClick={handleImportSmart} okDescription={t('import_smart_shelves')} /></div>
                  <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExportSmart} okDescription={t('export_smart_shelves')} /></div>
                </div>
                <div style={{ display: 'flex' }}>
                  {(() => {
                    const smartImports = buildImportEntries('smart_shelves')
                    if (smartImports.length === 0) return null
                    return (
                      <div style={{ marginRight: 10 }}>
                        <ImportMenuButton entries={smartImports} overflowDescription={t('import_more_options' as any)} />
                      </div>
                    )
                  })()}
                  <ActionButton iconNode={icons.reset} onClick={handleResetSmart} okDescription={t('reset_smart_shelves')} />
                </div>
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
        icon={<WandIcon />}
        title={t('section_visual_global')}
        count={[settings.globalMatchNativeSize, settings.globalHighlightFirst, settings.globalHighlightAll, settings.globalHideShelfTitle, settings.globalHideGameNames, settings.globalHideStatusLine, settings.globalHideInstallIndicator, settings.globalHideNewBadge, settings.globalHideCompatIcons, settings.globalHideNonSteamBadge, settings.globalHideSeeMore, settings.globalHideRefreshCard, (settings as any).globalDedupeByName].filter(Boolean).length}
      >
        <ToggleField label={t('match_native_size')} checked={settings.globalMatchNativeSize === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalMatchNativeSize(value)} />
        <ToggleField label={t('highlight_first')} checked={settings.globalHighlightFirst === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightFirst(value)} />
        <ToggleField label={t('highlight_all')} checked={settings.globalHighlightAll === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHighlightAll(value)} />
        <ToggleField label={t('hide_shelf_titles')} checked={settings.globalHideShelfTitle === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideShelfTitle(value)} />
        <ToggleField label={t('hide_game_names')} checked={settings.globalHideGameNames === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideGameNames(value)} />
        <ToggleField label={t('hide_status_line')} checked={settings.globalHideStatusLine === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideStatusLine(value)} />
        <ToggleField label={t('hide_install_indicators')} checked={settings.globalHideInstallIndicator === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideInstallIndicator(value)} />
        <ToggleField label={t('hide_new_badge')} checked={settings.globalHideNewBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideNewBadge(value)} />
        <ToggleField label={t('hide_compat_icons')} checked={settings.globalHideCompatIcons === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideCompatIcons(value)} />
        {hasNonSteamBadges && (
          <ToggleField label={t('hide_non_steam_badge')} checked={settings.globalHideNonSteamBadge === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideNonSteamBadge(value)} />
        )}
        <ToggleField label={t('hide_see_more_card')} checked={settings.globalHideSeeMore === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideSeeMore(value)} />
        <ToggleField label={t('hide_refresh_card')} checked={settings.globalHideRefreshCard === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setGlobalHideRefreshCard(value)} />
        <ToggleField label={t('global_dedupe_by_name' as any)} checked={(settings as any).globalDedupeByName === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setGlobalDedupeByName(value)} />
      </CollapsibleSection>
      )}

      {settings.enabled && (settings.savedFilters?.length ?? 0) > 0 && (
      <CollapsibleSection
        id='saved_filters'
        icon={<BookmarkIcon />}
        title={t('saved_filters_section')}
        count={settings.savedFilters?.length ?? 0}
      >
        <SavedFiltersList controller={controller} />
      </CollapsibleSection>
      )}

      <Field className='no-sep'>
        <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex' }}>
            <ActionButton iconNode={icons.import} onClick={handleImportAll} okDescription={t('import_settings')} />
            <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExportAll} okDescription={t('export_settings')} /></div>
          </div>
          <ActionButton iconNode={icons.reset} onClick={handleResetAll} okDescription={t('reset_all_button')} />
        </Focusable>
      </Field>
    </div>
  )
}
