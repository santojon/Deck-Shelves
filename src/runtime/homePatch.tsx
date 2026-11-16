import React from "react";
import i18next from "i18next";
import { HomeShelves as HomeShelvesRaw, bridgeHasFilledHome } from "../components/HomeInject";
import { wrapHomeShelves } from "../qa/harness";
const HomeShelves = wrapHomeShelves(HomeShelvesRaw);
import { SearchOverlay } from "../features/search/SearchOverlay";
import { ShelfSideNav } from "../features/sidenav/ShelfSideNav";
import { DeckScreensaverOverlay } from "../components/screensaver/DeckScreensaverOverlay";
import { logDiagnostic } from "./diagnostics";
import { logError, logInfo, logWarn } from "./logger";
import { setPreferredSteamWindow, getAllSteamDocuments } from "./steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { isBigArtModeActive } from "../core/cssLoaderDetect";
import { notify } from "../components/notify";
import { findModuleByExport } from "./host/decky";
import { recordRemountTry, observerCreated, observerDisposed } from "../core/perfMetrics";
import { createBridgeGateState, noteFallbackTick, bridgeGraceActive, hrefOf } from "./homePatchFallbackGate";
import { installFallbackPoll, type FallbackPoll } from "./homePatchFallback";
import { getPowerState } from "./powerGate";
import { matchesSteamText, steamText, steamTextSelectors } from "../steam/steamText";
import { activeNavTrees } from "../components/home/navPatches/focusNav";

const ROOT_ID = "deck-shelves-home-root";
const GLOBAL_COMPONENT_ID = "DeckShelvesHomeDomBridge";

let observer: MutationObserver | null = null;
let fallbackPoll: FallbackPoll | null = null;
let noAnchorLogged = false;
let removeGlobalComponent: (() => void) | null = null;
const uninstallHooks: Array<() => void> = [];
let lastHostSource = "";

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

let cachedRecentsEl: HTMLElement | null = null;
let pendingHideRecents: boolean = false;
let pendingHideHomeTabs: boolean = false;

// With replace active the recents row stays visible, so the default overlap would cover the next shelf's title.
const MARGIN_RETRY_MAX = 5;
let marginRetryTimer: ReturnType<typeof setTimeout> | null = null;
// Runs right after applyHideRecents, so restore its margin instead of removing it.
const replaceMarginValue = (active: boolean): string => (active ? "0px" : pendingHideRecents ? "56px" : "");
function mountsInEveryDoc(): HTMLElement[] {
  // Every known doc: the mount's resolver and the host context can disagree about which doc is current.
  const docs = new Set<Document>([getHostContext().doc, ...getAllSteamDocuments()]);
  return [...docs].map((doc) => doc?.getElementById?.(ROOT_ID) as HTMLElement | null).filter((m): m is HTMLElement => !!m);
}
export function applyReplaceActiveMargin(active: boolean, attempt = 0): void {
  if (marginRetryTimer) { clearTimeout(marginRetryTimer); marginRetryTimer = null; }
  try {
    const mounts = mountsInEveryDoc();
    for (const mount of mounts) mount.style.setProperty("margin-top", replaceMarginValue(active), "important");
    // The mount can be mid-recreation when settings finish loading.
    if (!mounts.length && attempt < MARGIN_RETRY_MAX) marginRetryTimer = setTimeout(() => applyReplaceActiveMargin(active, attempt + 1), 400);
  } catch (e) { logInfo("HOME", "applyReplaceActiveMargin failed", String(e)); }
}


// Under Big Art the structural previous sibling is ground truth, so a cache pointing elsewhere is stale.
function cacheStaleUnderBigArt(mount: HTMLElement | null): boolean {
  return !!mount && isBigArtModeActive() && cachedRecentsEl !== mount.previousElementSibling;
}

function reseedCachedRecentsEl(): void {
  const { doc } = getHostContext();
  const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (cachedRecentsEl && cachedRecentsEl.isConnected) {
    // A later reparent can leave the cache wrapping our own mount; collapsing it would hide every shelf.
    if (!(mount != null && cachedRecentsEl.contains(mount)) && !cacheStaleUnderBigArt(mount)) return;
    releaseWronglyCollapsedRecentsEl(cachedRecentsEl);
  }
  try {
    if (mount) cachedRecentsEl = findRecentsEl(doc as Document, mount);
  } catch (e) { logInfo("HOME", "applyHideRecents: findRecentsEl failed", String(e)); }
}

function elMatchesRecentsLabel(el: HTMLElement, labels: string[]): boolean {
  try {
    const aria = (el.getAttribute && el.getAttribute('aria-label'))?.toLowerCase() ?? '';
    const txt = (aria || (el.innerText || '')).toLowerCase().substring(0, 80);
    return labels.some((l) => txt.includes(l));
  } catch { return false; }
}

function restoreRecentsByLabelSearch(): void {
  try {
    const doc = getHostContext().doc, scope: ParentNode = (doc.getElementById(ROOT_ID) as HTMLElement | null)?.parentElement ?? doc, labels = steamText("recentGames");
    for (const el of Array.from(scope.querySelectorAll<HTMLElement>('*'))) {
      if (!elMatchesRecentsLabel(el, labels)) continue;
      try { for (const p of ["visibility", "height", "min-height", "max-height", "overflow"]) el.style.removeProperty(p); } catch {}
    }
  } catch (e) { logInfo("HOME", "applyHideRecents: fallback restore failed", String(e)); }
}

// GamepadUI's nav tree ignores CSS visibility, so drop the hidden row's focusables too.
function applyRecentsFocusSuppression(hidden: boolean): void {
  if (!cachedRecentsEl) return;
  const focusables = cachedRecentsEl.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
  for (const f of Array.from(focusables)) setFocusableTabindex(f, hidden);
}

// `!important` because some themes force the recents panel's height with their own.
// display:none stops Steam mounting the row's cards, so the menu capture gets a real card first.
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
    // display:none is the only collapse GamepadUI's nav tree honours.
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

// Nothing else reverts a collapse once the element stops being the cached recents row.
function releaseWronglyCollapsedRecentsEl(el: HTMLElement): void {
  setRecentsCollapsedStyle(el, false);
  const focusables = el.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
  for (const f of Array.from(focusables)) setFocusableTabindex(f, false);
}

function applyRecentsCollapse(hidden: boolean): void {
  // A collapse left by an earlier instance carries our marker; release it too.
  if (!hidden) for (const d of getAllSteamDocuments()) d.querySelectorAll<HTMLElement>('[data-ds-hidden-collapse="1"]').forEach((el) => setRecentsCollapsedStyle(el, false));
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

// Each candidate needs a hashed class token so spacers and stray nodes are left alone.
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

// Home tabs contain a [role=tablist], which recents never has.
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

// Every home tab this plugin hid, whichever instance did it: a hot-swap
// predecessor's set is not ours, but its markers are.
function restoreAllHomeTabs(): void {
  const marked = getAllSteamDocuments().flatMap((d) => Array.from(d.querySelectorAll<HTMLElement>('[data-ds-ht-hidden="1"]')));
  for (const el of new Set([...hiddenHomeTabs, ...marked])) if (el.isConnected) setSiblingHidden(el, false);
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

// Steam re-renders hidden rows on route round-trips with `tabindex=0`, which traps gamepad focus.
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

// Big Art's single-hero state can render with no label signal, so trust our mount's previous sibling.
function bigArtStructuralRecents(prev: HTMLElement | null, mountEl: HTMLElement): HTMLElement | null {
  if (!prev || !isBigArtModeActive() || isDsOwn(prev, mountEl)) return null;
  return prev;
}

function findRecentsEl(doc: Document, mountEl: HTMLElement): HTMLElement | null {
  const labels = steamText("recentGames");
  const mountParent = mountEl.parentElement;
  if (!mountParent) return null;
  const prevEl = mountEl.previousElementSibling as HTMLElement | null;
  const prev = previousSiblingIsRecents(prevEl, mountEl, labels);
  return prev ?? recentsFromAriaScan(doc, mountEl, mountParent, labels) ?? bigArtStructuralRecents(prevEl, mountEl);
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

// Only used when the class map has no entry for this token.
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

const recentsQs = (): string => [...steamTextSelectors("recentGames", "aria-label", "exact"), '[class*="ReactVirtualized__Grid"][aria-label]'].join(", ");
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
  if (safeMatch(doc, recentsQs())) s += 8;
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
    hasHomeGrid: !!doc.querySelector(recentsQs()),
    hasLibraryContainers: !!doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]'),
    bodyChildren: doc.body?.childElementCount ?? 0,
  };
}

function hrefIsHomeLike(href: string): boolean {
  if (href.includes("library/home") || href.includes("#library/home")) return true;
  return href.includes("/library") && !href.includes("/library/app/") && !href.includes("/library/collections");
}

// The desktop client shares the Home URL and DOM shape; only this body class tells them apart.
function isDesktopUiActive(doc: Document): boolean {
  try { return !!doc.body?.classList?.contains("DesktopUI"); } catch { return false; }
}

function isHomeVisible(): boolean {
  const { win, doc } = getHostContext();
  if (isDesktopUiActive(doc)) return false;
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
  if (hrefIsHomeLike(href)) return true;
  if (safeMatch(doc, LIBRARY_HOME_QS)) return true;
  if (safeMatch(doc, recentsQs())) return true;
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

const ANCHOR_CONTAINERS_QS = '[class*="gamepadlibrary"], [class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="AppGridFilterContainer"], [class*="AllPagesContainer"], main, [role="main"]';
const ANCHOR_CANDIDATES_QS = '[role="list"],[aria-label],[class*="ReactVirtualized__Grid"],[class*="ReactVirtualized__Grid__innerScrollContainer"]';

// `lenient` accepts a scroll panel that doesn't overflow yet, or the anchor lands inside recents.
function isScrollableViewport(p: HTMLElement, lenient = false): boolean {
  try {
    const cs = getComputedStyle(p);
    const oy = (cs.overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll') && (lenient || p.scrollHeight > p.clientHeight);
  } catch { return false; }
}

function findScrollableAncestor(start: HTMLElement, doc: Document, lenient = false): Anchor | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < 12 && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === doc.body) break;
    if (isScrollableViewport(p, lenient)) return { parent: p, before: container.nextSibling };
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
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`;
    if (!matchesSteamText(txt, "recentGames", "contains")) continue;
    const scrollable = findScrollableAncestor(node as HTMLElement, doc) ?? findScrollableAncestor(node as HTMLElement, doc, true);
    if (scrollable) return scrollable;
    const fallback = anchorFromGridOrSection(node);
    if (fallback) return fallback;
  }
  return null;
}

function anchorFromChipLabels(doc: Document): Anchor | null {
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!matchesSteamText(text, "homeTabs", "exact")) continue;
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
  if (cachedRecentsEl && cachedRecentsEl.isConnected) {
    if (!cachedRecentsEl.contains(mount) && !cacheStaleUnderBigArt(mount)) return;
    releaseWronglyCollapsedRecentsEl(cachedRecentsEl);
  }
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
  // On a sole host the cross-window portal is unreliable and the same-window fallback owns the Home.
  if ((globalThis as any).__ds_sole_home_owned) return null;
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

  // Hides left behind by a predecessor would misplace our mount.
  restoreAllHomeTabs(); applyRecentsCollapse(false);
  const gate = createBridgeGateState(Date.now());

  try {
    gate.bridgeRegistered = registerGlobalBridge(routerHook);
    if (!gate.bridgeRegistered) logWarn("HOME", "all global bridge strategies failed");
  } catch (error) {
    logWarn("HOME", "global component bridge setup failed", String(error));
  }

  let fallbackRoot: { unmount(): void } | null = null;
  // The element, not its id: the Home can recreate the anchor with the same id.
  let fallbackMountEl: HTMLElement | null = null;
  // A new root clears its container on first commit, so it never lives on the mount itself.
  let fallbackHostEl: HTMLElement | null = null;
  let fallbackRetries = 0;
  const MAX_FALLBACK_RETRIES = 6;

  // A slow cold boot can exhaust the fast retries before the anchor appears, so back off instead of stopping.
  const giveUpFallback = () => {
    logWarn("HOME", "fallback: anchor not found after repeated attempts — backing off", { retries: fallbackRetries });
    fallbackRetries = 0;
    fallbackPoll?.backoff();
    // The observer stays attached so later hydration still reaches the fallback.
  };

  const resolveReactDOM = (win: Window): any => {
    return (globalThis as any).ReactDOM ?? (globalThis as any).SP_REACTDOM ?? (win as any).ReactDOM ?? (win as any).SP_REACTDOM;
  };

  // React DOM 19 moved createRoot out of react-dom; it lives in its own webpack module.
  let cachedWebpackCreateRoot: ((container: Element) => { render(node: unknown): void; unmount(): void }) | null | undefined;
  const findCreateRootViaWebpack = (): typeof cachedWebpackCreateRoot => {
    if (cachedWebpackCreateRoot !== undefined) return cachedWebpackCreateRoot;
    try {
      const mod: any = findModuleByExport((_val: any, name: string) => name === "createRoot");
      cachedWebpackCreateRoot = typeof mod?.createRoot === "function" ? mod.createRoot : null;
    } catch { cachedWebpackCreateRoot = null; }
    return cachedWebpackCreateRoot;
  };

  // Reuse a real registered nav node as the parent context; a synthetic one makes navigation erratic.
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
      for (const tree of activeNavTrees()) {
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
      React.createElement(HomeShelves, { fallback: true }),
      React.createElement(SearchOverlay),
      React.createElement(ShelfSideNav),
      React.createElement(DeckScreensaverOverlay),
    ),
  );
    const tree = wrapWithRealNavParent(mount, innerTree);
    const host = mount.ownerDocument.createElement("div");
    host.setAttribute("data-ds-fallback-host", ""); host.style.display = "contents";
    mount.appendChild(host); fallbackHostEl = host;
    const renderFn = ReactDOM.createRoot ?? ReactDOM.default?.createRoot;
    if (typeof renderFn === "function") {
      const root = renderFn.call(ReactDOM.default ?? ReactDOM, host); root.render(tree);
      logInfo("HOME", "fallback: rendered via createRoot"); return root;
    }
    if (typeof ReactDOM.render === "function") {
      ReactDOM.render(tree, host); logInfo("HOME", "fallback: rendered via legacy render");
      return { unmount: () => { try { ReactDOM.unmountComponentAtNode?.(host); } catch {} } };
    }
    const webpackCreateRoot = findCreateRootViaWebpack();
    if (!webpackCreateRoot) return null;
    const root = webpackCreateRoot(host); root.render(tree);
    logInfo("HOME", "fallback: rendered via webpack-discovered createRoot"); return root;
  };

  const ensureFallbackMount = (): HTMLElement | null => {
    const mount = ensureMount();
    if (mount) { fallbackRetries = 0; return mount; }
    if (++fallbackRetries >= MAX_FALLBACK_RETRIES) giveUpFallback();
    return null;
  };

  const teardownPreviousFallbackRoot = (): void => {
    if (fallbackRoot) { try { fallbackRoot.unmount(); } catch {} fallbackRoot = null; }
    if (fallbackHostEl) { try { fallbackHostEl.remove(); } catch {} fallbackHostEl = null; }
  };

  const mountFallbackTo = (win: Window, mount: HTMLElement): void => {
    teardownPreviousFallbackRoot();
    const ReactDOM = resolveReactDOM(win);
    if (!ReactDOM) { logWarn("HOME", "fallback: ReactDOM unavailable"); return; }
    const rendered = renderWithReactDOM(ReactDOM, mount);
    if (rendered) {
      fallbackRoot = rendered; fallbackMountEl = mount;
      // Sole host: tell the bridge to stand down so it never double-mounts into the same root.
      try { if (win !== window && !bridgeHasFilledHome()) (globalThis as any).__ds_sole_home_owned = true; } catch {}
    } else logWarn("HOME", "fallback: no working render path found (global or webpack)");
  };

  // The bridge owns the Home only once real shelf DOM is in the root; on a sole host it can stay empty.
  // A real shelf panel, not the bridge overlays' lone empty span.
  const bridgeOwnsHome = (doc: Document): boolean => doc.getElementById(ROOT_ID)?.querySelector(".deck-shelves-root") != null;

  // Two copies mean both rendered; a single copy may be ours alone and must never be torn down.
  const homeHasDuplicateContent = (doc: Document): boolean => (doc.getElementById(ROOT_ID)?.querySelectorAll(".deck-shelves-root").length ?? 0) > 1;

  // A fresh `data-ds-claimed-at` counts as ownership, since the bridge stamps it before its first commit.
  const tickAndCheckClaim = (doc: Document): boolean => {
    const root = doc.getElementById(ROOT_ID);
    const href = hrefOf(doc.defaultView);
    const rootFilled = !!root?.querySelector(".deck-shelves-root");
    // Host window: Home is the bare document URL; every other screen is /routes/<…>.
    noteFallbackTick(gate, !href.includes("/routes/") || hrefIsHomeLike(href), rootFilled, Date.now(), bridgeHasFilledHome());
    return !fallbackRoot && Date.now() - Number(root?.dataset?.dsClaimedAt || 0) < 3000;
  };

  const fallbackShouldYield = (doc: Document): boolean => {
    // Switching to the desktop client keeps our mount alive under another skin, so tear it down here.
    if (isDesktopUiActive(doc)) {
      if (fallbackRoot) teardownPreviousFallbackRoot();
      fallbackRetries = 0;
      return true;
    }
    if (tickAndCheckClaim(doc)) return true;
    if (!isHomeVisible()) { fallbackRetries = 0; return true; }
    if (bridgeOwnsHome(doc)) {
      if (fallbackRoot && (fallbackMountEl !== doc.getElementById(ROOT_ID) || homeHasDuplicateContent(doc))) {
        teardownPreviousFallbackRoot();
      }
      return true;
    }
    return bridgeGraceActive(gate, Date.now());
  };

  // The body observer fires hundreds of times per second at boot, so coalesce to one call per frame.
  let fallbackPending: number | null = null;
  const scheduleFallback = () => {
    if (fallbackPending != null) return;
    fallbackPending = window.requestAnimationFrame(() => {
      fallbackPending = null;
      tryFallbackRender();
    });
  };
  // The Big Picture window can appear or change after install, so follow its body.
  let observedDoc: Document | null = null;
  let unlistenPageHide: (() => void) | null = null;
  const attachObserver = (doc: Document): void => {
    if (!doc || !doc.body || observedDoc === doc) return;
    observer?.disconnect();
    observedDoc = doc;
    observer = new MutationObserver(scheduleFallback);
    try { observer.observe(doc.body, { childList: true, subtree: true }); } catch {}
    // That document going away (renderer reload) restarts the mount poll.
    unlistenPageHide?.();
    const win = doc.defaultView;
    const onPageHide = () => fallbackPoll?.wake();
    try { win?.addEventListener("pagehide", onPageHide); unlistenPageHide = () => win?.removeEventListener("pagehide", onPageHide); } catch {}
  };

  const tryFallbackRender = () => {
    try {
      const { win, doc } = getHostContext();
      attachObserver(doc);
      // The gate re-reads the route and window here: a sole host has no router hook to tell it.
      getPowerState();
      if (fallbackShouldYield(doc)) return;
      const mount = ensureFallbackMount();
      if (!mount) return;
      // Any HomeShelves sets the "react" marker, even the empty bridge, so it can't gate us.
      if (fallbackRoot && fallbackMountEl === mount && mount.isConnected && fallbackHostEl?.isConnected) return;
      mountFallbackTo(win, mount); recordRemountTry();
    } catch (err) {
      logWarn("HOME", "fallback render error", String(err));
    }
  };

  const { win: hostWin, doc: hostDoc } = getHostContext();
  observer?.disconnect();
  observedDoc = null; attachObserver(hostDoc); observerCreated();

  fallbackPoll?.dispose();
  fallbackPoll = installFallbackPoll(tryFallbackRender, () => !!fallbackRoot && !!fallbackHostEl?.isConnected);

  const onRouteSignal = () => tryFallbackRender();
  hostWin.addEventListener("hashchange", onRouteSignal);
  hostWin.addEventListener("popstate", onRouteSignal);
  globalThis.addEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);

  logInfo("HOME", "installHomePatch complete", { bridgeRegistered: gate.bridgeRegistered });

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
    fallbackPoll?.dispose(); fallbackPoll = null;
    unlistenPageHide?.(); unlistenPageHide = null;
    if (observer) observerDisposed(); observer?.disconnect(); observer = null;
    hostWin.removeEventListener("hashchange", onRouteSignal); hostWin.removeEventListener("popstate", onRouteSignal);
    globalThis.removeEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);
  };

  const tearDownFallbackRoot = (): void => {
    teardownPreviousFallbackRoot();
    // The sole-host claim goes with the root, so a next instance's bridge can render.
    try { hostDoc.getElementById(ROOT_ID)?.remove(); delete (globalThis as any).__ds_sole_home_owned; } catch {}
  };

  return {
    uninstall() {
      logInfo("HOME", "uninstalling home patch");
      // Give Steam its Home back as it was: a successor anchors next to the native rows.
      applyHideHomeTabs(false); applyHideRecents(false); runUninstallHooks();
      tearDownObserversAndListeners(); tearDownFallbackRoot();
    },
  };
}
