import { useEffect, useRef, useState } from 'react'
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
import { GearIcon, SlidersIcon, StackIcon, SparkleIcon, BookmarkIcon, PlusCircleIcon, OnlineIcon } from './icons'
import { UpdateBanner } from './qam/UpdateBanner'
import { useQamExpanded, resetQamExpanded } from './qam/qamExpandedStore'
import { trackFeature } from '../steam/usageTracking'
import { GeneralTab } from './qam/sidecar/GeneralTab'
import { confirmAction } from './qam/modals/ConfirmActionModal'
import { ProfilesSection } from './qam/sections/ProfilesSection'
import { VisualGlobalSection } from './qam/sections/VisualGlobalSection'
import { ErrorBoundary } from './ErrorBoundary'

const DPAD_RIGHT = 23;

function rectEdges(rect: DOMRect | undefined, win: Window): { right: number; bottom: number } {
  return { right: rect?.right ?? win.innerWidth, bottom: rect?.bottom ?? win.innerHeight };
}
try {
  (globalThis as unknown as Record<string, unknown>).__ds_module_loaded__ = 'DeckQAMSettings@' + Date.now();
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__ds_module_loaded_w__ = 'win@' + Date.now();
  }
  try { document.documentElement.setAttribute('data-ds-module-loaded', 'yes@' + Date.now()); } catch {}
} catch {}

type NavNode = {
  m_element?: HTMLElement;
  m_rgChildren?: NavNode[];
  BTakeFocus?: (reason: number) => boolean;
};

function findNavNodeForElement(node: NavNode | undefined, target: HTMLElement): NavNode | null {
  if (!node) return null;
  if (node.m_element === target) return node;
  for (const c of (node.m_rgChildren ?? [])) {
    const r = findNavNodeForElement(c, target);
    if (r) return r;
  }
  return null;
}

function activeNavRoot(el: HTMLElement): NavNode | undefined {
  const opener = (el.ownerDocument.defaultView?.opener ?? null) as {
    SteamUIStore?: { NavigationManager?: { m_ActiveContext?: { m_LastActiveNavTree?: { m_Root?: NavNode } } } };
  } | null;
  return opener?.SteamUIStore?.NavigationManager?.m_ActiveContext?.m_LastActiveNavTree?.m_Root;
}

function takeNavTreeFocus(el: HTMLElement): boolean {
  try {
    const root = activeNavRoot(el);
    if (!root) return false;
    const node = findNavNodeForElement(root, el);
    if (!node?.BTakeFocus) return false;
    return !!node.BTakeFocus(0);
  } catch { return false; }
}

/* Eye-column vertical nav: when Steam moves focus off an eye button to a
   non-eye element on a DIFFERENT visual row, redirect to the adjacent eye so
   up/down keeps traversing the eye column. Extracted from the sidecar
   MutationObserver to keep that callback flat. */
function redirectEyeNav(doc: Document, prev: HTMLElement | null, f: HTMLElement | null): void {
  if (!prev || !f || prev === f) return;
  const prevIsEye = prev.classList.contains('ds-eye-btn');
  const fIsEye = f.classList.contains('ds-eye-btn');
  const inSidecar = !!f.closest('.deck-shelves-qam-sidecar');
  if (inSidecar && prevIsEye && !fIsEye) focusAdjacentEye(doc, prev, f);
}

function focusAdjacentEye(doc: Document, prev: HTMLElement, f: HTMLElement): void {
  // Only redirect on a row change (vertical nav); horizontal nav stays put.
  const prevRow = prev.closest('.ds-hide-row, .ds-collapsible-row') as HTMLElement | null;
  const curRow = f.closest('.ds-hide-row, .ds-collapsible-row') as HTMLElement | null;
  const movedRow = !!prevRow && !!curRow && prevRow !== curRow;
  if (!movedRow) return;
  const dy = f.getBoundingClientRect().y - prev.getBoundingClientRect().y;
  const eyes = Array.from(doc.querySelectorAll('.deck-shelves-qam-sidecar .ds-eye-btn')) as HTMLElement[];
  const idx = eyes.indexOf(prev);
  const target = eyes[dy > 0 ? idx + 1 : idx - 1];
  if (target && target !== f) {
    takeNavTreeFocus(target);
    window.setTimeout(() => {
      const cur = doc.querySelector('.gpfocus') as HTMLElement | null;
      if (cur !== target) takeNavTreeFocus(target);
    }, 30);
  }
}

function SidecarPanel({ controller, onCollapse }: { controller: SettingsController; onCollapse: () => void }) {
  // If the controller isn't fully ready (settings unhydrated), the inner
  // GeneralTab `if (!settings) return null` short-circuits and the sidecar
  // would render as an empty body — which is what users see after the
  /* Steam-menu-over-QAM cycle when Decky re-mounts the plugin tab before
     refreshSettings has populated state. Bail at this layer so the
     sidecar simply doesn't appear at all in that state; the caller's
     qamExpanded flag stays in sync and the user gets either "closed" or
     "open with content" — never the bug-state of "open with no content". */
  if (!controller?.settings) return null;
  const innerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    /* Take focus on the first focusable INSIDE the sidecar. We avoid
       giving the wrapper itself an `onActivate` so the wrapper is a
       pure container (layout-only) and Steam's nav can move between
       inner focusables instead of stopping at the wrapper. */
    const id = window.setTimeout(() => {
      const el = innerRef.current;
      if (!el) return;
      const first = el.querySelector('.Focusable') as HTMLElement | null;
      if (first) takeNavTreeFocus(first);
    }, 90);
    return () => window.clearTimeout(id);
  }, []);
  /* Size the sidecar from the live QAM panel + plugin tab dimensions so the
     panel fits whatever screen size Steam is rendering at (handheld,
     docked TV, Big Picture on 4K, custom window sizes). Fallbacks keep the
     legacy 503×440 values whenever measurements aren't available yet. */
  useEffect(() => {
    const innerEl = innerRef.current;
    if (!innerEl) return;
    const doc = innerEl.ownerDocument;
    const win = doc.defaultView ?? window;
    const measure = () => {
      const sideEl = doc.querySelector('.deck-shelves-qam-sidecar') as HTMLElement | null;
      if (!sideEl) return;
      const scope = doc.querySelector('.deck-shelves-qam-scope') as HTMLElement | null;
      const main = doc.querySelector('.deck-shelves-qam-main') as HTMLElement | null;
      // The QAM tab's dark panel that hosts every plugin tab content area.
      // The class is obfuscated but consistently present; if Steam ever
      // renames it we fall back to the viewport.
      const panel = (doc.querySelector('._2BB6uf--jFaAmdnwLOqMU7') as HTMLElement | null)
        ?? (scope?.closest('[id^="quickaccess_content_"]') as HTMLElement | null);
      const mainRect = main?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const sRect = sideEl.getBoundingClientRect();
      if (mainRect) {
        // Anchor the sidecar to the right edge of the plugin tab so we
        // adapt if the main tab width ever changes.
        sideEl.style.left = `${Math.round(mainRect.width)}px`;
      }
      const { right: targetRight, bottom: targetBottom } = rectEdges(panelRect, win);
      const w = Math.max(280, Math.round(targetRight - sRect.left));
      const h = Math.max(320, Math.round(targetBottom - sRect.top + 8));
      sideEl.style.width = `${w}px`;
      sideEl.style.height = `${h}px`;
    };
    measure();
    // Re-measure on viewport resize and on Steam Deck dock/undock events.
    const ro = new ResizeObserver(measure);
    ro.observe(doc.documentElement);
    win.addEventListener('resize', measure);
    // Re-measure shortly after mount to catch QAM layout settling.
    const t1 = win.setTimeout(measure, 60);
    const t2 = win.setTimeout(measure, 240);
    return () => {
      ro.disconnect();
      win.removeEventListener('resize', measure);
      win.clearTimeout(t1);
      win.clearTimeout(t2);
    };
  }, []);
  return (
    <Focusable
      className='deck-shelves-qam-sidecar'
      onCancelButton={onCollapse}
      noFocusRing
    >
      <div className='ds-sidecar-title'>
        <GearIcon size={16} style={{ marginRight: 8 }} />
        {controller.t('settings_title')}
      </div>
      <div className='ds-sidecar-body' ref={innerRef}>
        <ErrorBoundary title='Deck Shelves — Configurações'>
          <GeneralTab controller={controller} />
        </ErrorBoundary>
      </div>
    </Focusable>
  );
}

function focusKeyForExpand(doc: Document): string {
  const el = doc.querySelector('.gpfocus') as HTMLElement | null;
  if (!el) return '';
  const r = el.getBoundingClientRect();
  return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`;
}

function fireQamExpand(win: Window | null, value: boolean, setQamExpanded: (v: boolean) => void): void {
  const opener = (win?.opener ?? null) as Window | null;
  try {
    opener?.postMessage(
      { message: value ? 'QamFriendsExpanded' : 'QamFriendsHidden' },
      'https://steamloopback.host',
    );
  } catch {}
  setQamExpanded(value);
  if (value) trackFeature('sidecar');
}

function useQamCompositorSync(qamExpanded: boolean): void {
  useEffect(() => {
    const opener = (getQamWindow()?.opener ?? null) as Window | null;
    if (!opener) return;
    try {
      opener.postMessage(
        { message: qamExpanded ? 'QamFriendsExpanded' : 'QamFriendsHidden' },
        'https://steamloopback.host',
      );
    } catch {}
    return () => {
      try {
        opener.postMessage(
          { message: 'QamFriendsHidden' },
          'https://steamloopback.host',
        );
      } catch {}
    };
  }, [qamExpanded]);
}

type OpenerWithInput = {
  SteamClient?: {
    Input?: {
      RegisterForControllerInputMessages?: (
        cb: (slot: number, button: number, pressed: boolean) => void,
      ) => { unregister?: () => void };
    };
  };
};

function setAttr(el: HTMLElement | null, name: string, value: string): void {
  try { el?.setAttribute(name, value); } catch {}
}

type InputApi = NonNullable<NonNullable<OpenerWithInput['SteamClient']>['Input']>;

function traceInputApi(scope: HTMLElement | null, realWin: unknown, opener: OpenerWithInput | null, Input: InputApi | null): void {
  setAttr(scope, 'data-ds-real-win', realWin ? 'yes' : 'no');
  setAttr(scope, 'data-ds-opener', opener ? 'yes' : 'no');
  setAttr(scope, 'data-ds-register', Input?.RegisterForControllerInputMessages ? 'yes' : 'no');
}

function getInputApiFromScope(scope: HTMLElement | null): InputApi | null {
  const realWin = (scope?.ownerDocument?.defaultView ?? null) as (Window & OpenerWithInput) | null;
  const opener = (realWin?.opener ?? null) as OpenerWithInput | null;
  const Input = opener?.SteamClient?.Input ?? null;
  traceInputApi(scope, realWin, opener, Input);
  return Input;
}

function installDpadListener(
  scopeRef: { current: HTMLElement | null },
  setQamExpanded: (v: boolean) => void,
): () => void {
  const scope = scopeRef.current;
  setAttr(scope, 'data-ds-bridge', 'entered@' + Date.now());
  const Input = getInputApiFromScope(scope);
  if (!Input?.RegisterForControllerInputMessages) return () => undefined;
  let reg: { unregister?: () => void } | undefined;
  try {
    // Call as a method so `this` is bound to Input (Steam's bridge throws
    // "Unknown method" if the function reference is detached).
    reg = Input.RegisterForControllerInputMessages((_slot, button, pressed) => {
      const liveScope = scopeRef.current;
      setAttr(liveScope, 'data-ds-last-input', `${button}/${pressed}@${Date.now()}`);
      if (liveScope) handleDpadInput(liveScope, button, pressed, setQamExpanded);
    });
  } catch (e) {
    setAttr(scope, 'data-ds-reg-err', String(e).substring(0, 80));
    return () => undefined;
  }
  setAttr(scope, 'data-ds-reg', reg ? 'yes' : 'no');
  return () => { try { reg?.unregister?.(); } catch {} };
}

function getQamWindow(): (Window & OpenerWithInput) | null {
  // The plugin runs in a sandboxed JS context; the QAM's "real" window is
  // reachable through the shared DOM via `document.defaultView`.
  try {
    return (document.defaultView ?? null) as (Window & OpenerWithInput) | null;
  } catch {
    return null;
  }
}

function useDpadExpandBridge(
  scopeRef: { current: HTMLElement | null },
  setQamExpanded: (v: boolean) => void,
): void {
  useEffect(() => installDpadListener(scopeRef, setQamExpanded), [scopeRef, setQamExpanded]);
  // Track `.gpfocus` movements so we know "focus was just in the sidecar"
  // even when Steam's nav moves it back to main before our controller-input
  // listener has a chance to run.
  useEffect(() => {
    const scope = scopeRef.current;
    const doc = scope?.ownerDocument ?? document;
    let prev: HTMLElement | null = null;
    const obs = new MutationObserver(() => {
      const f = doc.querySelector('.gpfocus') as HTMLElement | null;
      if (f && f.closest('.deck-shelves-qam-sidecar')) {
        lastFocusWasInSidecar = true;
      }
      redirectEyeNav(doc, prev, f);
      prev = f;
    });
    obs.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    return () => obs.disconnect();
  }, [scopeRef]);
}

const DPAD_LEFT = 22;
const DPAD_UP = 20;
const DPAD_DOWN = 21;

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

/* Tracks whether the previous focus we saw from this handler was inside the
   sidecar. Needed because Steam processes dpad-left and moves the gamepad
   focus from sidecar back to main *before* our SteamClient.Input listener
   runs — by the time we look at `.gpfocus`, the user has already "left"
   the sidecar visually. */
let lastFocusWasInSidecar = false;
let lastRightTarget: HTMLElement | null = null;

function traceSidecarCollapse(now: number, menuChanged: boolean, noFocus: boolean, refValue: number | null, menuState: number | null, gap: number): void {
  try {
    const g = globalThis as any;
    if (!Array.isArray(g.__ds_sidecar_signals)) g.__ds_sidecar_signals = [];
    g.__ds_sidecar_signals.push({ t: now, label: "poll-collapse", reason: menuChanged ? `menu:${refValue}->${menuState}` : noFocus ? "noFocus" : `gap:${gap}` });
    if (g.__ds_sidecar_signals.length > 40) g.__ds_sidecar_signals.shift();
  } catch {}
}

function isDpadButton(button: number): boolean {
  return button === DPAD_RIGHT || button === DPAD_LEFT || button === DPAD_UP || button === DPAD_DOWN;
}

function currentPositionalBindings(): { open: boolean; close: boolean } {
  // Positional open/close only runs while its binding is the default dpad
  // combo (and enabled). Remapped away → the global raw-combo listener owns
  // it and dpad nav stays untouched here.
  const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled);
  return {
    open: b.navSidecarOpen === DEFAULT_BINDINGS.navSidecarOpen,
    close: b.navSidecarClose === DEFAULT_BINDINGS.navSidecarClose,
  };
}

// Nav-aware positional CLOSE (dpad-left at the sidecar's left edge). Returns
// true when the press was consumed so the caller stops processing.
function handleDpadClose(doc: Document, win: Window | null, button: number, positionalClose: boolean, insideSidecar: boolean, setQamExpanded: (v: boolean) => void): boolean {
  if (button !== DPAD_LEFT || !positionalClose) return false;
  if (insideSidecar) {
    // Only collapse if Steam's nav couldn't move focus left within the
    // sidecar — detected by checking 80ms later if focus left the sidecar.
    setTimeout(() => {
      const f = doc.querySelector('.gpfocus') as HTMLElement | null;
      const stillInSidecar = !!(f && f.closest('.deck-shelves-qam-sidecar'));
      if (!stillInSidecar) {
        lastFocusWasInSidecar = false;
        fireQamExpand(win, false, setQamExpanded);
      }
    }, 80);
    return true;
  }
  if (lastFocusWasInSidecar) {
    // Steam already moved focus back to QAM main before our handler ran.
    lastFocusWasInSidecar = false;
    fireQamExpand(win, false, setQamExpanded);
    return true;
  }
  return false;
}

// Nav-aware positional OPEN (two dpad-rights on the rightmost focusable of the
// main column). Called only when button === DPAD_RIGHT.
function handleDpadOpen(doc: Document, win: Window | null, positionalOpen: boolean, insideMain: boolean, main: Element | null, focused: HTMLElement, setQamExpanded: (v: boolean) => void): void {
  if (!(positionalOpen && insideMain && main)) { lastRightTarget = null; return; }
  /* Sliders consume horizontal dpad to change their value; bail so holding
     right on a slider doesn't pop the sidecar open mid-adjustment. */
  if (focused.closest('[class*="slider" i], [role="slider"], .gpfocus[class*="slider" i]')) return;
  /* Only expand when the focused element is already at (or near) the right
     edge of the main panel — otherwise a mid-row dpad-right where Steam
     can't move horizontally would falsely trigger the expand. */
  const fRect = focused.getBoundingClientRect();
  const mRect = main.getBoundingClientRect();
  if (mRect.right - fRect.right > 40) return;
  // Require two dpad-rights on the *same* rightmost focusable: the first just
  // navigates onto it, the second confirms the intent to expand.
  if (lastRightTarget !== focused) {
    lastRightTarget = focused;
    return;
  }
  lastRightTarget = null;
  const before = focusKeyForExpand(doc);
  setTimeout(() => {
    if (focusKeyForExpand(doc) === before) fireQamExpand(win, true, setQamExpanded);
  }, 80);
}

function handleDpadInput(
  scope: HTMLElement,
  button: number,
  pressed: boolean,
  setQamExpanded: (v: boolean) => void,
): void {
  if (!pressed) return;
  try { scope.setAttribute('data-ds-last-btn', String(button)); } catch {}
  if (!isDpadButton(button)) return;
  const doc = scope.ownerDocument;
  const win = doc.defaultView;
  const focused = doc.querySelector('.gpfocus') as HTMLElement | null;
  if (!focused) return;
  const insideSidecar = !!focused.closest('.deck-shelves-qam-sidecar');
  /* Eye-column vertical nav is handled in the MutationObserver in
     `useDpadExpandBridge` — once Steam moves focus off the eye, the observer
     redirects to the adjacent eye. That's more reliable than racing here
     because Steam's nav has already updated `.gpfocus` by the time this
     callback fires. */
  if (button === DPAD_UP || button === DPAD_DOWN) return;
  const main = scope.querySelector('.deck-shelves-qam-main');
  const insideMain = !!(main && main.contains(focused));
  const { open: positionalOpen, close: positionalClose } = currentPositionalBindings();
  if (handleDpadClose(doc, win, button, positionalClose, insideSidecar, setQamExpanded)) return;
  if (button === DPAD_RIGHT) handleDpadOpen(doc, win, positionalOpen, insideMain, main, focused, setQamExpanded);
  lastFocusWasInSidecar = insideSidecar;
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
  useQamCompositorSync(qamExpanded);
  const dsScopeRef = useRef<HTMLDivElement>(null);
  useDpadExpandBridge(dsScopeRef, setQamExpanded);
  /* Hard reset on mount: wipe both the live ref and the sessionStorage
     flag so a freshly-mounted DS QAM tab never inherits a stale expanded
     state. Doing this OUTSIDE the React setter avoids racing the
     useQamExpanded hook's initial read; setQamExpanded(false) on unmount
     still fires the event for any concurrent listeners. */
  useEffect(() => {
    resetQamExpanded();
    setQamExpanded(false);
    return () => setQamExpanded(false);
  }, [setQamExpanded]);
  // First-run feature showcase (opens once; replayable from the AboutPage).
  useFirstRunShowcase(settings, actions);
  /* Dev-only screenshot hook: opens/closes the sidecar the same way a
     dpad-right chord does (`fireQamExpand` widens the QAM compositor window
     via the opener postMessage AND flips the store) — the store flag alone
     doesn't widen the window, so the panel would render off-screen. Gamepad
     input can't be driven over CDP. Stripped from release via `if (!__DEV__)`. */
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as any;
    g.__ds_dev_open_sidecar = () => { fireQamExpand(getQamWindow(), true, setQamExpanded); return true; };
    g.__ds_dev_close_sidecar = () => { fireQamExpand(getQamWindow(), false, setQamExpanded); };
    return () => { try { delete g.__ds_dev_open_sidecar; delete g.__ds_dev_close_sidecar; } catch {} };
  }, [setQamExpanded]);
  /* Remappable open / close sidecar shortcuts. The defaults (dpad-right ×2 to
     open, dpad-left to close) are served by the nav-aware positional handler
     in `handleDpadInput`. This raw-stream listener only kicks in when the user
     remaps a side away from its dpad default, firing that custom combo globally
     — so the default dpad navigation stays untouched. */
  const openMatcherRef = useRef(createMatcherState());
  const closeMatcherRef = useRef(createMatcherState());
  useEffect(() => {
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
  }, [setQamExpanded]);
  /* Decky keeps the plugin tab mounted across QAM open/close cycles, so
     without explicit hooks the sidecar stays expanded when the user opens
     a Steam overlay (Steam menu, friends, etc) and comes back to the QAM.
     None of the available signals fires reliably on every path Steam can
     hide the QAM through — listen to all of them. */
  useEffect(() => {
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
    const collapse = (label: string) => () => { trace(label); setQamExpanded(false); };
    const onVis = () => { if (doc.hidden) { trace("visibilitychange:hidden"); setQamExpanded(false); } };
    doc.addEventListener("visibilitychange", onVis);
    const onFocus = collapse("window.focus");
    win.addEventListener("focus", onFocus);
    const onPageHide = collapse("pagehide");
    win.addEventListener("pagehide", onPageHide);
    const onFreeze = collapse("freeze");
    const onResume = collapse("resume");
    doc.addEventListener("freeze", onFreeze);
    doc.addEventListener("resume", onResume);
    return () => {
      doc.removeEventListener("visibilitychange", onVis);
      win.removeEventListener("focus", onFocus);
      win.removeEventListener("pagehide", onPageHide);
      doc.removeEventListener("freeze", onFreeze);
      doc.removeEventListener("resume", onResume);
    };
  }, [setQamExpanded]);

  // Authoritative signal for "QAM is no longer the active side menu":
  // `SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_MenuStore
  // .m_eOpenSideMenu`. This MobX-backed enum flips between None / MainMenu
  /* / QuickAccess when Steam opens overlays on top of the QAM. Polling at
     300 ms is cheap (a property read), only runs while the sidecar is
     expanded, and stops as soon as we collapse. Captures the value seen
     at mount as the "active QAM" reference value — anything different
     afterwards means the QAM lost focus to another overlay. */
  useEffect(() => {
    if (!qamExpanded) return;
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
        const noFocus = !doc.hasFocus();
        /* A >1.5s timer gap means either the popup was throttled in the
           background OR a heavy foreground re-render (large libraries) just
           blocked the main thread. Only the former should collapse — require
           the document to be non-visible so a slow render mid-interaction
           (e.g. toggling an eye) doesn't empty the sidecar. */
        const resumedFromBackground = gap > 1500 && doc.visibilityState !== "visible";
        if (menuChanged || noFocus || resumedFromBackground) {
          traceSidecarCollapse(now, menuChanged, noFocus, refValue, menuState, gap);
          setQamExpanded(false);
          window.clearInterval(id);
        }
      } catch {}
    }, 300);
    return () => window.clearInterval(id);
  }, [qamExpanded, setQamExpanded]);
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
    compute();
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
      icon: d.icon ?? icons.import,
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
      <Focusable className='deck-shelves-qam-main' noFocusRing>
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
      {qamExpanded && (
        <SidecarPanel controller={controller} onCollapse={() => setQamExpanded(false)} />
      )}
      </Focusable>
    </div>
  )
}
