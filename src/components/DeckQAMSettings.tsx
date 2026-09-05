import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ConfirmModal,
  Field,
  Focusable,
  ToggleField,
} from '../runtime/host/decky'
import { getMountFailed, getMountError, subscribeMountFailed } from '../runtime/homePatch'
import type { SettingsController } from '../features/settings/controller'
import { usePlatform } from '../runtime/platformContext'
import { DeckQAMStyles } from './styles/DeckQAMStyles'
import { logInfo } from '../runtime/logger'
import { isTabMasterInstalled, isNonSteamBadgesAvailable } from '../integrations'
import { isCssLoaderActive } from '../core/cssLoaderDetect'
import { useLightMode } from './ui/lightMode'
import { getUserDownloadsDir, joinDownloads } from '../core/userPaths'
import { descriptorName } from '../core/descriptorName'

import { icons } from './qam/icons'
import { ActionButton } from './qam/common/ActionButton'
import { ImportMenuButton, type ImportEntry } from './qam/common/ImportMenuButton'
import { openManagedModal } from './qam/common/openManagedModal'
import { getExternalImportTypesForTarget, registerInternalImportType } from '../core/pluginApi'
import { formatComboForDisplay, resolveBindings, parseRawCombo, matchEvent, createMatcherState, DEFAULT_BINDINGS } from '../runtime/buttonBindings'
import { subscribeControllerInput } from '../runtime/controllerInput'
import { sidecarCancelHandler, mainCancelButtonDown } from './qam/sidecarCancel'
import { getCurrentSettings } from '../store/settingsStore'
import { ExportModal } from './qam/modals/ExportModal'
import { ImportFromCustomFiltersModal } from './qam/modals/ImportFromCustomFiltersModal'
import { ImportModal } from './qam/modals/ImportModal'
import { CreateShelfModal } from './qam/modals/CreateShelfModal'
import { FirstRunBanner } from './qam/modals/FirstRunBanner'
import { useFirstRunShowcase } from './qam/useFirstRunShowcase'
import { NotificationAreaToggles } from './qam/NotificationAreaToggles'
import { MountCrashBanner } from './qam/modals/MountCrashBanner'
import { RecentsReplaceErrorBanner } from './qam/modals/RecentsReplaceErrorBanner'
import { getRecentsReplaceFailed, getRecentsReplaceError, subscribeRecentsReplaceFailed } from '../runtime/recentsReplace'
import { ResetAllModal } from './qam/modals/ResetAllModal'
import { ShelvesPanelSection } from './qam/list/ShelvesPanelSection'
import { SmartShelvesPanelSection } from './qam/list/SmartShelvesPanelSection'
import { UnifiedShelvesPanelSection } from './qam/list/UnifiedShelvesPanelSection'
import { SavedFilterRow } from './qam/list/SavedFilterRow'
import { SavedSmartFilterRow } from './qam/list/SavedSmartFilterRow'
import { SmartShelvesFirstRunBanner } from './qam/modals/SmartShelvesFirstRunBanner'
import { CollapsibleSection, DSSliderField, VersionFooter } from './ui'
import { SlidersIcon, StackIcon, SparkleIcon, BookmarkIcon, PlusCircleIcon, OnlineIcon } from './icons'
import { UpdateBanner } from './qam/UpdateBanner'
import { useQamExpanded, resetQamExpanded } from './qam/qamExpandedStore'
import { confirmAction } from './qam/modals/ConfirmActionModal'
import { ProfilesSection } from './qam/sections/ProfilesSection'
import { VisualGlobalSection } from './qam/sections/VisualGlobalSection'
import { getQamWindow, useQamCompositorSync, useIsActiveQamTab, shouldRenderSidecar } from './qam/sidecarActiveTab'
import { SidecarPanel, useDpadExpandBridge, fireQamExpand, traceSidecarCollapse } from './qam/sidecar/SidecarPanel'

try {
  (globalThis as unknown as Record<string, unknown>).__ds_module_loaded__ = 'DeckQAMSettings@' + Date.now();
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__ds_module_loaded_w__ = 'win@' + Date.now();
  }
  try { document.documentElement.setAttribute('data-ds-module-loaded', 'yes@' + Date.now()); } catch {}
} catch {}

// Parent → sub-toggle map used both for hiding sub-toggles from the QAM
// when the parent is hidden, and for sidecar UI consistency. Order matters
// only for resolution: walking up via `parent` must terminate.
const TOGGLE_PARENTS: Record<string, string> = {
  shelfHeroBackground: 'hideRecents',
  recentsReplaceSource: 'hideRecents',
  onlineWishlistEnabled: 'onlineFeaturesEnabled',
  onlineMetadataEnabled: 'onlineFeaturesEnabled',
  onlinePriceSortEnabled: 'onlineFeaturesEnabled',
  onlineHideOwnedGames: 'onlineFeaturesEnabled',
  onlineHideOwnedNonSteam: 'onlineHideOwnedGames',
  onlineHideOwnedNonSteamCloud: 'onlineHideOwnedNonSteam',
  smartShelvesAtBottom: 'smartShelvesEnabled',
  smartSurpriseMe: 'smartShelvesEnabled',
};

export function isToggleHiddenWithAncestors(key: string, hidden: ReadonlyArray<string>): boolean {
  if (hidden.includes(key)) return true;
  const parent = TOGGLE_PARENTS[key];
  return parent ? isToggleHiddenWithAncestors(parent, hidden) : false;
}

export function OnlinePrivacyModal({ closeModal, t, onAccept }: { closeModal?: () => void; t: (k: string) => string; onAccept: () => void }) {
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

export function SavedFiltersList({ controller }: { controller: SettingsController }) {
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

export function SavedSmartFiltersList({ controller }: { controller: SettingsController }) {
  const { t, settings } = controller
  const saved = settings?.savedSmartFilters ?? []
  if (saved.length === 0) {
    return <div style={{ padding: '4px 16px', opacity: 0.7 }}>{t('saved_smart_filter_empty' as any)}</div>
  }
  return (
    <div className='deck-shelves-shelf-list'>
      {saved.map((f) => <SavedSmartFilterRow key={f.id} controller={controller} savedSmartFilter={f} />)}
    </div>
  )
}

export function DeckQAMSettings({ controller }: { controller: SettingsController }) {
  const { t, settings, shelves, actions } = controller
  const platform = usePlatform();
  const lightMode = useLightMode();
  const [disableHideRecents, setDisableHideRecents] = useState(false);
  // Experimental opt-in: ask Steam to render the QAM in the wide layout
  /* so we can show a sidecar to the right of the DS plugin tab. Drives a
     postMessage to the SharedJSContext (window.opener of the QAM) using
     the native Friends & Chat protocol. Dpad-right on the rightmost
     focusable triggers the expand; dpad-left from inside the sidecar
     collapses back. */
  const [qamExpanded, setQamExpanded] = useQamExpanded();
  const dsScopeRef = useRef<HTMLDivElement>(null);
  // Sidecar management (input, compositor expansion, polling) is a singleton
  // over shared state — only the on-screen instance should drive it (see
  // useIsActiveQamTab above) so two mounted panels never fight over it.
  const isActiveTab = useIsActiveQamTab(dsScopeRef);
  useQamCompositorSync(qamExpanded, isActiveTab);
  useDpadExpandBridge(dsScopeRef, setQamExpanded, isActiveTab);
  /* Close the sidecar the way the dpad-left / Steam-menu paths do — narrow the
     compositor via fireQamExpand (not just setQamExpanded) so it never leaves a
     stale-wide empty panel. Shared by the B button (onCancelButton) below. */
  const closeSidecar = useCallback(() => {
    // Use the sidecar's OWN window (as the working dpad-left / Steam-return paths
    // do) so the QamFriendsHidden narrow actually reaches the compositor —
    // getQamWindow() can resolve a window whose opener doesn't post through.
    const win = dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow();
    fireQamExpand(win, false, setQamExpanded);
  }, [setQamExpanded]);
  /* Hard reset on mount: wipe both the live ref and the sessionStorage
     flag so a freshly-mounted DS QAM tab never inherits a stale expanded
     state. Doing this OUTSIDE the React setter avoids racing the
     useQamExpanded hook's initial read; setQamExpanded(false) on unmount
     still fires the event for any concurrent listeners. */
  useEffect(() => {
    if (!isActiveTab) return;
    resetQamExpanded();
    /* Not just setQamExpanded(false): a neutral host's NATIVE tab unmounts and
       remounts across QAM cycles (a loader's tab stays mounted), and on
       remount the compositor can still be stale-WIDE while the store resets
       to closed. Narrow it explicitly — idempotent, a no-op if already narrow. */
    const win = dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow();
    fireQamExpand(win, false, setQamExpanded);
    return () => setQamExpanded(false);
  }, [setQamExpanded, isActiveTab]);
  // First-run feature showcase (opens once; replayable from the AboutPage).
  useFirstRunShowcase(settings, actions);
  /* Dev-only screenshot hook: opens/closes the sidecar the same way a
     dpad-right chord does (`fireQamExpand` widens the QAM compositor window
     via the opener postMessage AND flips the store) — the store flag alone
     doesn't widen the window, so the panel would render off-screen. Gamepad
     input can't be driven over CDP. Stripped from release via `if (!__DEV__)`. */
  useEffect(() => {
    if (!__DEV__ || !isActiveTab) return;
    const g = globalThis as any;
    g.__ds_dev_open_sidecar = () => { fireQamExpand(getQamWindow(), true, setQamExpanded); return true; };
    g.__ds_dev_close_sidecar = () => { fireQamExpand(getQamWindow(), false, setQamExpanded); };
    return () => { try { delete g.__ds_dev_open_sidecar; delete g.__ds_dev_close_sidecar; } catch {} };
  }, [setQamExpanded, isActiveTab]);
  /* Remappable open / close sidecar shortcuts. The defaults (dpad-right ×2 to
     open, dpad-left to close) are served by the nav-aware positional handler
     in `handleDpadInput`. This raw-stream listener only kicks in when the user
     remaps a side away from its dpad default, firing that custom combo globally
     — so the default dpad navigation stays untouched. */
  const openMatcherRef = useRef(createMatcherState());
  const closeMatcherRef = useRef(createMatcherState());
  useEffect(() => {
    if (!isActiveTab) return;
    return subscribeControllerInput((e) => {
      if (!e.pressed) return;
      const s = getCurrentSettings();
      const b = resolveBindings(s?.buttonBindings as any, (s as any)?.buttonBindingsDisabled);
      if (b.navSidecarOpen && b.navSidecarOpen !== DEFAULT_BINDINGS.navSidecarOpen
        && matchEvent({ button: e.button }, parseRawCombo(b.navSidecarOpen), openMatcherRef.current)) {
        fireQamExpand(getQamWindow(), true, setQamExpanded); return;
      }
      if (b.navSidecarClose && b.navSidecarClose !== DEFAULT_BINDINGS.navSidecarClose
        && matchEvent({ button: e.button }, parseRawCombo(b.navSidecarClose), closeMatcherRef.current)) {
        fireQamExpand(getQamWindow(), false, setQamExpanded);
      }
    });
  }, [setQamExpanded, isActiveTab]);
  /* Decky keeps the plugin tab mounted across QAM open/close cycles, so
     without explicit hooks the sidecar stays expanded when the user opens
     a Steam overlay (Steam menu, friends, etc) and comes back to the QAM.
     None of the available signals fires reliably on every path Steam can
     hide the QAM through — listen to all of them. */
  useEffect(() => {
    if (!isActiveTab) return;
    const scope = dsScopeRef.current;
    const doc = scope?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const trace = (label: string) => {
      try {
        const g = globalThis as any;
        if (!Array.isArray(g.__ds_sidecar_signals)) g.__ds_sidecar_signals = [];
        g.__ds_sidecar_signals.push({ t: Date.now(), label, hidden: doc.hidden, hasFocus: doc.hasFocus?.() });
        if (g.__ds_sidecar_signals.length > 40) g.__ds_sidecar_signals.shift();
      } catch {}
    };
    /* Genuine hide signals (doc hidden / pagehide / freeze) collapse outright AND
       arm `sawHide`. The return-side signals (focus / resume) fire on focus GAIN,
       which Steam raises spuriously while the QAM is still visible — gate those on
       a real hide first so they don't collapse the sidecar under the user. The
       m_eOpenSideMenu poll below is the authoritative leave-detector otherwise. */
    /* The leave (Steam overlaying the QAM) fires NO event and m_eOpenSideMenu stays
       QuickAccess (see __ds_sidecar_signals); the reliable RETURN signal is focus /
       resume regained while the doc is still flagged hidden. Do NOT collapse on
       `visibilitychange:visible` — that fed a compositor⇄visibility loop (collapse →
       notifyCompositor → visible again) that pegged the renderer; focus doesn't. */
    const collapse = (label: string) => { trace(label); setQamExpanded(false); };
    /* On RETURN, re-assert the NARROW via fireQamExpand (posts QamFriendsHidden
       unconditionally): the poll already set qamExpanded=false when the Steam
       menu opened, but that narrow was dropped while the QAM hid, so it re-shows
       stale-WIDE with no content ("open + empty"). setQamExpanded(false) is a
       no-op here; fireQamExpand always posts. On `focus` — no resize re-fire. */
    const collapseOnReturn = (label: string) => { trace(label); if (doc.hidden) fireQamExpand(win, false, setQamExpanded); };
    const onVis = () => { if (doc.hidden) collapse("visibilitychange:hidden"); else trace("visibilitychange:visible"); };
    doc.addEventListener("visibilitychange", onVis);
    const onFocus = () => collapseOnReturn("window.focus");
    win.addEventListener("focus", onFocus);
    const onPageHide = () => collapse("pagehide");
    win.addEventListener("pagehide", onPageHide);
    const onFreeze = () => collapse("freeze");
    const onResume = () => collapseOnReturn("resume");
    doc.addEventListener("freeze", onFreeze);
    doc.addEventListener("resume", onResume);
    return () => {
      doc.removeEventListener("visibilitychange", onVis);
      win.removeEventListener("focus", onFocus);
      win.removeEventListener("pagehide", onPageHide);
      doc.removeEventListener("freeze", onFreeze);
      doc.removeEventListener("resume", onResume);
    };
  }, [setQamExpanded, isActiveTab]);

  // Authoritative signal for "QAM is no longer the active side menu":
  // `SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_MenuStore
  // .m_eOpenSideMenu`. This MobX-backed enum flips between None / MainMenu
  /* / QuickAccess when Steam opens overlays on top of the QAM. Polling at
     300 ms is cheap (a property read), only runs while the sidecar is
     expanded, and stops as soon as we collapse. Captures the value seen
     at mount as the "active QAM" reference value — anything different
     afterwards means the QAM lost focus to another overlay. */
  useEffect(() => {
    if (!isActiveTab || !qamExpanded) return;
    const doc = dsScopeRef.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const getMenuState = (): number | null => {
      try {
        const opener = (win as any).opener;
        const ms = opener?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.m_MenuStore;
        return typeof ms?.m_eOpenSideMenu === "number" ? ms.m_eOpenSideMenu : null;
      } catch { return null; }
    };
    const refValue = getMenuState();
    let lastTick = Date.now();
    try {
      const g = globalThis as any;
      if (!Array.isArray(g.__ds_sidecar_signals)) g.__ds_sidecar_signals = [];
      g.__ds_sidecar_signals.push({ t: lastTick, label: "poll-start", ref: refValue, focus: doc.hasFocus?.() });
      if (g.__ds_sidecar_signals.length > 40) g.__ds_sidecar_signals.shift();
    } catch {}
    const id = window.setInterval(() => {
      try {
        const now = Date.now();
        const gap = now - lastTick;
        lastTick = now;
        const menuState = getMenuState();
        const menuChanged = refValue !== null && menuState !== null && menuState !== refValue;
        /* `doc.hasFocus()` is unusable in GamepadUI — the QAM popup document never
           holds DOM focus even while its sidecar is in use, so the old `noFocus`
           term collapsed on the first tick (~300 ms after open; see
           __ds_sidecar_signals). m_eOpenSideMenu is the authoritative signal —
           keep it + the background-resume guard (>1.5 s gap while non-visible). */
        const resumedFromBackground = gap > 1500 && doc.visibilityState !== "visible";
        if (menuChanged || resumedFromBackground) {
          traceSidecarCollapse(now, menuChanged, false, refValue, menuState, gap);
          setQamExpanded(false);
          window.clearInterval(id);
        }
      } catch {}
    }, 300);
    return () => window.clearInterval(id);
  }, [qamExpanded, setQamExpanded, isActiveTab]);
  const hiddenToggles: string[] = (settings as any).qamHiddenToggles ?? []
  const hiddenSections: string[] = (settings as any).qamHiddenSections ?? []
  const isHid = (k: string) => isToggleHiddenWithAncestors(k, hiddenToggles)
  const isSecHid = (id: string) => hiddenSections.includes(id)
  const [hasTabMaster] = useState(() => isTabMasterInstalled())
  const [hasNonSteamBadges] = useState(() => isNonSteamBadgesAvailable())
  // CSS Loader presence — the force-themes toggle only shows when at least
  // one CSS Loader theme is loaded. Re-check shortly after mount in case
  // the panel opens before CSS Loader has injected its stylesheets.
  const [hasCssLoader, setHasCssLoader] = useState(() => {
    try { return isCssLoaderActive(); } catch { return false; }
  });
  useEffect(() => {
    const tick = () => {
      try {
        const next = isCssLoaderActive();
        setHasCssLoader((prev) => (prev === next ? prev : next));
      } catch {}
    };
    const t1 = setTimeout(tick, 500);
    const t2 = setTimeout(tick, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Force re-render when external plugins (un)register import descriptors
  // so the ImportMenuButton picks up the change without a full QAM remount.
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

  // Register TabMaster import as a first-party entry on the public registry.
  // The hook always runs; body bails when TabMaster isn't present.
  useEffect(() => {
    if (!hasTabMaster) return
    const unsub = registerInternalImportType({
      id: 'tabmaster',
      displayName: t('import_from_tabmaster'),
      target: 'shelves',
      icon: icons.tabMaster,
      runImport: () => { openManagedModal((close) => <ImportFromCustomFiltersModal closeModal={close} controller={controller} />) },
    })
    return unsub
  }, [hasTabMaster, t, controller])

  /* Compute whether the "hide recents" and "hero background" toggles should be
     inactive.  They become disabled when there are no visible shelves or none of
     the visible shelves resolve to results.  This runs regardless of the current
     toggle value so that the UI accurately reflects the shelf state.
     IMPORTANT: we never force-change the toggle values — only disable interaction. */
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
    void compute();
    const onEvent = (e: Event) => { const d = (e as CustomEvent)?.detail; setDisableHideRecents(Boolean(d?.disabled)); };
    globalThis.addEventListener('deck-shelves-hideRecents-disabled', onEvent);
    return () => { alive = false; globalThis.removeEventListener('deck-shelves-hideRecents-disabled', onEvent); };
  }, [shelves, platform]);

  // Hooks must all be above this early return so call order stays stable
  // across renders (settings flips from undefined → loaded after the first
  // controller hydration tick).
  if (!settings) return <div style={{ padding: 16 }}>{t('loading')}</div>
  const isFirstRun = shelves.length === 0 && !settings.enabled
  // Always use the unified Create modal (Standard + Smart tabs) so
  // users can create either type regardless of the unified-list flag.
  const handleAdd = () => openManagedModal((close) => (
    <CreateShelfModal closeModal={close} controller={controller} />
  ))
  const handleImport = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={joinDownloads('deck-shelves-shelves.json')} scope='shelves' />)
  const handleExport = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={getUserDownloadsDir()} scope='shelves' />)
  const handleImportSmart = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={joinDownloads('deck-shelves-smart-shelves.json')} scope='smart' />)
  const handleExportSmart = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={getUserDownloadsDir()} scope='smart' />)
  const handleImportAll = () => openManagedModal((close) => <ImportModal closeModal={close} controller={controller} initialPath={joinDownloads('deck-shelves.json')} scope='all' />)
  const handleExportAll = () => openManagedModal((close) => <ExportModal closeModal={close} controller={controller} folderPath={getUserDownloadsDir()} scope='all' />)
  const buildImportEntries = (target: 'shelves' | 'smart_shelves'): ImportEntry[] => {
    void importsBump // re-evaluate on registry changes
    return getExternalImportTypesForTarget(target).map((d) => ({
      id: d.id,
      label: descriptorName(t, d),
      icon: (d.icon as ReactNode) ?? icons.import,
      okDescription: descriptorName(t, d),
      onActivate: async () => {
        if (typeof d.runImport === 'function') { try { await d.runImport() } catch {} return }
        if (typeof d.parse === 'function') logInfo('SETTINGS', 'import descriptor has parse() but no runImport()', { id: d.id })
      },
    }))
  }
  const handleResetShelves = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='shelves' />)
  const handleResetSmart = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='smart' />)
  const handleResetAll = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} />)
  const handleAddSmart = () => openManagedModal((close) => <CreateShelfModal closeModal={close} controller={controller} initialTab="smart" />)

  return (
    <div ref={dsScopeRef} className='deck-shelves-qam-scope' data-ds-qam-expanded={qamExpanded ? '1' : '0'}>
      <DeckQAMStyles />
      <Focusable className='deck-shelves-qam-flex' flow-children='row' noFocusRing>
      <Focusable className='deck-shelves-qam-main' noFocusRing onCancelButton={sidecarCancelHandler(qamExpanded, closeSidecar)} onButtonDown={(evt: any) => mainCancelButtonDown(evt, qamExpanded, closeSidecar)}>
      <UpdateBanner controller={controller} />

      <ToggleField
        label={t('enabled')}
        checked={settings.enabled && !mountCrashed}
        disabled={mountCrashed}
        onChange={(value: boolean) => actions.setEnabled(value)}
      />
      {(() => mountCrashed && (
        <MountCrashBanner controller={controller} error={crashError} onDismiss={() => { setMountCrashed(false); setCrashError(null) }} />
      ))()}
      {(() => isFirstRun ? <FirstRunBanner controller={controller} /> : null)()}

      {/* Profiles section sits ABOVE Behavior; the component hides itself
          when the user has zero shelves (regular + smart combined). */}
      <ProfilesSection controller={controller} hidden={isSecHid('profiles')} />

      {(() => {
        if (isSecHid('behavior')) return null;
        return (
      <CollapsibleSection id='behavior' icon={<SlidersIcon />} title={t('section_behavior')} count={[settings.hideRecents === true, settings.hideHomeTabs === true, settings.shelfHeroBackground === true, settings.recentsReplaceSource === true].filter(Boolean).length}>
        {(() => (<>
        {settings.enabled && !isHid('hideRecents') && (
          <ToggleField label={t('hide_recents')} checked={settings.hideRecents === true} disabled={mountCrashed || disableHideRecents} onChange={(value: boolean) => actions.setHideRecents(value)} />
        )}
        </>))()}
        {(() => (
        settings.enabled && settings.hideRecents === true && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            {!isHid('shelfHeroBackground') && (
              <ToggleField label={t('shelf_hero_background')} checked={settings.shelfHeroBackground === true} disabled={mountCrashed || disableHideRecents} onChange={(value: boolean) => actions.setShelfHeroBackground(value)} />
            )}
            {!isHid('recentsReplaceSource') && (
              <>
                <ToggleField label={t('recents_replace_source')} checked={settings.recentsReplaceSource === true && !replaceFailed} disabled={mountCrashed || disableHideRecents || replaceFailed} onChange={(value: boolean) => actions.setRecentsReplaceSource(value)} />
                <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
                  {t('recents_replace_source_desc' as any)}
                </div>
              </>
            )}
          </div>
        )
        ))()}
        {(() => (<>
        {!isHid('hideHomeTabs') && (
          <ToggleField label={t('hide_home_tabs')} checked={settings.hideHomeTabs === true} onChange={(value: boolean) => actions.setHideHomeTabs(value)} />
        )}
        {!lightMode && !isHid('autoCollapseEnabled') && <ToggleField label={t('auto_collapse_enabled' as any)} checked={(settings as any).autoCollapseEnabled === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setAutoCollapseEnabled?.(value)} />}
        {!isHid('notificationsDisabled') && <ToggleField label={t('notifications_disabled_label' as any)} checked={(settings as any).notificationsDisabled === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setNotificationsDisabled?.(value)} />}
        {!isHid('notificationsDisabled') && <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{t('notifications_disabled_desc' as any)}</div>}
        {!isHid('notificationsDisabled') && <NotificationAreaToggles settings={settings} actions={actions} t={t as any} disabled={mountCrashed} />}
        </>))()}
      </CollapsibleSection>
        );
      })()}

      {(() => {
        if (isSecHid('additional')) return null;
        return (
      <CollapsibleSection id='additional' icon={<PlusCircleIcon />} title={t('section_additional_features')} count={[settings.updateNotifyEnabled !== false, (settings as any).contextSearchEnabled === true, (settings as any).sideNavEnabled === true, settings.onlineFeaturesEnabled === true, settings.forceCssLoaderThemes === true].filter(Boolean).length}>
        {(() => (<>
        {!isHid('updateNotifyEnabled') && (
          <ToggleField label={t('check_for_updates')} checked={settings.updateNotifyEnabled !== false} onChange={(value: boolean) => actions.setUpdateNotifyEnabled(value)} />
        )}
        {!isHid('betaChannelEnabled') && settings.updateNotifyEnabled !== false && (
          <div style={{ paddingLeft: 16 }}>
            <ToggleField label={t('beta_channel_label' as any)} checked={(settings as any).betaChannelEnabled === true} disabled={mountCrashed} onChange={(value: boolean) => (actions as any).setBetaChannelEnabled(value)} />
          </div>
        )}
        {!isHid('lightModeEnabled') && (
          <ToggleField label={t('light_mode_enabled' as any)} checked={(settings as any).lightModeEnabled === true} onChange={(v: boolean) => { if (v && (settings as any).advancedModeEnabled === true) { confirmAction({ title: t('mode_switch_title' as any), body: t('mode_switch_light_body' as any), okText: t('confirm_continue' as any), cancelText: t('cancel'), onConfirm: () => (actions as any).setLightModeEnabled?.(true) }) } else { (actions as any).setLightModeEnabled?.(v) } }} />
        )}
        {!isHid('advancedModeEnabled') && (
          <ToggleField label={t('advanced_mode_enabled' as any)} checked={(settings as any).advancedModeEnabled === true} onChange={(v: boolean) => { if (v && (settings as any).lightModeEnabled === true) { confirmAction({ title: t('mode_switch_title' as any), body: t('mode_switch_advanced_body' as any), okText: t('confirm_continue' as any), cancelText: t('cancel'), onConfirm: () => (actions as any).setAdvancedModeEnabled?.(true) }) } else { (actions as any).setAdvancedModeEnabled?.(v) } }} />
        )}
        {!isHid('offlineModeEnabled') && (
          <ToggleField label={t('offline_mode_enabled' as any)} checked={(settings as any).offlineModeEnabled === true} onChange={(v: boolean) => (actions as any).setOfflineModeEnabled?.(v)} />
        )}
        </>))()}
        {(() => {
          const showCtx = !lightMode && !isHid('contextSearchEnabled');
          const ctxSub = showCtx && (settings as any).contextSearchEnabled === true;
          return (<>
        {showCtx && (
          <ToggleField label={t('context_search_toggle' as any)} checked={(settings as any).contextSearchEnabled === true} onChange={(v: boolean) => (actions as any).setContextSearchEnabled(v)} />
        )}
        {showCtx && (
          <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
            {t('context_search_combo' as any, { combo: formatComboForDisplay(resolveBindings((settings as any).buttonBindings).navSearch) })}
          </div>
        )}
        {ctxSub && (
          <ToggleField label={t('context_search_keyboard' as any)} checked={(settings as any).contextSearchKeyboardEnabled !== false} onChange={(v: boolean) => (actions as any).setContextSearchKeyboardEnabled(v)} />
        )}
        {ctxSub && (
          <ToggleField label={t('context_search_on_enter' as any)} checked={(settings as any).contextSearchOnEnter === true} onChange={(v: boolean) => (actions as any).setContextSearchOnEnter(v)} />
        )}
          </>);
        })()}
        {(() => {
          const showSideNav = !lightMode && !isHid('sideNavEnabled');
          return (<>
        {showSideNav && (
          <ToggleField label={t('side_nav_toggle' as any)} checked={(settings as any).sideNavEnabled === true} onChange={(v: boolean) => (actions as any).setSideNavEnabled(v)} />
        )}
        {showSideNav && (
          <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
            {t('side_nav_combo' as any, { combo: formatComboForDisplay(resolveBindings((settings as any).buttonBindings).navSideNav) })}
          </div>
        )}
          </>);
        })()}
        {(() => (<>
        {!isHid('onlineFeaturesEnabled') && (
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
        )}
        {!isHid('onlineFeaturesEnabled') && (
        <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <OnlineIcon size={12} /><span>{t('online_features_desc')}</span>
        </div>
        )}
        </>))()}
        {(() => (
        settings.onlineFeaturesEnabled === true && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            {!isHid('onlineWishlistEnabled') && <ToggleField label={t('online_wishlist')} checked={settings.onlineWishlistEnabled !== false} onChange={(value: boolean) => void actions.setOnlineWishlistEnabled(value)} />}
            {(settings as any).advancedModeEnabled === true && !isHid('onlineMetadataEnabled') && (<><ToggleField label={t('online_metadata')} checked={settings.onlineMetadataEnabled === true} onChange={(value: boolean) => void actions.setOnlineMetadataEnabled(value)} /><div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{t('online_metadata_desc')}</div></>)}
            {!isHid('onlinePriceSortEnabled') && (
              <ToggleField label={t('online_price_sort')} checked={settings.onlinePriceSortEnabled !== false} onChange={(value: boolean) => void actions.setOnlinePriceSortEnabled(value)} />
            )}
            {!isHid('onlineHideOwnedGames') && (
              <ToggleField label={t('online_hide_owned')} checked={settings.onlineHideOwnedGames !== false} onChange={(value: boolean) => { void actions.setOnlineHideOwnedGames(value); if (!value) void actions.setOnlineHideOwnedNonSteam(false); }} />
            )}
            {(() => (
            settings.onlineHideOwnedGames !== false && (
              <div style={{ paddingLeft: 16 }}>
                {!isHid('onlineHideOwnedNonSteam') && (
                  <ToggleField label={t('hide_owned_non_steam')} checked={settings.onlineHideOwnedNonSteam === true} onChange={(value: boolean) => void actions.setOnlineHideOwnedNonSteam(value)} />
                )}
                {settings.onlineHideOwnedNonSteam === true && (
                  <div style={{ paddingLeft: 16 }}>
                    {!isHid('onlineHideOwnedNonSteamCloud') && (
                      <ToggleField label={t('hide_owned_non_steam_cloud')} checked={settings.onlineHideOwnedNonSteamCloud === true} onChange={(value: boolean) => void actions.setOnlineHideOwnedNonSteamCloud(value)} />
                    )}
                  </div>
                )}
              </div>
            )
            ))()}
          </div>
        )
        ))()}
        {(() => (
        hasCssLoader && !lightMode && !isHid('forceCssLoaderThemes') && (
          <ToggleField label={t('force_themes_label')} checked={settings.forceCssLoaderThemes === true} onChange={(value: boolean) => void actions.setForceCssLoaderThemes(value)} />
        )
        ))()}
      </CollapsibleSection>
        );
      })()}

      {replaceFailed && (
        <RecentsReplaceErrorBanner controller={controller} error={replaceError} onDismiss={() => { setReplaceFailed(false); setReplaceError(null) }} />
      )}

      <CollapsibleSection id='shelves' icon={<StackIcon />} title={t('shelves_section')} count={shelves.filter(s => s.enabled && !s.hidden).length} initialOpen>
        {/* `childrenLayout="below"` + `childrenContainerWidth="max"` give Decky's
            Field the full row width — without them the empty-label slot grabs
            ~half the row and the `space-between` Focusable overflows right (CDP:
            width 150 in a 300-wide scope, pushing the rightmost button to 457). */}
        <Field className='no-sep' childrenLayout='below' childrenContainerWidth='max'>
          <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', padding: '0 16px' }}>
            <div style={{ display: 'flex' }}>
              <ActionButton iconNode={icons.add} onClick={handleAdd} okDescription={t('add_shelf')} />
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
        {(settings as any).unifiedListEnabled === true
          ? <UnifiedShelvesPanelSection controller={controller} />
          : <ShelvesPanelSection controller={controller} />}
      </CollapsibleSection>

      {(() => {
        if (!(settings.enabled && !isSecHid('smart') && (settings as any).unifiedListEnabled !== true)) return null;
        return (
      <CollapsibleSection id='smart' icon={<SparkleIcon />} title={t('smart_section_header')} count={settings.smartShelvesEnabled ? (settings.smartShelves ?? []).filter((s: any) => !s.hidden).length : 0}>
        {(() => (<>
        {!isHid('smartShelvesEnabled') && (
        <ToggleField
          label={t('smart_shelves_enabled')}
          checked={settings.smartShelvesEnabled === true}
          disabled={mountCrashed}
          onChange={(value: boolean) => actions.setSmartShelvesEnabled(value)}
        />
        )}
        {settings.smartShelvesEnabled && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            {!lightMode && !isHid('smartShelvesAtBottom') && <ToggleField label={t('smart_shelves_at_bottom')} checked={settings.smartShelvesAtBottom === true} disabled={mountCrashed} onChange={(value: boolean) => actions.setSmartShelvesAtBottom(value)} />}
            {!lightMode && !isHid('smartSurpriseMe') && (
            <ToggleField
              label={t('smart_surprise_me')}
              checked={settings.smartSurpriseMe === true}
              disabled={mountCrashed}
              onChange={(value: boolean) => actions.setSmartSurpriseMe(value)}
            />
            )}
          </div>
        )}
        </>))()}
        {(() => (
        settings.smartShelvesEnabled && settings.smartSurpriseMe && (
          <div style={{ paddingLeft: 14, fontSize: 12 }}>
            <DSSliderField
              label={t('smart_surprise_count')}
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
        )
        ))()}
        {(() => (<>
        {settings.smartShelvesEnabled && !settings.smartSurpriseMe && (settings.smartShelves ?? []).length === 0 && (
          <SmartShelvesFirstRunBanner controller={controller} onAdd={handleAddSmart} />
        )}
        {settings.smartShelvesEnabled && !settings.smartSurpriseMe && (settings.smartShelves ?? []).length > 0 && (
          <>
            <div style={{ marginTop: 8 }} />
            <div className='deck-shelves-separator' />
            <Field className='no-sep' childrenLayout='below' childrenContainerWidth='max'>
              <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', padding: '0 16px' }}>
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
        </>))()}
      </CollapsibleSection>
        );
      })()}

      <VisualGlobalSection controller={controller} hidden={isSecHid('visual_global')} isHid={isHid} lightMode={lightMode} mountCrashed={mountCrashed} hasNonSteamBadges={hasNonSteamBadges} />

      {(() => {
        if (!(settings.enabled && (settings.savedFilters?.length ?? 0) > 0 && !isSecHid('saved_filters'))) return null;
        return (
      <CollapsibleSection
        id='saved_filters'
        icon={<BookmarkIcon />}
        title={t('saved_filters_section')}
        count={settings.savedFilters?.length ?? 0}
      >
        <SavedFiltersList controller={controller} />
      </CollapsibleSection>
        );
      })()}

      {(() => {
        if (!(settings.enabled && (settings.savedSmartFilters?.length ?? 0) > 0 && !isSecHid('saved_smart_filters'))) return null;
        return (
      <CollapsibleSection
        id='saved_smart_filters'
        icon={<BookmarkIcon />}
        title={t('saved_smart_filters_section' as any)}
        count={settings.savedSmartFilters?.length ?? 0}
      >
        <SavedSmartFiltersList controller={controller} />
      </CollapsibleSection>
        );
      })()}

      <Field className='no-sep' childrenLayout='below' childrenContainerWidth='max'>
        {/* `padding: 0 16px` matches the per-section action rows above
            so the trailing import / export / reset trio aligns with the
            shelf-list left and right edges (16 px from each side). */}
        <Focusable style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', padding: '0 16px' }}>
          <div style={{ display: 'flex' }}>
            <ActionButton iconNode={icons.import} onClick={handleImportAll} okDescription={t('import_settings')} />
            <div style={{ marginLeft: '10px' }}><ActionButton iconNode={icons.export} onClick={handleExportAll} okDescription={t('export_settings')} /></div>
          </div>
          <ActionButton iconNode={icons.reset} onClick={handleResetAll} okDescription={t('reset_all_button')} />
        </Focusable>
      </Field>
      <VersionFooter />
      </Focusable>
      {shouldRenderSidecar(isActiveTab, qamExpanded) && (
        <SidecarPanel controller={controller} onCollapse={closeSidecar} />
      )}
      </Focusable>
    </div>
  )
}
