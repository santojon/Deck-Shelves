import { logInfo } from "./logger";
import { getAllSteamDocuments } from "./steamHost";
import { isBigArtModeActive } from "../core/cssLoaderDetect";
import { steamText } from "../steam/steamText";
import { getHostContext, ROOT_ID } from "./homePatchWindow";
import { setFocusableTabindex } from "./homePatchTabs";

export let cachedRecentsEl: HTMLElement | null = null;
export let pendingHideRecents: boolean = false;

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

export function reseedCachedRecentsEl(): void {
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
export function applyRecentsFocusSuppression(hidden: boolean): void {
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

export function applyRecentsCollapse(hidden: boolean): void {
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

export function getPendingHideRecents(): boolean { return pendingHideRecents; }

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

function applyPendingRecentsToFoundEl(mount: HTMLElement): void {
  try {
    setRecentsCollapsedStyle(cachedRecentsEl!, pendingHideRecents);
    applyRecentsFocusSuppression(pendingHideRecents);
  } catch (e) { logInfo("HOME", "ensureMount: recents hide failed", String(e)); }
  try { mount.style.setProperty("margin-top", pendingHideRecents ? "56px" : "", "important"); }
  catch (e) { logInfo("HOME", "ensureMount: margin-top failed", String(e)); }
}

export function refreshCachedRecentsEl(doc: Document, mount: HTMLElement): void {
  if (cachedRecentsEl && cachedRecentsEl.isConnected) {
    if (!cachedRecentsEl.contains(mount) && !cacheStaleUnderBigArt(mount)) return;
    releaseWronglyCollapsedRecentsEl(cachedRecentsEl);
  }
  cachedRecentsEl = findRecentsEl(doc, mount);
  if (!cachedRecentsEl) return;
  logInfo("HOME", "recents element found", { cls: cachedRecentsEl.className.substring(0, 60) });
  applyPendingRecentsToFoundEl(mount);
}
