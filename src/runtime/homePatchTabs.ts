import { logInfo } from "./logger";
import { getAllSteamDocuments } from "./steamHost";
import { getHostContext, ROOT_ID } from "./homePatchWindow";

export let pendingHideHomeTabs: boolean = false;

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

export function setFocusableTabindex(f: HTMLElement, hidden: boolean): void {
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

export const hiddenHomeTabs = new Set<HTMLElement>();

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
export function restoreAllHomeTabs(): void {
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

export function getPendingHideHomeTabs(): boolean { return pendingHideHomeTabs; }
