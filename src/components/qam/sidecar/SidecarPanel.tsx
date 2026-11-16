import { useEffect, useRef } from 'react'
import { Focusable } from '../../../runtime/host/decky'
import { getActiveFocusedElement } from '../../../core/focusRestore'

// Some clients never apply .gpfocus, so read the active nav context first.
function focusedInDoc(doc: Document): HTMLElement | null {
  return (doc.querySelector('.gpfocus') as HTMLElement | null) ?? getActiveFocusedElement();
}
import type { SettingsController } from '../../../features/settings/controller'
import { resolveBindings, DEFAULT_BINDINGS } from '../../../runtime/buttonBindings'
import { getCurrentSettings } from '../../../store/settingsStore'
import { trackFeature } from '../../../steam/usageTracking'
import { absorbCancelButton } from '../sidecarCancel'
import { type OpenerWithInput } from '../sidecarActiveTab'
import { ChevronLeftIcon } from '../../icons'
import { ErrorBoundary } from '../../ErrorBoundary'
import { GeneralTab } from './GeneralTab'

const DPAD_RIGHT = 23;
const DPAD_LEFT = 22;
const DPAD_UP = 20;
const DPAD_DOWN = 21;

function rectEdges(rect: DOMRect | undefined, win: Window): { right: number; bottom: number } {
  return { right: rect?.right ?? win.innerWidth, bottom: rect?.bottom ?? win.innerHeight };
}

function sidecarFrame(
  main: HTMLElement | null, anchor: HTMLElement | null, panel: HTMLElement | null, win: Window,
): { left: number; top: number; width: number; height: number } {
  const mainRect = main ? main.getBoundingClientRect() : undefined;
  const anchorRect = anchor ? anchor.getBoundingClientRect() : undefined;
  // A transient 0 width (mid-layout or tab switch) would stick the sidecar on the main panel.
  const mainWidth = mainRect && mainRect.width > 0 ? mainRect.width : 300;
  const base = anchorRect ?? { left: 0, top: 0 };
  const left = Math.round(base.left + mainWidth);
  const top = Math.round(base.top);
  const { right, bottom } = rectEdges(panel ? panel.getBoundingClientRect() : undefined, win);
  return { left, top, width: Math.max(280, Math.round(right - left)), height: Math.max(320, Math.round(bottom - top)) };
}

// Inside a menu the containing block is the menu's panel, not the window, so the offset is measured back out.
export function placeSidecar(el: HTMLElement, f: { left: number; top: number; width: number; height: number }): void {
  el.style.left = `${f.left}px`;
  el.style.top = `${f.top}px`;
  el.style.width = `${f.width}px`;
  el.style.height = `${f.height}px`;
  const r = el.getBoundingClientRect();
  const dx = Math.round(r.left - f.left);
  const dy = Math.round(r.top - f.top);
  if (dx) el.style.left = `${f.left - dx}px`;
  if (dy) el.style.top = `${f.top - dy}px`;
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

function redirectEyeNav(doc: Document, prev: HTMLElement | null, f: HTMLElement | null): void {
  if (!prev || !f || prev === f) return;
  const prevIsEye = prev.classList.contains('ds-eye-btn');
  const fIsEye = f.classList.contains('ds-eye-btn');
  const inSidecar = !!f.closest('.deck-shelves-qam-sidecar');
  if (inSidecar && prevIsEye && !fIsEye) focusAdjacentEye(doc, prev, f);
}

function focusAdjacentEye(doc: Document, prev: HTMLElement, f: HTMLElement): void {
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
      const cur = focusedInDoc(doc);
      if (cur !== target) takeNavTreeFocus(target);
    }, 30);
  }
}

// Where the focus was when a list opened from inside the sidecar covered it; the next mount resumes there.
type Resume = { index: number; scrollTop: number };
let resumeAt: Resume | null = null;

export function rememberSidecarFocus(body: HTMLElement | null, focused: HTMLElement | null): void {
  resumeAt = body && focused && body.contains(focused)
    ? { index: Array.prototype.indexOf.call(body.querySelectorAll('*'), focused), scrollTop: body.scrollTop }
    : null;
}

// Steam marks the focused control with gpfocus; the document's active element is the fallback.
export function focusedInSidecar(body: HTMLElement | null): HTMLElement | null {
  if (!body) return null;
  const marked = body.querySelector('.gpfocus') as HTMLElement | null;
  if (marked) return marked;
  const active = body.ownerDocument.activeElement as HTMLElement | null;
  return active && body.contains(active) ? active : null;
}

export function takeSidecarResume(): Resume | null {
  const resume = resumeAt;
  resumeAt = null;
  return resume;
}

// The same element by position: the body mounts again with the same sections open.
export function resumeTarget(body: HTMLElement, resume: Resume | null): HTMLElement | null {
  if (!resume || resume.index < 0) return null;
  return (body.querySelectorAll('*')[resume.index] as HTMLElement | undefined) ?? null;
}

function focusSidecarStart(body: HTMLElement, resume: Resume | null): void {
  const target = resumeTarget(body, resume);
  const focused = focusedInDoc(body.ownerDocument);
  if (target && focused && (focused === target || target.contains(focused))) return;
  if (resume) body.scrollTop = resume.scrollTop;
  const first = target ?? (body.querySelector('.Focusable') as HTMLElement | null);
  if (first) takeNavTreeFocus(first);
}

export function SidecarPanel({ controller, onCollapse, scope }: { controller: SettingsController; onCollapse: () => void; scope?: HTMLElement | null }) {
  // Bail while settings aren't hydrated so the sidecar never opens empty.
  // Hooks run before the bail-out; `ready` in the deps re-arms the effects once settings land.
  const ready = !!controller?.settings;
  const innerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready) return;
    // No onActivate on the wrapper so nav moves between the inner focusables.
    const resume = takeSidecarResume();
    // Steam's menu focuses its first row once its tree is ready, so a resume tries again after it.
    const ids = (resume ? [90, 260, 520] : [90]).map((ms) => window.setTimeout(() => {
      const el = innerRef.current;
      if (el) focusSidecarStart(el, resume);
    }, ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const innerEl = innerRef.current;
    if (!innerEl) return;
    const doc = innerEl.ownerDocument;
    const win = doc.defaultView ?? window;
    const measure = () => {
      // Walk up from here: a hidden 0×0 copy of the panel can come first in the document.
      const sideEl = innerEl.closest('.deck-shelves-qam-sidecar') as HTMLElement | null;
      if (!sideEl) return;
      const area = scope ?? (sideEl.closest('.deck-shelves-qam-panel') as HTMLElement | null);
      const main = (area?.querySelector('.deck-shelves-qam-main') ?? null) as HTMLElement | null;
      // Obfuscated class; falls back to the viewport if Steam renames it.
      const content = (area?.closest('[id^="quickaccess_content_"]') ?? null) as HTMLElement | null;
      const panel = (doc.querySelector('._2BB6uf--jFaAmdnwLOqMU7') as HTMLElement | null) ?? content;
      placeSidecar(sideEl, sidecarFrame(main, content ?? area, panel, win));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(doc.documentElement);
    win.addEventListener('resize', measure);
    const t1 = win.setTimeout(measure, 60);
    const t2 = win.setTimeout(measure, 240);
    return () => {
      ro.disconnect();
      win.removeEventListener('resize', measure);
      win.clearTimeout(t1);
      win.clearTimeout(t2);
    };
  }, [ready, scope]);
  if (!ready) return null;
  return (
    <Focusable
      className='deck-shelves-qam-sidecar'
      onCancelButton={onCollapse}
      onButtonDown={(evt: any) => absorbCancelButton(evt, onCollapse)}
      noFocusRing
    >
      <div className='ds-sidecar-title'>
        <Focusable
          className='ds-sidecar-back'
          onClick={onCollapse}
          onOKButton={onCollapse}
          onActivate={onCollapse}
          title={controller.t('sidecar_back')}
        >
          <ChevronLeftIcon size={16} />
        </Focusable>
        <div className='ds-sidecar-tabs' role='tablist'>
          <div className='ds-sidecar-tab' role='tab' aria-selected='true' data-active='1'>{controller.t('settings_title')}</div>
        </div>
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
  const el = focusedInDoc(doc);
  if (!el) return '';
  const r = el.getBoundingClientRect();
  return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`;
}

export function fireQamExpand(win: Window | null, value: boolean, setQamExpanded: (v: boolean) => void): void {
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
    // Call as a method: Steam's bridge throws "Unknown method" on a detached reference.
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
  useEffect(() => {
    if (!enabled) return;
    const scope = scopeRef.current;
    const doc = scope?.ownerDocument ?? document;
    let prev: HTMLElement | null = null;
    const obs = new MutationObserver(() => {
      const f = focusedInDoc(doc);
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

// Steam moves focus out of the sidecar before this listener runs, so remember where it was.
let lastFocusWasInSidecar = false;
let lastRightTarget: HTMLElement | null = null;

function isDpadButton(button: number): boolean {
  return button === DPAD_RIGHT || button === DPAD_LEFT || button === DPAD_UP || button === DPAD_DOWN;
}

function currentPositionalBindings(): { open: boolean; close: boolean } {
  // Only while the binding is the default d-pad combo; a remap hands it to the global listener.
  const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled);
  return {
    open: b.navSidecarOpen === DEFAULT_BINDINGS.navSidecarOpen,
    close: b.navSidecarClose === DEFAULT_BINDINGS.navSidecarClose,
  };
}

const isSliderControl = (el: HTMLElement): boolean => !!el.closest('[class*="slider" i], [role="slider"], .gpfocus[class*="slider" i]');

// A left press inside the sidecar closes it once the focus left it, or stayed put off a slider: inside a
// menu the focus cannot leave, so the left edge is where the press moves nothing.
export function leftPressCloses(before: HTMLElement, after: HTMLElement | null): boolean {
  if (!after?.closest('.deck-shelves-qam-sidecar')) return true;
  return after === before && !isSliderControl(before);
}

function handleDpadClose(doc: Document, win: Window | null, button: number, positionalClose: boolean, focused: HTMLElement, insideSidecar: boolean, setQamExpanded: (v: boolean) => void): boolean {
  if (button !== DPAD_LEFT || !positionalClose) return false;
  if (insideSidecar) {
    // Read 80 ms later, once the nav has moved or not.
    setTimeout(() => {
      if (!leftPressCloses(focused, focusedInDoc(doc))) return;
      lastFocusWasInSidecar = false;
      fireQamExpand(win, false, setQamExpanded);
    }, 80);
    return true;
  }
  if (lastFocusWasInSidecar) {
    lastFocusWasInSidecar = false;
    fireQamExpand(win, false, setQamExpanded);
    return true;
  }
  return false;
}

// Sliders use the horizontal d-pad, and the gesture only applies at the main panel's right edge.
function isRightEdgePress(focused: HTMLElement, main: Element): boolean {
  if (isSliderControl(focused)) return false;
  const fRect = focused.getBoundingClientRect();
  const mRect = main.getBoundingClientRect();
  return mRect.right - fRect.right <= 40;
}

function handleDpadOpen(doc: Document, win: Window | null, positionalOpen: boolean, insideMain: boolean, main: Element | null, focused: HTMLElement, setQamExpanded: (v: boolean) => void): void {
  if (!(positionalOpen && insideMain && main) || !isRightEdgePress(focused, main)) { lastRightTarget = null; return; }
  // Two presses on the same rightmost focusable: the first lands on it, the second expands.
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
  if (button === DPAD_UP || button === DPAD_DOWN) return;
  const main = scope.querySelector('.deck-shelves-qam-main');
  const insideMain = !!(main && main.contains(focused));
  const { open: positionalOpen, close: positionalClose } = currentPositionalBindings();
  if (handleDpadClose(doc, win, button, positionalClose, focused, insideSidecar, setQamExpanded)) return;
  if (button === DPAD_RIGHT) handleDpadOpen(doc, win, positionalOpen, insideMain, main, focused, setQamExpanded);
  lastFocusWasInSidecar = insideSidecar;
}
