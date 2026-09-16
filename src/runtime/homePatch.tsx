import React from "react";
import i18next from "i18next";
import { HomeShelves as HomeShelvesRaw } from "../components/HomeInject";
import { wrapHomeShelves } from "../qa/harness";
const HomeShelves = wrapHomeShelves(HomeShelvesRaw);
import { SearchOverlay } from "../features/search/SearchOverlay";
import { ShelfSideNav } from "../features/sidenav/ShelfSideNav";
import { DeckScreensaverOverlay } from "../components/screensaver/DeckScreensaverOverlay";
try { (globalThis as any).__ds_homepatch_loaded = Date.now(); (globalThis as any).__ds_overlays_imported = typeof SearchOverlay === 'function' && typeof ShelfSideNav === 'function'; } catch {}
import { logDiagnostic } from "./diagnostics";
import { logError, logInfo, logWarn } from "./logger";
import { setPreferredSteamWindow, getAllSteamDocuments } from "./steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { notify } from "../components/notify";
import { findModuleByExport } from "./host/decky";

const ROOT_ID = "deck-shelves-home-root";
const GLOBAL_COMPONENT_ID = "DeckShelvesHomeDomBridge";

let observer: MutationObserver | null = null;
let timer = 0;
let noAnchorLogged = false;
let removeGlobalComponent: (() => void) | null = null;
const uninstallHooks: Array<() => void> = [];
let lastHostSource = "";

// --- Crash protection ---
let mountFailed = false;
let mountError: string | null = null;
const MAX_BOUNDARY_FAILURES = 3;
let boundaryFailureCount = 0;

if (__DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__) {
  mountFailed = true;
  mountError = "QA: forced shelf render error";
}

export function getMountFailed(): boolean { return mountFailed; }
export function getMountError(): string | null { return mountError; }
export function resetMountFailed(): void { mountFailed = false; mountError = null; boundaryFailureCount = 0; notifyMountFailedChange(); }

const mountFailedListeners = new Set<() => void>();
export function subscribeMountFailed(cb: () => void): () => void {
  mountFailedListeners.add(cb);
  return () => { mountFailedListeners.delete(cb); };
}
function notifyMountFailedChange(): void {
  for (const cb of mountFailedListeners) { try { cb(); } catch {} }
}

// --- Recents hiding ---
let cachedRecentsEl: HTMLElement | null = null;
let pendingHideRecents: boolean = false;
let pendingHideHomeTabs: boolean = false;

/** Override the DS mount margin-top while the replace-recents toggle is
 *  injecting. The default CSS pulls the DS area up 32px to overlap the recents
 *  bottom (fine when recents is collapsed); with replace active the recents row
 *  stays visible, so that overlap would push the next DS shelf's title into it
 *  (esp. under CSS Loader themes like SLH that extend recents visually). */
export function applyReplaceActiveMargin(active: boolean): void {
  try {
    /* Apply to the mount in EVERY known doc rather than trusting
       getHostContext()'s single guessed window — HomeInject creates the
       mount via its own, separately-scored preferred-document resolver, so
       the two can disagree about which doc is "current" and silently no-op
       on the wrong (mount-less) one. */
    const docs = new Set<Document>([getHostContext().doc, ...getAllSteamDocuments()]);
    let found = 0;
    for (const doc of docs) {
      const mount = doc?.getElementById?.(ROOT_ID) as HTMLElement | null;
      if (!mount) continue;
      found++;
      if (active) mount.style.setProperty("margin-top", "0px", "important");
      // Leave applyHideRecents in control when replace is not active.
      else mount.style.removeProperty("margin-top");
    }
    // The mount can be mid-(re)creation when settings finish loading —
    // retry once shortly after instead of leaving the wrong margin in
    // place until some unrelated dep change re-fires this effect.
    if (found === 0) setTimeout(() => applyReplaceActiveMargin(active), 400);
  } catch (e) { logInfo("HOME", "applyReplaceActiveMargin failed", String(e)); }
}

const RECENTS_LABEL_FRAGMENTS = ["jogos recentes", "recent games", "recently played", "played recently", "jogados recentemente"];

function reseedCachedRecentsEl(): void {
  if (cachedRecentsEl && cachedRecentsEl.isConnected) return;
  try {
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
    if (mount) cachedRecentsEl = findRecentsEl(doc as Document, mount);
  } catch (e) { logInfo("HOME", "applyHideRecents: findRecentsEl failed", String(e)); }
}

function elMatchesRecentsLabel(el: HTMLElement): boolean {
  try {
    const aria = (el.getAttribute && el.getAttribute('aria-label'))?.toLowerCase() ?? '';
    const txt = (aria || (el.innerText || '')).toLowerCase().substring(0, 80);
    return RECENTS_LABEL_FRAGMENTS.some((l) => txt.includes(l));
  } catch { return false; }
}

function restoreRecentsByLabelSearch(): void {
  try {
    const { doc } = getHostContext();
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>('*'))) {
      if (!elMatchesRecentsLabel(el)) continue;
      try { for (const p of ["visibility", "height", "min-height", "max-height", "overflow"]) el.style.removeProperty(p); } catch {}
    }
  } catch (e) { logInfo("HOME", "applyHideRecents: fallback restore failed", String(e)); }
}

/* Collapsed recents keeps its DOM (visibility:hidden + height:0, not
   display:none) so recents-replace can repurpose it and the hero-bleed math
   stays intact — but GamepadUI's nav tree ignores CSS visibility, so dpad-up
   from the first DS shelf still lands on the hidden 0-height row (reads as a
   black screen). Drop its focusables from the nav tree like the home-tabs hide. */
function applyRecentsFocusSuppression(hidden: boolean): void {
  if (!cachedRecentsEl) return;
  const focusables = cachedRecentsEl.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
  for (const f of Array.from(focusables)) setFocusableTabindex(f, hidden);
}

/* Collapse styles set with `!important`: some CSS Loader themes force the
   recents Panel's height (e.g. height/min-height with their own !important),
   which beats a plain inline `height:0` — leaving a full-viewport invisible
   block that reads as a black screen when dpad-up scrolls into it. Inline
   !important wins the cascade; clear every prop on restore. */
/* display:none also stops Steam from fully mounting the row's cards (not
   just measuring them at zero size), so the one-time native-menu capture
   (prewarmMenuExtraction) has nothing real to work with. Grace window on
   visibility:hidden alone (the pre-a2143ba collapse) first, so capture gets
   a real card at least once per session before locking to display:none. */
const RECENTS_HARD_COLLAPSE_GRACE_MS = 2500;
let recentsHardCollapseArmed = false;
let recentsHardCollapseTimer: ReturnType<typeof setTimeout> | null = null;

function armRecentsHardCollapse(): void {
  if (recentsHardCollapseArmed || recentsHardCollapseTimer) return;
  recentsHardCollapseTimer = setTimeout(() => {
    recentsHardCollapseTimer = null;
    recentsHardCollapseArmed = true;
    if (pendingHideRecents) applyRecentsCollapse(true);
  }, RECENTS_HARD_COLLAPSE_GRACE_MS);
}

function setRecentsCollapsedStyle(el: HTMLElement, hidden: boolean): void {
  const s = el.style;
  if (hidden) {
    /* display:none is the only collapse GamepadUI's nav tree honours (it ignores
       visibility/height/tabindex) — required so dpad-up can't get trapped on the
       invisible recents row. Skip it only while recents-replace repurposes the
       element (DS content injected there), keeping the visibility collapse, or
       during the grace window above. */
    const repurposed = !!el.querySelector('.ds-shelf, .deck-shelves-root, #' + ROOT_ID);
    if (!repurposed && recentsHardCollapseArmed) {
      s.setProperty("display", "none", "important");
      el.setAttribute("data-ds-hidden-collapse", "1");
    } else {
      s.removeProperty("display");
      el.removeAttribute("data-ds-hidden-collapse");
    }
    s.setProperty("visibility", "hidden", "important");
    s.setProperty("height", "0px", "important");
    s.setProperty("min-height", "0px", "important");
    s.setProperty("max-height", "0px", "important");
    s.setProperty("overflow", "hidden", "important");
  } else {
    for (const p of ["display", "visibility", "height", "min-height", "max-height", "overflow"]) s.removeProperty(p);
    el.removeAttribute("data-ds-hidden-collapse");
  }
}

function applyRecentsCollapse(hidden: boolean): void {
  if (!cachedRecentsEl) return;
  try {
    if (hidden) armRecentsHardCollapse();
    setRecentsCollapsedStyle(cachedRecentsEl, hidden);
    applyRecentsFocusSuppression(hidden);
  } catch (e) { logInfo("HOME", "applyHideRecents: style set failed", String(e)); }
}

function applyMountTopMargin(hidden: boolean): void {
  try {
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
    if (!mount) return;
    mount.style.setProperty("margin-top", hidden ? "56px" : "", "important");
    if (!hidden) { try { mount.style.removeProperty('margin-top'); } catch {} }
  } catch (e) { logInfo("HOME", "applyHideRecents: margin-top failed", String(e)); }
}

export function applyHideRecents(hidden: boolean): void {
  pendingHideRecents = hidden;
  reseedCachedRecentsEl();
  if (!cachedRecentsEl && !hidden) restoreRecentsByLabelSearch();
  applyRecentsCollapse(hidden);
  applyMountTopMargin(hidden);
}

// --- Home tabs (the native home area: recents + friends + novidades, etc.) ---
/* Scope: hide every sibling of our mount inside the same parent. Steam's home
   viewport places all native "tabs" as siblings of our mount; removing all of
   them leaves our shelves as the only visible area, which is the contract.
   Each candidate must carry at least one webpack-hashed token so decorative
   spacers/stray nodes aren't touched — no hardcoded classes. */
function hideSiblingDisplay(el: HTMLElement): void {
  if (el.dataset.dsHtHidden !== "1") {
    el.dataset.dsHtPrevDisplay = el.style.getPropertyValue("display") || "";
    el.dataset.dsHtHidden = "1";
  }
  el.style.setProperty("display", "none", "important");
  el.setAttribute("aria-hidden", "true");
}

function restoreSiblingDisplay(el: HTMLElement): void {
  if (el.dataset.dsHtHidden !== "1") return;
  const prev = el.dataset.dsHtPrevDisplay ?? "";
  el.style.removeProperty("display");
  if (prev) el.style.setProperty("display", prev);
  delete el.dataset.dsHtHidden;
  delete el.dataset.dsHtPrevDisplay;
  el.removeAttribute("aria-hidden");
}

function setFocusableTabindex(f: HTMLElement, hidden: boolean): void {
  if (hidden) {
    if (f.dataset.dsHtPrevTabindex === undefined) {
      f.dataset.dsHtPrevTabindex = f.getAttribute("tabindex") ?? "0";
    }
    f.setAttribute("tabindex", "-1");
  } else if (f.dataset.dsHtPrevTabindex !== undefined) {
    f.setAttribute("tabindex", f.dataset.dsHtPrevTabindex);
    delete f.dataset.dsHtPrevTabindex;
  }
}

function setSiblingHidden(el: HTMLElement, hidden: boolean) {
  if (hidden) hideSiblingDisplay(el); else restoreSiblingDisplay(el);
  const focusables = el.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
  for (const f of Array.from(focusables)) setFocusableTabindex(f, hidden);
}

const hiddenHomeTabs = new Set<HTMLElement>();

/* Identify the "home tabs" siblings (Novidades/Amigos/Recomendados). These are
   distinguished by containing a [role=tablist] descendant — a semantic marker
   that survives Steam bundle renames and doesn't overlap with recents (which
   has no tablist). */
function collectHomeTabSiblings(mountEl: HTMLElement): HTMLElement[] {
  const parent = mountEl.parentElement;
  if (!parent) return [];
  const out: HTMLElement[] = [];
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (child === mountEl) continue;
    if (child.querySelector('[role="tablist"]')) out.push(child);
  }
  return out;
}

function restoreAllHomeTabs(): void {
  for (const el of Array.from(hiddenHomeTabs)) {
    if (el.isConnected) setSiblingHidden(el, false);
  }
  hiddenHomeTabs.clear();
}

function syncHomeTabsHidden(current: HTMLElement[]): void {
  const currentSet = new Set(current);
  for (const el of Array.from(hiddenHomeTabs)) {
    if (!el.isConnected) { hiddenHomeTabs.delete(el); continue; }
    if (!currentSet.has(el)) {
      setSiblingHidden(el, false);
      hiddenHomeTabs.delete(el);
    }
  }
  for (const el of current) {
    if (!hiddenHomeTabs.has(el)) {
      setSiblingHidden(el, true);
      hiddenHomeTabs.add(el);
    }
  }
}

export function applyHideHomeTabs(hidden: boolean): void {
  pendingHideHomeTabs = hidden;
  try {
    if (!hidden) { restoreAllHomeTabs(); return; }
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
    if (!mount) return;
    syncHomeTabsHidden(collectHomeTabSiblings(mount));
  } catch (e) { logInfo("HOME", "applyHideHomeTabs failed", String(e)); }
}

export function reapplyHomeHides(): void {
  applyHideRecents(pendingHideRecents);
  applyHideHomeTabs(pendingHideHomeTabs);
}

/* Re-assert ONLY the tabindex suppression for hidden home areas (cheap,
   idempotent, poll-safe). Steam re-renders native recents / home tabs on route
   round-trips (e.g. B / popstate) without our strip, leaving a `tabindex=0`
   focusable in a still-hidden row that traps gamepad focus (the nav tree honours
   tabindex, ignores visibility). A REPURPOSED recents row is left focusable. */
export function enforceHomeFocusSuppression(): void {
  try {
    if (pendingHideRecents) {
      reseedCachedRecentsEl();
      const el = cachedRecentsEl;
      const repurposed = !!el && !!el.querySelector('.ds-shelf, .deck-shelves-root, #' + ROOT_ID);
      if (el && !repurposed) applyRecentsFocusSuppression(true);
    }
    if (pendingHideHomeTabs) {
      for (const el of Array.from(hiddenHomeTabs)) {
        if (!el.isConnected) continue;
        const focusables = el.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
        for (const f of Array.from(focusables)) setFocusableTabindex(f, true);
      }
    }
  } catch (e) { logInfo("HOME", "enforceHomeFocusSuppression failed", String(e)); }
}

/* The currently-desired hide state — lets HomeInject.tsx's poll tell
   "should be hidden but isn't" apart from "should be visible but isn't". */
export function getPendingHideRecents(): boolean { return pendingHideRecents; }
export function getPendingHideHomeTabs(): boolean { return pendingHideHomeTabs; }

function isDsOwn(el: HTMLElement | null, mountEl: HTMLElement): boolean {
  if (!el) return false;
  if (el === mountEl || el.id === ROOT_ID) return true;
  if (el.classList?.contains('ds-shelf')) return true;
  if (el.classList?.contains('deck-shelves-root')) return true;
  return !!el.querySelector?.('.ds-shelf, .deck-shelves-root, #' + ROOT_ID);
}

function ariaOrInnerTextMatches(el: HTMLElement, labels: string[]): boolean {
  const txt = (el.getAttribute?.("aria-label") || el.innerText || "").toLowerCase().substring(0, 80);
  return labels.some((l) => txt.includes(l));
}

function previousSiblingIsRecents(prev: HTMLElement | null, mountEl: HTMLElement, labels: string[]): HTMLElement | null {
  if (!prev || isDsOwn(prev, mountEl)) return null;
  if (ariaOrInnerTextMatches(prev, labels)) return prev;
  const inner = prev.querySelector("[aria-label]");
  if (inner) {
    const innerTxt = (inner.getAttribute("aria-label") || "").toLowerCase();
    if (labels.some((l) => innerTxt.includes(l))) return prev;
  }
  return prev.querySelector("[class*='ReactVirtualized']") ? prev : null;
}

function recentsFromAriaScan(doc: Document, mountEl: HTMLElement, mountParent: HTMLElement, labels: string[]): HTMLElement | null {
  for (const node of Array.from(doc.querySelectorAll("[aria-label]"))) {
    const txt = (node.getAttribute("aria-label") || "").toLowerCase();
    if (!labels.some((l) => txt.includes(l))) continue;
    let el = node as HTMLElement;
    while (el.parentElement && el.parentElement !== mountParent) el = el.parentElement;
    if (el.parentElement === mountParent && el !== mountEl && !isDsOwn(el, mountEl)) return el;
  }
  return null;
}

function findRecentsEl(doc: Document, mountEl: HTMLElement): HTMLElement | null {
  const labels = RECENTS_LABEL_FRAGMENTS;
  const mountParent = mountEl.parentElement;
  if (!mountParent) return null;
  const prev = previousSiblingIsRecents(mountEl.previousElementSibling as HTMLElement | null, mountEl, labels);
  return prev ?? recentsFromAriaScan(doc, mountEl, mountParent, labels);
}

function getFocusNavController(): any {
  return (globalThis as any).GamepadNavTree?.m_context?.m_controller || (globalThis as any).FocusNavController;
}

function getGamepadNavigationTrees(): any[] {
  const focusNav = getFocusNavController();
  const context = focusNav?.m_ActiveContext || focusNav?.m_LastActiveContext;
  return context?.m_rgGamepadNavigationTrees ?? [];
}

function findSPWindow(): Window | null {
  try {
    if (document.title === "SP") return window;
  } catch {}
  try {
    const navTrees = getGamepadNavigationTrees();
    return navTrees?.find((x: any) => x?.m_ID === "GamepadUI_Full_Root" || x?.m_ID === "root_1_")?.Root?.Element?.ownerDocument?.defaultView ?? null;
  } catch {
    return null;
  }
}

function getWindowCandidates(): Array<{ win: Window; source: string }> {
  const out: Array<{ win: Window; source: string }> = [];
  const seen = new Set<Window>();
  const push = (candidate: any, source: string) => {
    if (!candidate || typeof candidate !== "object") return;
    const win = candidate as Window;
    if (!win.document || seen.has(win)) return;
    seen.add(win);
    out.push({ win, source });
  };
  const sources: Array<[() => any, string]> = [
    [() => window, "current"],
    [() => (window as any).opener, "opener"],
    [() => findSPWindow(), "findSP"],
    [() => (window as any).SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow, "focusedWindow"],
    [() => (window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow, "mainWindow"],
  ];
  for (const [getter, source] of sources) { try { push(getter(), source); } catch {} }
  try {
    const steamWindows = (window as any).SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(steamWindows)) {
      for (const entry of steamWindows) push(entry?.BrowserWindow, "steamUIWindow");
    }
  } catch {}
  return out;
}

/* Hardcoded fallback for the native shelf-section token. Used only when the
   runtime classmap hasn't been populated yet (very early boot, before
   `discoverClassMap` runs). Anywhere else, prefer the live token via
   `shelfSectionSelector(doc)`. */
const FALLBACK_SHELF_SECTION = "_282X0J4BtrSF1IXctmOe-X";

function shelfSectionSelector(doc: Document): string {
  try {
    const map = getRuntimeClassMap(doc);
    const token = map?.shelfSection;
    if (token && typeof token === "string") {
      return `div.${token}, [class*="${token}"]`;
    }
  } catch {}
  return `div.${FALLBACK_SHELF_SECTION}, [class*="${FALLBACK_SHELF_SECTION}"]`;
}

const RECENTS_QS = '[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]';
const LIBRARY_HOME_QS = '[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]';

function safeMatch(doc: Document, selector: string): boolean {
  try { return !!doc.querySelector(selector); } catch { return false; }
}

function windowHref(win: Window): string {
  return `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
}

function hrefIsLibraryHome(href: string): boolean {
  return href.includes("/routes/library/home") || href.includes("library/home");
}

function scoreDocSignals(doc: Document): number {
  let s = 0;
  if (safeMatch(doc, RECENTS_QS)) s += 8;
  if (safeMatch(doc, LIBRARY_HOME_QS)) s += 6;
  if (safeMatch(doc, shelfSectionSelector(doc))) s += 2;
  if (doc.body?.childElementCount) s += 1;
  return s;
}

function scoreWindow(win: Window): number {
  try {
    const doc = win.document;
    return (hrefIsLibraryHome(windowHref(win)) ? 4 : 0) + scoreDocSignals(doc);
  } catch { return -1; }
}

function logHostSourceChange(source: string, win: Window, score: number): void {
  if (source === lastHostSource) return;
  lastHostSource = source;
  logInfo("HOME", "host context selected", {
    source,
    href: `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`,
    score,
  });
}

function getHostContext() {
  const best = getWindowCandidates()
    .map((entry) => ({ ...entry, score: scoreWindow(entry.win) }))
    .sort((a, b) => b.score - a.score)[0];
  const win = best?.win ?? window;
  const doc = win.document ?? document;
  const source = best?.source ?? "current";
  setPreferredSteamWindow(win);
  logHostSourceChange(source, win, best?.score ?? 0);
  return { win, doc, source };
}

function getContextSnapshot() {
  const { win, doc, source } = getHostContext();
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`;
  let hasObfuscatedAnchor = false;
  try { hasObfuscatedAnchor = !!doc.querySelector(shelfSectionSelector(doc)); } catch {}
  return {
    source,
    href,
    readyState: doc.readyState,
    hasObfuscatedAnchor,
    hasHomeGrid: !!doc.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]'),
    hasLibraryContainers: !!doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]'),
    bodyChildren: doc.body?.childElementCount ?? 0,
  };
}

function hrefIsHomeLike(href: string): boolean {
  if (href.includes("library/home") || href.includes("#library/home")) return true;
  return href.includes("/library") && !href.includes("/library/app/") && !href.includes("/library/collections");
}

function isHomeVisible(): boolean {
  const { win, doc } = getHostContext();
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
  if (hrefIsHomeLike(href)) return true;
  if (safeMatch(doc, LIBRARY_HOME_QS)) return true;
  if (safeMatch(doc, RECENTS_QS)) return true;
  return safeMatch(doc, shelfSectionSelector(doc));
}

function closestSection(el: Element | null): HTMLElement | null {
  let node: Element | null = el;
  while (node) {
    if (node instanceof HTMLElement && /section|div/i.test(node.tagName) && node.childElementCount > 0) return node;
    node = node.parentElement;
  }
  return null;
}

type Anchor = { parent: HTMLElement; before: ChildNode | null };

const RECENTS_LABEL_FRAGMENTS_EXT = [...RECENTS_LABEL_FRAGMENTS, "jogado recentemente"];
const CHIP_LABELS = ["what's new", "friends", "recommended", "novidades", "amigos", "recomendados"];
const ANCHOR_CONTAINERS_QS = '[class*="gamepadlibrary"], [class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="AppGridFilterContainer"], [class*="AllPagesContainer"], main, [role="main"]';
const ANCHOR_CANDIDATES_QS = '[role="list"],[aria-label],[class*="ReactVirtualized__Grid"],[class*="ReactVirtualized__Grid__innerScrollContainer"]';

function isScrollableViewport(p: HTMLElement): boolean {
  try {
    const cs = getComputedStyle(p);
    const oy = (cs.overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight;
  } catch { return false; }
}

function findScrollableAncestor(start: HTMLElement, doc: Document): Anchor | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < 12 && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === doc.body) break;
    if (isScrollableViewport(p)) return { parent: p, before: container.nextSibling };
    container = p;
  }
  return null;
}

function anchorFromGridOrSection(node: Element): Anchor | null {
  const grid = (node as HTMLElement).closest?.('[class*="ReactVirtualized__Grid"]') as HTMLElement | null;
  const gridWrapper = grid?.parentElement as HTMLElement | null;
  if (gridWrapper?.parentElement) return { parent: gridWrapper.parentElement, before: gridWrapper.nextSibling };
  const section = closestSection(node);
  if (section?.parentElement) return { parent: section.parentElement, before: section.nextSibling };
  return null;
}

function anchorFromRecentsCandidates(doc: Document): Anchor | null {
  for (const node of Array.from(doc.querySelectorAll(ANCHOR_CANDIDATES_QS))) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`.toLowerCase();
    if (!RECENTS_LABEL_FRAGMENTS_EXT.some((label) => txt.includes(label))) continue;
    const scrollable = findScrollableAncestor(node as HTMLElement, doc);
    if (scrollable) return scrollable;
    const fallback = anchorFromGridOrSection(node);
    if (fallback) return fallback;
  }
  return null;
}

function anchorFromChipLabels(doc: Document): Anchor | null {
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!CHIP_LABELS.includes(text)) continue;
    const section = closestSection(node);
    if (section?.parentElement) return { parent: section.parentElement, before: section };
  }
  return null;
}

function anchorFromKnownContainers(doc: Document): Anchor | null {
  const known = doc.querySelector(shelfSectionSelector(doc)) as HTMLElement | null;
  if (known?.parentElement) return { parent: known.parentElement, before: known.nextSibling };
  for (const node of Array.from(doc.querySelectorAll(ANCHOR_CONTAINERS_QS))) {
    if (node instanceof HTMLElement) return { parent: node, before: node.firstChild };
  }
  return null;
}

function resolveAnchor(): Anchor | null {
  const { doc } = getHostContext();
  return anchorFromRecentsCandidates(doc) ?? anchorFromChipLabels(doc) ?? anchorFromKnownContainers(doc);
}

function safeResolveAnchor(): Anchor | null | "error" {
  try { return resolveAnchor(); }
  catch (err) {
    const msg = String(err);
    logError("HOME", "resolveAnchor threw — crash protection engaged", msg);
    mountFailed = true;
    mountError = msg;
    return "error";
  }
}

function createMountElement(doc: Document, anchorParent: HTMLElement): HTMLElement {
  const mount = doc.createElement("div");
  mount.id = ROOT_ID;
  mount.className = "Panel";
  Object.assign(mount.style, {
    width: "100%", display: "block", position: "relative",
    zIndex: "0", margin: "0", padding: "0",
  });
  logInfo("HOME", "mount created", { parent: anchorParent.tagName });
  return mount;
}

function reparentMountTo(mount: HTMLElement, anchor: Anchor): boolean {
  try {
    if (mount.parentElement !== anchor.parent || (anchor.before && mount.nextSibling !== anchor.before)) {
      anchor.parent.insertBefore(mount, anchor.before);
    }
    return true;
  } catch (err) {
    const msg = String(err);
    logError("HOME", "mount insertion threw — crash protection engaged", msg);
    mountFailed = true;
    mountError = msg;
    return false;
  }
}

function clearMountFailureIfRecovered(): void {
  const qaForceShelfError = __DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__;
  if (!mountFailed || qaForceShelfError) return;
  mountFailed = false;
  mountError = null;
  logInfo("HOME", "mount recovered after previous failure");
}

function applyPendingRecentsToFoundEl(mount: HTMLElement): void {
  try {
    setRecentsCollapsedStyle(cachedRecentsEl!, pendingHideRecents);
    applyRecentsFocusSuppression(pendingHideRecents);
  } catch (e) { logInfo("HOME", "ensureMount: recents hide failed", String(e)); }
  try { mount.style.setProperty("margin-top", pendingHideRecents ? "56px" : "", "important"); }
  catch (e) { logInfo("HOME", "ensureMount: margin-top failed", String(e)); }
}

function refreshCachedRecentsEl(doc: Document, mount: HTMLElement): void {
  if (cachedRecentsEl && cachedRecentsEl.isConnected) return;
  cachedRecentsEl = findRecentsEl(doc, mount);
  if (!cachedRecentsEl) return;
  logInfo("HOME", "recents element found", { cls: cachedRecentsEl.className.substring(0, 60) });
  applyPendingRecentsToFoundEl(mount);
}

function ensureMount(): HTMLElement | null {
  if (!isHomeVisible()) return null;
  const { doc } = getHostContext();
  const anchor = safeResolveAnchor();
  if (anchor === "error") return null;
  if (!anchor || anchor.parent === doc.body) {
    if (!noAnchorLogged) { noAnchorLogged = true; logWarn("HOME", "no mount anchor found yet", getContextSnapshot()); }
    return null;
  }
  noAnchorLogged = false;
  let mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (!mount) mount = createMountElement(doc, anchor.parent);
  if (!reparentMountTo(mount, anchor)) return null;
  clearMountFailureIfRecovered();
  refreshCachedRecentsEl(doc, mount);
  return mount;
}

class HomeBoundary extends React.Component<{ children: React.ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError(_err: unknown) { return { crashed: true }; }
  componentDidCatch(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    boundaryFailureCount++;
    if (__DEV__) logError("HOME", `shelf render crashed (${boundaryFailureCount}/${MAX_BOUNDARY_FAILURES})`, msg);
    logDiagnostic("error", "Home shelf render crashed", msg);
    if (boundaryFailureCount >= MAX_BOUNDARY_FAILURES) {
      mountFailed = true;
      mountError = msg;
      try {
        const { doc } = getHostContext();
        const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
        if (mount) { mount.innerHTML = ""; mount.style.display = "none"; }
      } catch {}
      notify("error", { title: i18next.t("mount_crash_title"), body: i18next.t("mount_crash_warning") });
      notifyMountFailedChange();
    } else {
      setTimeout(() => { if (!mountFailed) this.setState({ crashed: false }); }, 500);
    }
  }
  render() { return this.state.crashed ? null : this.props.children; }
}

function HomeDomBridge() {
  try { (globalThis as any).__ds_bridge_renders = (((globalThis as any).__ds_bridge_renders ?? 0) + 1); } catch {}
  getHostContext();
  return React.createElement(
    HomeBoundary,
    null,
    React.createElement(React.Fragment, null,
      React.createElement(HomeShelves),
      React.createElement(SearchOverlay),
      React.createElement(ShelfSideNav),
      React.createElement(DeckScreensaverOverlay),
    ),
  );
}

function tryStoreMethod(store: any, method: 'addComponent' | 'register'): boolean {
  if (typeof store[method] !== "function") return false;
  try {
    const dispose = store[method](GLOBAL_COMPONENT_ID, HomeDomBridge);
    if (typeof dispose === "function") uninstallHooks.push(dispose);
    return true;
  } catch { return false; }
}

function tryStoreStateArray(store: any, state: any, key: 'components' | 'globalComponents'): boolean {
  const arr = (state as any)[key];
  if (!Array.isArray(arr)) return false;
  const next = arr.slice();
  next.push({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge });
  store.setState({ ...(state as any), [key]: next });
  uninstallHooks.push(() => {
    try {
      const s = store.getState?.();
      const filtered = Array.isArray(s?.[key]) ? s[key].filter((x: any) => x?.id !== GLOBAL_COMPONENT_ID) : s?.[key];
      store.setState({ ...(s ?? {}), [key]: filtered });
    } catch {}
  });
  return true;
}

function tryStoreGetSetState(store: any): boolean {
  if (typeof store.getState !== "function" || typeof store.setState !== "function") return false;
  try {
    const state = store.getState?.();
    if (!state || typeof state !== "object") return false;
    return tryStoreStateArray(store, state, 'components') || tryStoreStateArray(store, state, 'globalComponents');
  } catch { return false; }
}

function registerBridgeViaStore(store: any): boolean {
  if (!store) return false;
  return tryStoreMethod(store, 'addComponent')
      || tryStoreMethod(store, 'register')
      || tryStoreGetSetState(store);
}

function registerBridgeViaWrapper(routerHook: any): boolean {
  const wrapKey = ["DeckyGlobalComponentsWrapper", "DeckyGamepadRouterWrapper", "DeckyDesktopRouterWrapper"];
  for (const key of wrapKey) {
    const original = routerHook?.[key];
    if (typeof original !== "function") continue;
    if ((original as any).__deckShelvesWrapped) return true;
    try {
      const wrapped = function wrappedDeckyComponent(props: any) {
        const originalNode = original(props);
        return React.createElement(React.Fragment, null, originalNode, React.createElement(HomeDomBridge));
      };
      (wrapped as any).__deckShelvesWrapped = true;
      routerHook[key] = wrapped;
      uninstallHooks.push(() => {
        try {
          if (routerHook[key] === wrapped) routerHook[key] = original;
        } catch {}
      });
      return true;
    } catch {}
  }
  return false;
}

function registerBridgeViaRouteHook(routerHook: any): boolean {
  const originalRoute = routerHook?.Route;
  if (typeof originalRoute !== "function") return false;
  if ((originalRoute as any).__deckShelvesWrappedRoute) return true;
  try {
    const wrappedRoute = function wrappedRoute(...args: any[]) {
      const node = originalRoute(...args);
      return React.createElement(React.Fragment, null, node, React.createElement(HomeDomBridge));
    };
    (wrappedRoute as any).__deckShelvesWrappedRoute = true;
    routerHook.Route = wrappedRoute;
    uninstallHooks.push(() => {
      try {
        if (routerHook.Route === wrappedRoute) routerHook.Route = originalRoute;
      } catch {}
    });
    return true;
  } catch {}
  return false;
}

type BridgeAttempt = { signature: string; invoke: () => any };

function buildAddGlobalAttempts(addGlobalComponent: Function): BridgeAttempt[] {
  return [
    { signature: "id,component", invoke: () => addGlobalComponent(GLOBAL_COMPONENT_ID, HomeDomBridge) },
    { signature: "component", invoke: () => addGlobalComponent(HomeDomBridge) },
    { signature: "object", invoke: () => addGlobalComponent({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge }) },
  ];
}

function tryAddGlobalComponentSignatures(routerHook: any): boolean {
  const fn = routerHook?.addGlobalComponent;
  if (typeof fn !== "function") {
    logWarn("HOME", "routerHook.addGlobalComponent unavailable");
    return false;
  }
  for (const attempt of buildAddGlobalAttempts(fn)) {
    try {
      const disp = attempt.invoke();
      if (typeof disp === "function") removeGlobalComponent = disp;
      logInfo("HOME", "global component bridge registered", { signature: attempt.signature });
      return true;
    } catch {}
  }
  return false;
}

function registerGlobalBridge(routerHook: any): boolean {
  if (tryAddGlobalComponentSignatures(routerHook)) return true;
  const storeAttempts: Array<[any, string]> = [
    [routerHook?.globalComponentsState, "globalComponentsState"],
    [routerHook?.renderedComponents, "renderedComponents"],
  ];
  for (const [store, signature] of storeAttempts) {
    if (registerBridgeViaStore(store)) {
      logInfo("HOME", "global component bridge registered", { signature });
      return true;
    }
  }
  if (registerBridgeViaWrapper(routerHook)) {
    logInfo("HOME", "global component bridge registered", { signature: "wrapper-patch" });
    return true;
  }
  if (registerBridgeViaRouteHook(routerHook)) {
    logInfo("HOME", "global component bridge registered", { signature: "route-hook" });
    return true;
  }
  return false;
}

export function installHomePatch(_routerHook?: any) {
  if (typeof document === "undefined") return null;
  const routerHook = _routerHook;

  logInfo("HOME", "installHomePatch start", {
    pathname: getHostContext().win.location?.pathname,
    hash: getHostContext().win.location?.hash,
    hasRouterHook: !!routerHook,
    routerHookKeys: Object.keys(routerHook ?? {}).slice(0, 20),
  });

  let bridgeRegistered = false;
  // Time the bridge was set up, for the fallback grace window below.
  const installedAt = Date.now();
  // How long a registered bridge gets to render before the DOM fallback steps in.
  // The fallback exists only for a bridge that failed to register/render; a
  // slower-to-render working bridge must not race it into a double mount.
  const BRIDGE_FALLBACK_GRACE_MS = 8000;

  try {
    bridgeRegistered = registerGlobalBridge(routerHook);
    if (!bridgeRegistered) logWarn("HOME", "all global bridge strategies failed");
  } catch (error) {
    logWarn("HOME", "global component bridge setup failed", String(error));
  }

  let fallbackRoot: { unmount(): void } | null = null;
  /* The actual mount ELEMENT, not just its id string — a Home implementation
     that tears down and recreates the anchor DOM (same id, a different node)
     still string-matches the old id; identity is what actually detects
     "this is a fresh, unrendered node." */
  let fallbackMountEl: HTMLElement | null = null;
  let fallbackRetries = 0;
  const MAX_FALLBACK_RETRIES = 6;

  const giveUpFallback = () => {
    logWarn("HOME", "fallback: giving up after max retries", { retries: fallbackRetries });
    if (timer) { window.clearInterval(timer); timer = 0; }
    observer?.disconnect();
  };

  const resolveReactDOM = (win: Window): any => {
    return (globalThis as any).ReactDOM ?? (globalThis as any).SP_REACTDOM ?? (win as any).ReactDOM ?? (win as any).SP_REACTDOM;
  };

  /* React DOM 19 dropped createRoot/render from the base react-dom package
     (moved to react-dom/client). Confirmed on the 2026-09-09 Steam Beta: no
     known global has it anymore — it's in its own webpack module, findable
     by export name like ownQamTab.ts finds Steam's internals. Cached: the
     module graph doesn't change mid-session. */
  let cachedWebpackCreateRoot: ((container: Element) => { render(node: unknown): void; unmount(): void }) | null | undefined;
  const findCreateRootViaWebpack = (): typeof cachedWebpackCreateRoot => {
    if (cachedWebpackCreateRoot !== undefined) return cachedWebpackCreateRoot;
    try {
      const mod: any = findModuleByExport((_val: any, name: string) => name === "createRoot");
      cachedWebpackCreateRoot = typeof mod?.createRoot === "function" ? mod.createRoot : null;
    } catch { cachedWebpackCreateRoot = null; }
    return cachedWebpackCreateRoot;
  };

  /* Attempt 1 (2026-09-11, reverted): wrapped this tree in a HAND-BUILT
     nav-tree node (CreateNode + RegisterNavigationItem). Real Focusables
     did register, but the whole subtree hung off one synthetic, flat node
     with no real row/card geometry — directional navigation was erratic.
     See `.roadmaps/steam-beta-2026-09-compat.md` §3. */

  /* Attempt 3 (2026-09-12): reuse a REAL, already-registered nav node as the
     parent Context value instead of fabricating one, so nested Focusables
     register normally with real geometry. Confirmed live via CDP; NOT yet
     physically verified — CDP can't confirm dpad feel, only tree shape.
     Full rationale: `.roadmaps/steam-beta-2026-09-compat.md` §3. */
  const looksLikeNavNode = (v: any): boolean =>
    !!v && typeof v === "object" && typeof v.BTakeFocus === "function" && !!(v.m_Tree || v.Tree);

  const findNavProviderInChain = (startFiber: any): any | null => {
    let f = startFiber;
    for (let i = 0; i < 40 && f; i++) {
      if (f.tag === 10 && looksLikeNavNode(f.memoizedProps?.value)) return f.type;
      f = f.return;
    }
    return null;
  };

  let cachedNavProviderType: any | null | undefined;
  const findNavProviderType = (mount: HTMLElement): any | null => {
    if (cachedNavProviderType !== undefined) return cachedNavProviderType;
    cachedNavProviderType = null;
    try {
      const candidates = [mount.previousElementSibling, mount.nextElementSibling, mount.parentElement]
        .filter((el): el is HTMLElement => !!el && el !== mount);
      for (const el of candidates) {
        const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
        if (!fiberKey) continue;
        const found = findNavProviderInChain((el as any)[fiberKey]);
        if (found) { cachedNavProviderType = found; return found; }
      }
    } catch (e) { logInfo("HOME", "findNavProviderType failed", String(e)); }
    return cachedNavProviderType;
  };

  const findNodeByElement = (node: any, targetEl: HTMLElement): any | null => {
    const el = node.Element ?? node.m_element ?? node.m_Element;
    if (el === targetEl) return node;
    const children: any[] = node.m_rgChildren ?? [];
    for (const child of children) {
      const found = findNodeByElement(child, targetEl);
      if (found) return found;
    }
    return null;
  };

  const findRealParentNavNode = (mount: HTMLElement): any | null => {
    const targetEl = mount.parentElement;
    if (!targetEl) return null;
    try {
      for (const tree of getGamepadNavigationTrees()) {
        const root = tree.Root ?? tree.m_Root ?? tree.m_root;
        if (!root) continue;
        const found = findNodeByElement(root, targetEl);
        if (found) return found;
      }
    } catch (e) { logInfo("HOME", "findRealParentNavNode failed", String(e)); }
    return null;
  };

  const wrapWithRealNavParent = (mount: HTMLElement, innerTree: any): any => {
    const providerType = findNavProviderType(mount);
    const realParentNode = providerType ? findRealParentNavNode(mount) : null;
    if (!providerType || !realParentNode) return innerTree;
    logInfo("HOME", "fallback: wrapped tree in real nav-tree parent node");
    return React.createElement(providerType, { value: realParentNode }, innerTree);
  };

  const renderWithReactDOM = (ReactDOM: any, mount: HTMLElement): { unmount(): void } | null => {
    const innerTree = React.createElement(
    HomeBoundary,
    null,
    React.createElement(React.Fragment, null,
      React.createElement(HomeShelves),
      React.createElement(SearchOverlay),
      React.createElement(ShelfSideNav),
      React.createElement(DeckScreensaverOverlay),
    ),
  );
    const tree = wrapWithRealNavParent(mount, innerTree);
    const renderFn = ReactDOM.createRoot ?? ReactDOM.default?.createRoot;
    if (typeof renderFn === "function") {
      const root = renderFn.call(ReactDOM.default ?? ReactDOM, mount);
      root.render(tree);
      logInfo("HOME", "fallback: rendered via createRoot");
      return root;
    }
    if (typeof ReactDOM.render === "function") {
      ReactDOM.render(tree, mount);
      logInfo("HOME", "fallback: rendered via legacy render");
      return { unmount: () => { try { ReactDOM.unmountComponentAtNode?.(mount); } catch {} } };
    }
    const webpackCreateRoot = findCreateRootViaWebpack();
    if (webpackCreateRoot) {
      const root = webpackCreateRoot(mount);
      root.render(tree);
      logInfo("HOME", "fallback: rendered via webpack-discovered createRoot");
      return root;
    }
    return null;
  };

  const ensureFallbackMount = (): HTMLElement | null => {
    const mount = ensureMount();
    if (mount) { fallbackRetries = 0; return mount; }
    if (++fallbackRetries >= MAX_FALLBACK_RETRIES) giveUpFallback();
    return null;
  };

  const shouldSkipFallbackRender = (doc: Document): boolean => {
    const existing = doc.getElementById(ROOT_ID);
    return existing?.dataset?.deckShelvesRenderer === "react";
  };

  const teardownPreviousFallbackRoot = (): void => {
    if (!fallbackRoot) return;
    try { fallbackRoot.unmount(); } catch {}
    fallbackRoot = null;
  };

  const mountFallbackTo = (win: Window, mount: HTMLElement): void => {
    teardownPreviousFallbackRoot();
    const ReactDOM = resolveReactDOM(win);
    if (!ReactDOM) { logWarn("HOME", "fallback: ReactDOM unavailable"); return; }
    const rendered = renderWithReactDOM(ReactDOM, mount);
    if (rendered) { fallbackRoot = rendered; fallbackMountEl = mount; }
    else logWarn("HOME", "fallback: no working render path found (global or webpack)");
  };

  // The bridge is rendering the home once its component has rendered at least
  // once (`__ds_bridge_renders` > 0) — earlier than the post-mount marker.
  const bridgeIsRendering = (): boolean =>
    bridgeRegistered && (((globalThis as any).__ds_bridge_renders as number) || 0) > 0;

  /* True when the DOM fallback must NOT render. The bridge and this fallback must
     never both mount HomeShelves into the same root (that duplicates every shelf),
     so once the bridge is rendering it owns the home — drop any fallback already
     up. A registered bridge also gets a grace window to render before we fall back
     (the fallback is only for a bridge that failed to register/render). */
  const fallbackShouldYield = (doc: Document): boolean => {
    if (bridgeIsRendering()) { if (fallbackRoot) teardownPreviousFallbackRoot(); return true; }
    if (shouldSkipFallbackRender(doc)) return true;
    if (!isHomeVisible()) { fallbackRetries = 0; return true; }
    return bridgeRegistered && Date.now() - installedAt < BRIDGE_FALLBACK_GRACE_MS;
  };

  const tryFallbackRender = () => {
    try {
      const { win, doc } = getHostContext();
      if (fallbackShouldYield(doc)) return;
      const mount = ensureFallbackMount();
      if (!mount || mount.dataset.deckShelvesRenderer === "react") return;
      if (fallbackRoot && fallbackMountEl === mount && mount.isConnected) return;
      mountFallbackTo(win, mount);
    } catch (err) {
      logWarn("HOME", "fallback render error", String(err));
    }
  };

  const { win: hostWin, doc: hostDoc } = getHostContext();
  observer?.disconnect();
  /* rAF-throttle: a body+subtree observer fires hundreds of times per
     second at boot while Steam's UI hydrates. Coalescing to one call per
     frame keeps the early-mount path responsive without losing coverage
     of structural DOM changes the mount detection needs to react to. */
  let fallbackPending: number | null = null;
  const scheduleFallback = () => {
    if (fallbackPending != null) return;
    fallbackPending = window.requestAnimationFrame(() => {
      fallbackPending = null;
      tryFallbackRender();
    });
  };
  observer = new MutationObserver(scheduleFallback);
  observer.observe(hostDoc.body, { childList: true, subtree: true });

  if (timer) window.clearInterval(timer);
  timer = window.setInterval(tryFallbackRender, 2000);

  const onRouteSignal = () => tryFallbackRender();
  hostWin.addEventListener("hashchange", onRouteSignal);
  hostWin.addEventListener("popstate", onRouteSignal);
  globalThis.addEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);

  tryFallbackRender();

  logInfo("HOME", "installHomePatch complete", { bridgeRegistered });

  const popAllUninstallHooks = (): void => {
    while (uninstallHooks.length) {
      const fn = uninstallHooks.pop();
      try { fn?.(); } catch {}
    }
  };

  const removeBridgeRegistration = (): void => {
    try { removeGlobalComponent?.(); removeGlobalComponent = null; } catch {}
    try { routerHook?.removeGlobalComponent?.(GLOBAL_COMPONENT_ID); } catch {}
    try { routerHook?.removeGlobalComponent?.(HomeDomBridge); } catch {}
  };

  const runUninstallHooks = (): void => {
    removeBridgeRegistration();
    popAllUninstallHooks();
  };

  const tearDownObserversAndListeners = (): void => {
    if (timer) { window.clearInterval(timer); timer = 0; }
    observer?.disconnect();
    observer = null;
    hostWin.removeEventListener("hashchange", onRouteSignal);
    hostWin.removeEventListener("popstate", onRouteSignal);
    globalThis.removeEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);
  };

  const tearDownFallbackRoot = (): void => {
    try { fallbackRoot?.unmount(); } catch {}
    fallbackRoot = null;
    try { hostDoc.getElementById(ROOT_ID)?.remove(); } catch {}
  };

  return {
    uninstall() {
      logInfo("HOME", "uninstalling home patch");
      runUninstallHooks();
      tearDownObserversAndListeners();
      tearDownFallbackRoot();
    },
  };
}
