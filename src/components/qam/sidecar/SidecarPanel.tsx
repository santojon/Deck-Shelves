import { useEffect, useRef } from 'react'
import { Focusable } from '../../../runtime/host/decky'
import { getActiveFocusedElement } from '../../../core/focusRestore'

/* Beta-safe "what's gamepad-focused". This beta never applies the `.gpfocus`
   class, so a bare `.gpfocus` query is null and the whole dpad open/close gate
   fails — resolve it from the active nav context instead, with `.gpfocus` as the
   stable-client fallback. */
function focusedInDoc(doc: Document): HTMLElement | null {
  return (doc.querySelector('.gpfocus') as HTMLElement | null) ?? getActiveFocusedElement();
}
import type { SettingsController } from '../../../features/settings/controller'
import { resolveBindings, DEFAULT_BINDINGS } from '../../../runtime/buttonBindings'
import { getCurrentSettings } from '../../../store/settingsStore'
import { trackFeature } from '../../../steam/usageTracking'
import { absorbCancelButton } from '../sidecarCancel'
import { type OpenerWithInput, qamIsTabbed } from '../sidecarActiveTab'
import { GearIcon } from '../../icons'
import { ErrorBoundary } from '../../ErrorBoundary'
import { GeneralTab } from './GeneralTab'

const DPAD_RIGHT = 23;
const DPAD_LEFT = 22;
const DPAD_UP = 20;
const DPAD_DOWN = 21;

function rectEdges(rect: DOMRect | undefined, win: Window): { right: number; bottom: number } {
  return { right: rect?.right ?? win.innerWidth, bottom: rect?.bottom ?? win.innerHeight };
}

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

export function SidecarPanel({ controller, onCollapse }: { controller: SettingsController; onCollapse: () => void }) {
  // If the controller isn't fully ready (settings unhydrated), the inner
  // GeneralTab `if (!settings) return null` short-circuits and the sidecar
  // would render as an empty body — which is what users see after the
  /* Steam-menu-over-QAM cycle when Decky re-mounts the plugin tab before
     refreshSettings has populated state. Bail at this layer so the
     sidecar simply doesn't appear at all in that state; the caller's
     qamExpanded flag stays in sync and the user gets either "closed" or
     "open with content" — never the bug-state of "open with no content". */
  // Hooks below must run unconditionally (Rules of Hooks), so the bail-out
  // above moves after them; `ready` in the deps re-arms both effects once
  // settings land, instead of each firing its one run too early.
  const ready = !!controller?.settings;
  const innerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready) return;
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
  }, [ready]);
  /* Size the sidecar from the live QAM panel + plugin tab dimensions so the
     panel fits whatever screen size Steam is rendering at (handheld,
     docked TV, Big Picture on 4K, custom window sizes). Fallbacks keep the
     legacy 503×440 values whenever measurements aren't available yet. */
  useEffect(() => {
    if (!ready) return;
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
      if (mainRect && mainRect.width > 0) {
        /* Anchor to the plugin tab's right edge so we adapt if its width
           changes. Guard against a transient 0 (a mid-layout/tab-switch
           measurement, more likely with a host's native tab sharing the
           QAM): overriding `left` with 0 stuck the sidecar on the main panel. */
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
  }, [ready]);
  if (!ready) return null;
  return (
    <Focusable
      className='deck-shelves-qam-sidecar'
      onCancelButton={onCollapse}
      onButtonDown={(evt: any) => absorbCancelButton(evt, onCollapse)}
      noFocusRing
    >
      <div className='ds-sidecar-title'>
        <GearIcon size={16} style={{ marginRight: 8 }} />
        {controller.t('settings_title')}
      </div>
      <div className='ds-sidecar-body' ref={innerRef}>
        <ErrorBoundary title={`Deck Shelves — ${controller.t('settings_title')}`}>
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

export function fireQamExpand(win: Window | null, value: boolean, setQamExpanded: (v: boolean) => void): void {
  const opener = (win?.opener ?? null) as Window | null;
  if (!qamIsTabbed(win?.document ?? null)) {
    try {
      opener?.postMessage(
        { message: value ? 'QamFriendsExpanded' : 'QamFriendsHidden' },
        'https://steamloopback.host',
      );
    } catch {}
  }
  setQamExpanded(value);
  if (value) trackFeature('sidecar');
}

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

export function useDpadExpandBridge(
  scopeRef: { current: HTMLElement | null },
  setQamExpanded: (v: boolean) => void,
  enabled = true,
): void {
  useEffect(() => { if (!enabled) return; return installDpadListener(scopeRef, setQamExpanded); }, [scopeRef, setQamExpanded, enabled]);
  // Track `.gpfocus` movements so we know "focus was just in the sidecar"
  // even when Steam's nav moves it back to main before our controller-input
  // listener has a chance to run.
  useEffect(() => {
    if (!enabled) return;
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
  }, [scopeRef, enabled]);
}

/* Tracks whether the previous focus we saw from this handler was inside the
   sidecar. Needed because Steam processes dpad-left and moves the gamepad
   focus from sidecar back to main *before* our SteamClient.Input listener
   runs — by the time we look at `.gpfocus`, the user has already "left"
   the sidecar visually. */
let lastFocusWasInSidecar = false;
let lastRightTarget: HTMLElement | null = null;

export function traceSidecarCollapse(now: number, menuChanged: boolean, noFocus: boolean, refValue: number | null, menuState: number | null, gap: number): void {
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
      const f = focusedInDoc(doc);
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

/* Sliders consume horizontal dpad to change their value, and the expand
   gesture only applies at the main panel's right edge — otherwise a
   mid-row dpad-right where Steam can't move horizontally would falsely
   trigger it. */
function isRightEdgePress(focused: HTMLElement, main: Element): boolean {
  if (focused.closest('[class*="slider" i], [role="slider"], .gpfocus[class*="slider" i]')) return false;
  const fRect = focused.getBoundingClientRect();
  const mRect = main.getBoundingClientRect();
  return mRect.right - fRect.right <= 40;
}

// Nav-aware positional OPEN (two dpad-rights on the rightmost focusable of the
// main column). Called only when button === DPAD_RIGHT.
function handleDpadOpen(doc: Document, win: Window | null, positionalOpen: boolean, insideMain: boolean, main: Element | null, focused: HTMLElement, setQamExpanded: (v: boolean) => void): void {
  if (!(positionalOpen && insideMain && main) || !isRightEdgePress(focused, main)) { lastRightTarget = null; return; }
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
  const focused = focusedInDoc(doc);
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
