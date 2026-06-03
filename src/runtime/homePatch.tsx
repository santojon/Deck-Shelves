import React from "react";
import i18next from "i18next";
import { HomeShelves as HomeShelvesRaw } from "../components/HomeInject";
import { wrapHomeShelves } from "../qa/harness";
const HomeShelves = wrapHomeShelves(HomeShelvesRaw);
import { logDiagnostic } from "./diagnostics";
import { logError, logInfo, logWarn } from "./logger";
import { setPreferredSteamWindow } from "./steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { toaster } from "../shims/decky-api";

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

/** Override the DS mount margin-top when the replace-recents experimental
 *  toggle is actively injecting. Without this, the default CSS rule pulls
 *  the DS area up by 32px to overlap the recents bottom — fine when recents
 *  is collapsed, but with replace active the recents row stays visible
 *  (showing our injected content) and the 32px overlap pushes the next
 *  DS shelf's title into the recents area (especially under CSS Loader
 *  themes like SLH that extend the recents visually).
 */
export function applyReplaceActiveMargin(active: boolean): void {
  try {
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
    if (!mount) return;
    if (active) {
      mount.style.setProperty("margin-top", "0px", "important");
    } else {
      // Leave applyHideRecents in control when replace is not active.
      mount.style.removeProperty("margin-top");
    }
  } catch (e) { logInfo("HOME", "applyReplaceActiveMargin failed", String(e)); }
}

export function applyHideRecents(hidden: boolean): void {
  pendingHideRecents = hidden;
  // If cache is stale, try to re-find the element via the host document
  if (!cachedRecentsEl || !cachedRecentsEl.isConnected) {
    try {
      const { doc } = getHostContext();
      const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
      if (mount) {
        cachedRecentsEl = findRecentsEl(doc as Document, mount);
      }
    } catch (e) { logInfo("HOME", "applyHideRecents: findRecentsEl failed", String(e)); }
  }

  // If we couldn't find a specific recents element, but the caller requests
  // that recents be shown (hidden === false), attempt a broader restore pass
  // to undo any inline styles we may have applied earlier (or that other
  // code applied) — this helps when DOM structure changes and our cached
  // reference is stale but recents are still present under a different node.
  if (!cachedRecentsEl && !hidden) {
    try {
      const { doc } = getHostContext();
      const labels = ["jogos recentes", "recent games", "recently played", "played recently", "jogados recentemente"];
      const candidates = Array.from(doc.querySelectorAll<HTMLElement>('*'));
      for (const el of candidates) {
        try {
          const aria = (el.getAttribute && el.getAttribute('aria-label'))?.toLowerCase() ?? '';
          const txt = (aria || (el.innerText || '')).toLowerCase().substring(0, 80);
          if (!labels.some((l) => txt.includes(l))) continue;
          try { el.style.visibility = ''; el.style.height = ''; el.style.overflow = ''; } catch {}
        } catch {}
      }
    } catch (e) { logInfo("HOME", "applyHideRecents: fallback restore failed", String(e)); }
  }

  // Hide native recents via visibility+height collapse (the v2.2.2 contract).
  // Deliberately NOT using display:none (re-enters the gamepad nav tree
  // inconsistently across SteamOS builds) nor off-screen positioning (broke
  // ArtHero shelf placement on restart). The known trade-off — D-pad needs
  // two "up" presses to reach the search bar — is known limitation.
  if (cachedRecentsEl) {
    try {
      cachedRecentsEl.style.visibility = hidden ? "hidden" : "";
      cachedRecentsEl.style.height     = hidden ? "0px" : "";
      cachedRecentsEl.style.overflow   = hidden ? "hidden" : "";
    } catch (e) { logInfo("HOME", "applyHideRecents: style set failed", String(e)); }
  }
  // Adjust mount margin-top: add breathing room at top when recents are hidden
  try {
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
    if (mount) {
      mount.style.setProperty("margin-top", hidden ? "56px" : "", "important");
      // If we're forcing recents visible, also remove any mount-level offset
      if (!hidden) {
        try { mount.style.removeProperty('margin-top'); } catch {}
      }
    }
  } catch (e) { logInfo("HOME", "applyHideRecents: margin-top failed", String(e)); }
}

// --- Home tabs (the native home area: recents + friends + novidades, etc.) ---
// Scope: hide every sibling of our mount inside the same parent. Steam's home
// viewport places all native "tabs" as siblings of our mount; removing all of
// them leaves our shelves as the only visible area, which is the contract.
// Each candidate must carry at least one webpack-hashed token so decorative
// spacers/stray nodes aren't touched — no hardcoded classes.
function setSiblingHidden(el: HTMLElement, hidden: boolean) {
  if (hidden) {
    if (el.dataset.dsHtHidden !== "1") {
      el.dataset.dsHtPrevDisplay = el.style.getPropertyValue("display") || "";
      el.dataset.dsHtHidden = "1";
    }
    el.style.setProperty("display", "none", "important");
    el.setAttribute("aria-hidden", "true");
  } else if (el.dataset.dsHtHidden === "1") {
    const prev = el.dataset.dsHtPrevDisplay ?? "";
    el.style.removeProperty("display");
    if (prev) el.style.setProperty("display", prev);
    delete el.dataset.dsHtHidden;
    delete el.dataset.dsHtPrevDisplay;
    el.removeAttribute("aria-hidden");
  }
  const focusables = el.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
  for (const f of Array.from(focusables)) {
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
}

const hiddenHomeTabs = new Set<HTMLElement>();

// Identify the "home tabs" siblings (Novidades/Amigos/Recomendados). These are
// distinguished by containing a [role=tablist] descendant — a semantic marker
// that survives Steam bundle renames and doesn't overlap with recents (which
// has no tablist).
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

export function applyHideHomeTabs(hidden: boolean): void {
  pendingHideHomeTabs = hidden;
  try {
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;

    if (!hidden) {
      // Restore everything we hid; no further work.
      for (const el of Array.from(hiddenHomeTabs)) {
        if (el.isConnected) setSiblingHidden(el, false);
      }
      hiddenHomeTabs.clear();
      return;
    }
    if (!mount) return;

    // Idempotent: only act on differences between the requested state and the
    // currently-hidden set. The previous "restore-then-re-hide" pass caused a
    // brief layout shift on every call (the 2 s state poll fires often, and
    // each visual flicker on D-pad nav was visible). Now we leave already-
    // hidden siblings alone and only touch newcomers or stale refs.
    const current = collectHomeTabSiblings(mount);
    const currentSet = new Set(current);
    // 1) Drop stale refs (disconnected or moved out of the candidate set)
    for (const el of Array.from(hiddenHomeTabs)) {
      if (!el.isConnected) { hiddenHomeTabs.delete(el); continue; }
      if (!currentSet.has(el)) {
        setSiblingHidden(el, false);
        hiddenHomeTabs.delete(el);
      }
    }
    // 2) Hide any newcomers not yet tracked
    for (const el of current) {
      if (!hiddenHomeTabs.has(el)) {
        setSiblingHidden(el, true);
        hiddenHomeTabs.add(el);
      }
    }
  } catch (e) { logInfo("HOME", "applyHideHomeTabs failed", String(e)); }
}

/**
 * Re-applies BOTH the most recent hide-recents AND hide-home-tabs requests.
 * Used after Steam re-renders the home DOM (e.g. user goes to library and
 * comes back with B): the freshly mounted native recents/tabs arrive without
 * our hides applied, so this re-runs both apply paths with the cached flags.
 */
export function reapplyHomeHides(): void {
  applyHideRecents(pendingHideRecents);
  applyHideHomeTabs(pendingHideHomeTabs);
}

function findRecentsEl(doc: Document, mountEl: HTMLElement): HTMLElement | null {
  const labels = ["jogos recentes", "recent games", "recently played", "played recently", "jogados recentemente"];
  // Walk from aria-label nodes up to find the sibling of mountEl's parent
  const mountParent = mountEl.parentElement;
  if (!mountParent) return null;

  // Defensive helper: never match our own DS shelves or the mount itself.
  // DS shelves carry `ReactVirtualized__Grid` via buildShelfNode, which would
  // otherwise pass the heuristic below and lead applyHideRecents to strip
  // tabindex from our own focusables — making the shelves unfocusable.
  const isDsOwn = (el: HTMLElement): boolean => {
    if (!el) return false;
    if (el === mountEl || el.id === ROOT_ID) return true;
    if (el.classList?.contains('ds-shelf')) return true;
    if (el.classList?.contains('deck-shelves-root')) return true;
    if (el.querySelector?.('.ds-shelf, .deck-shelves-root, #' + ROOT_ID)) return true;
    return false;
  };

  // Check mountEl.previousElementSibling first (fastest path)
  const prev = mountEl.previousElementSibling as HTMLElement | null;
  if (prev && !isDsOwn(prev)) {
    const txt = (prev.getAttribute?.("aria-label") || prev.innerText || "").toLowerCase().substring(0, 80);
    if (labels.some((l) => txt.includes(l))) return prev;
    // Check descendants
    const inner = prev.querySelector("[aria-label]");
    if (inner) {
      const innerTxt = (inner.getAttribute("aria-label") || "").toLowerCase();
      if (labels.some((l) => innerTxt.includes(l))) return prev;
    }
    // Heuristic: if it looks like a game grid section, assume it's recents
    if (prev.querySelector("[class*='ReactVirtualized']")) return prev;
  }

  // Fallback: scan aria-label nodes and walk up to a sibling of mountParent
  const candidates = Array.from(doc.querySelectorAll("[aria-label]"));
  for (const node of candidates) {
    const txt = (node.getAttribute("aria-label") || "").toLowerCase();
    if (!labels.some((l) => txt.includes(l))) continue;
    let el = node as HTMLElement;
    while (el.parentElement && el.parentElement !== mountParent) {
      el = el.parentElement;
    }
    if (el.parentElement === mountParent && el !== mountEl && !isDsOwn(el)) return el;
  }
  return null;
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

  try { push(window, "current"); } catch {}
  try { push((window as any).opener, "opener"); } catch {}
  try { push(findSPWindow(), "findSP"); } catch {}
  try { push((window as any).SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow, "focusedWindow"); } catch {}
  try { push((window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow, "mainWindow"); } catch {}
  try {
    const steamWindows = (window as any).SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(steamWindows)) {
      for (const entry of steamWindows) push(entry?.BrowserWindow, "steamUIWindow");
    }
  } catch {}

  return out;
}

// Hardcoded fallback for the native shelf-section token. Used only when the
// runtime classmap hasn't been populated yet (very early boot, before
// `discoverClassMap` runs). Anywhere else, prefer the live token via
// `shelfSectionSelector(doc)`.
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

function scoreWindow(win: Window): number {
  try {
    const doc = win.document;
    const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
    let score = 0;
    if (href.includes("/routes/library/home") || href.includes("library/home")) score += 4;
    if (doc.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]')) score += 8;
    if (doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]')) score += 6;
    try { if (doc.querySelector(shelfSectionSelector(doc))) score += 2; } catch {}
    if (doc.body?.childElementCount) score += 1;
    return score;
  } catch {
    return -1;
  }
}

function getHostContext() {
  const candidates = getWindowCandidates();
  const best = candidates
    .map((entry) => ({ ...entry, score: scoreWindow(entry.win) }))
    .sort((a, b) => b.score - a.score)[0];
  const win = best?.win ?? window;
  const doc = win.document ?? document;
  const source = best?.source ?? "current";
  setPreferredSteamWindow(win);
  if (source !== lastHostSource) {
    lastHostSource = source;
    logInfo("HOME", "host context selected", {
      source,
      href: `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`,
      score: best?.score ?? 0,
    });
  }
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

function isHomeVisible(): boolean {
  const { win, doc } = getHostContext();
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
  if (href.includes("library/home") || href.includes("#library/home")) return true;
  if (href.includes("/library") && !href.includes("/library/app/") && !href.includes("/library/collections")) return true;
  if (doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]')) return true;
  if (doc.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]')) return true;
  try { if (doc.querySelector(shelfSectionSelector(doc))) return true; } catch {}
  return false;
}

function closestSection(el: Element | null): HTMLElement | null {
  let node: Element | null = el;
  while (node) {
    if (node instanceof HTMLElement && /section|div/i.test(node.tagName) && node.childElementCount > 0) return node;
    node = node.parentElement;
  }
  return null;
}

function resolveAnchor(): { parent: HTMLElement; before: ChildNode | null } | null {
  const { doc } = getHostContext();
  const labels = ["jogos recentes", "recent games", "recently played", "played recently", "jogados recentemente", "jogado recentemente"];
  const candidates = Array.from(doc.querySelectorAll('[role="list"],[aria-label],[class*="ReactVirtualized__Grid"],[class*="ReactVirtualized__Grid__innerScrollContainer"]'));
  for (const node of candidates) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`.toLowerCase();
    if (!labels.some((label) => txt.includes(label))) continue;
    // Walk up to the scrollable viewport to insert as a direct child
    let container: HTMLElement | null = node as HTMLElement;
    for (let i = 0; i < 12 && container; i++) {
      const p: HTMLElement | null = container.parentElement;
      if (!p || p === doc.body) break;
      try {
        const cs = getComputedStyle(p);
        const oy = (cs.overflowY || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
          return { parent: p, before: container.nextSibling };
        }
      } catch {}
      container = p;
    }
    // Fallback: grid wrapper parent
    const grid = (node as HTMLElement).closest?.('[class*="ReactVirtualized__Grid"]') as HTMLElement | null;
    const gridWrapper = grid?.parentElement as HTMLElement | null;
    if (gridWrapper?.parentElement) return { parent: gridWrapper.parentElement, before: gridWrapper.nextSibling };
    const section = closestSection(node as Element);
    if (section?.parentElement) return { parent: section.parentElement, before: section.nextSibling };
  }

  const chipLabels = ["what's new", "friends", "recommended", "novidades", "amigos", "recomendados"];
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!chipLabels.includes(text)) continue;
    const section = closestSection(node);
    if (section?.parentElement) return { parent: section.parentElement, before: section };
  }

  const known = doc.querySelector(shelfSectionSelector(doc)) as HTMLElement | null;
  if (known?.parentElement) return { parent: known.parentElement, before: known.nextSibling };

  const containers = Array.from(doc.querySelectorAll('[class*="gamepadlibrary"], [class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="AppGridFilterContainer"], [class*="AllPagesContainer"], main, [role="main"]'));
  for (const node of containers) {
    if (node instanceof HTMLElement) return { parent: node, before: node.firstChild };
  }

  return null;
}

function ensureMount(): HTMLElement | null {
  if (!isHomeVisible()) return null;
  const { doc } = getHostContext();
  let mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
  let anchor: ReturnType<typeof resolveAnchor>;
  try {
    anchor = resolveAnchor();
  } catch (err) {
    const msg = String(err);
    logError("HOME", "resolveAnchor threw — crash protection engaged", msg);
    mountFailed = true;
    mountError = msg;
    return null;
  }
  if (!anchor || anchor.parent === doc.body) {
    if (!noAnchorLogged) {
      noAnchorLogged = true;
      logWarn("HOME", "no mount anchor found yet", getContextSnapshot());
    }
    return null;
  }
  noAnchorLogged = false;

  if (!mount) {
    mount = doc.createElement("div");
    mount.id = ROOT_ID;
    mount.className = "Panel";
    mount.style.width = "100%";
    mount.style.display = "block";
    mount.style.position = "relative";
    mount.style.zIndex = "0";
    mount.style.margin = "0";
    mount.style.padding = "0";
    logInfo("HOME", "mount created", { parent: anchor.parent.tagName });
  }

  try {
    if (mount.parentElement !== anchor.parent || (anchor.before && mount.nextSibling !== anchor.before)) {
      anchor.parent.insertBefore(mount, anchor.before);
    }
  } catch (err) {
    const msg = String(err);
    logError("HOME", "mount insertion threw — crash protection engaged", msg);
    mountFailed = true;
    mountError = msg;
    return null;
  }

  // Success — clear any previous failure
  const qaForceShelfError = __DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__;
  if (mountFailed && !qaForceShelfError) {
    mountFailed = false;
    mountError = null;
    logInfo("HOME", "mount recovered after previous failure");
  }
  // Cache the recents element for hide/show; apply any pending state immediately
  if (!cachedRecentsEl || !cachedRecentsEl.isConnected) {
    cachedRecentsEl = findRecentsEl(doc, mount);
    if (cachedRecentsEl) {
      logInfo("HOME", "recents element found", { cls: cachedRecentsEl.className.substring(0, 60) });
      // Apply pending hide state now that we have the element
      try { cachedRecentsEl.style.visibility = pendingHideRecents ? "hidden" : ""; cachedRecentsEl.style.height = pendingHideRecents ? "0px" : ""; cachedRecentsEl.style.overflow = pendingHideRecents ? "hidden" : ""; } catch (e) { logInfo("HOME", "ensureMount: recents hide failed", String(e)); }
      try { mount.style.setProperty("margin-top", pendingHideRecents ? "56px" : "", "important"); } catch (e) { logInfo("HOME", "ensureMount: margin-top failed", String(e)); }
    }
  }

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
      toaster.toast({ title: i18next.t("mount_crash_title"), body: i18next.t("mount_crash_warning") });
      notifyMountFailedChange();
    } else {
      setTimeout(() => { if (!mountFailed) this.setState({ crashed: false }); }, 500);
    }
  }
  render() { return this.state.crashed ? null : this.props.children; }
}

function HomeDomBridge() {
  getHostContext();
  return React.createElement(HomeBoundary, null, React.createElement(HomeShelves));
}

function registerBridgeViaStore(store: any): boolean {
  if (!store) return false;

  try {
    if (typeof store.addComponent === "function") {
      const dispose = store.addComponent(GLOBAL_COMPONENT_ID, HomeDomBridge);
      if (typeof dispose === "function") uninstallHooks.push(dispose);
      return true;
    }
  } catch {}

  try {
    if (typeof store.register === "function") {
      const dispose = store.register(GLOBAL_COMPONENT_ID, HomeDomBridge);
      if (typeof dispose === "function") uninstallHooks.push(dispose);
      return true;
    }
  } catch {}

  try {
    if (typeof store.getState === "function" && typeof store.setState === "function") {
      const state = store.getState?.();
      if (!state || typeof state !== "object") return false;

      if (Array.isArray((state as any).components)) {
        const next = (state as any).components.slice();
        next.push({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge });
        store.setState({ ...(state as any), components: next });
        uninstallHooks.push(() => {
          try {
            const s = store.getState?.();
            const arr = Array.isArray(s?.components) ? s.components.filter((x: any) => x?.id !== GLOBAL_COMPONENT_ID) : s?.components;
            store.setState({ ...(s ?? {}), components: arr });
          } catch {}
        });
        return true;
      }

      if (Array.isArray((state as any).globalComponents)) {
        const next = (state as any).globalComponents.slice();
        next.push({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge });
        store.setState({ ...(state as any), globalComponents: next });
        uninstallHooks.push(() => {
          try {
            const s = store.getState?.();
            const arr = Array.isArray(s?.globalComponents) ? s.globalComponents.filter((x: any) => x?.id !== GLOBAL_COMPONENT_ID) : s?.globalComponents;
            store.setState({ ...(s ?? {}), globalComponents: arr });
          } catch {}
        });
        return true;
      }
    }
  } catch {}

  return false;
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

  try {
    const addGlobalComponent = routerHook?.addGlobalComponent;
    if (typeof addGlobalComponent === "function") {
      let registered = false;
      try {
        const maybeDispose = addGlobalComponent(GLOBAL_COMPONENT_ID, HomeDomBridge);
        if (typeof maybeDispose === "function") removeGlobalComponent = maybeDispose;
        registered = true;
        logInfo("HOME", "global component bridge registered", { signature: "id,component" });
      } catch {}
      if (!registered) {
        try {
          const maybeDispose = addGlobalComponent(HomeDomBridge);
          if (typeof maybeDispose === "function") removeGlobalComponent = maybeDispose;
          registered = true;
          logInfo("HOME", "global component bridge registered", { signature: "component" });
        } catch {}
      }
      if (!registered) {
        try {
          const maybeDispose = addGlobalComponent({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge });
          if (typeof maybeDispose === "function") removeGlobalComponent = maybeDispose;
          registered = true;
          logInfo("HOME", "global component bridge registered", { signature: "object" });
        } catch {}
      }
      bridgeRegistered = registered;
    } else {
      logWarn("HOME", "routerHook.addGlobalComponent unavailable");
    }

    if (!bridgeRegistered && registerBridgeViaStore(routerHook?.globalComponentsState)) {
      bridgeRegistered = true;
      logInfo("HOME", "global component bridge registered", { signature: "globalComponentsState" });
    }

    if (!bridgeRegistered && registerBridgeViaStore(routerHook?.renderedComponents)) {
      bridgeRegistered = true;
      logInfo("HOME", "global component bridge registered", { signature: "renderedComponents" });
    }

    if (!bridgeRegistered && registerBridgeViaWrapper(routerHook)) {
      bridgeRegistered = true;
      logInfo("HOME", "global component bridge registered", { signature: "wrapper-patch" });
    }

    if (!bridgeRegistered && registerBridgeViaRouteHook(routerHook)) {
      bridgeRegistered = true;
      logInfo("HOME", "global component bridge registered", { signature: "route-hook" });
    }

    if (!bridgeRegistered) {
      logWarn("HOME", "all global bridge strategies failed");
    }
  } catch (error) {
    logWarn("HOME", "global component bridge setup failed", String(error));
  }

  let fallbackRoot: { unmount(): void } | null = null;
  let fallbackMountId: string | null = null;
  let fallbackRetries = 0;
  const MAX_FALLBACK_RETRIES = 6;

  const tryFallbackRender = () => {
    try {
      const { win, doc } = getHostContext();
      const existing = doc.getElementById(ROOT_ID);
      if (existing?.dataset?.deckShelvesRenderer === "react") return;

      if (!isHomeVisible()) {
        // Do NOT unmount the React tree when the home view is hidden
        // (e.g. user navigated to a game detail page or settings).
        fallbackRetries = 0;
        return;
      }

      const mount = ensureMount();
      if (!mount) {
        if (++fallbackRetries >= MAX_FALLBACK_RETRIES) {
          logWarn("HOME", "fallback: giving up after max retries", { retries: fallbackRetries });
          if (timer) { window.clearInterval(timer); timer = 0; }
          observer?.disconnect();
        }
        return;
      }
      fallbackRetries = 0; // Reset on success
      if (mount.dataset.deckShelvesRenderer === "react") return;

      if (fallbackRoot && fallbackMountId === mount.id) return;

      if (fallbackRoot) {
        try { fallbackRoot.unmount(); } catch {}
        fallbackRoot = null;
      }

      const ReactDOM = (globalThis as any).ReactDOM ?? (globalThis as any).SP_REACTDOM ?? (win as any).ReactDOM ?? (win as any).SP_REACTDOM;
      if (!ReactDOM) {
        logWarn("HOME", "fallback: ReactDOM unavailable");
        return;
      }

      const renderFn = ReactDOM.createRoot ?? ReactDOM.default?.createRoot;
      if (typeof renderFn === "function") {
        const root = renderFn.call(ReactDOM.default ?? ReactDOM, mount);
        root.render(
          React.createElement(HomeBoundary, null, React.createElement(HomeShelves))
        );
        fallbackRoot = root;
        fallbackMountId = mount.id;
        logInfo("HOME", "fallback: rendered via createRoot");
      } else if (typeof ReactDOM.render === "function") {
        ReactDOM.render(
          React.createElement(HomeBoundary, null, React.createElement(HomeShelves)),
          mount
        );
        fallbackRoot = { unmount: () => { try { ReactDOM.unmountComponentAtNode?.(mount); } catch {} } };
        fallbackMountId = mount.id;
        logInfo("HOME", "fallback: rendered via legacy render");
      }
    } catch (err) {
      logWarn("HOME", "fallback render error", String(err));
    }
  };

  const { win: hostWin, doc: hostDoc } = getHostContext();
  observer?.disconnect();
  observer = new MutationObserver(() => tryFallbackRender());
  observer.observe(hostDoc.body, { childList: true, subtree: true });

  if (timer) window.clearInterval(timer);
  timer = window.setInterval(tryFallbackRender, 2000);

  const onRouteSignal = () => tryFallbackRender();
  hostWin.addEventListener("hashchange", onRouteSignal);
  hostWin.addEventListener("popstate", onRouteSignal);
  globalThis.addEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);

  tryFallbackRender();

  logInfo("HOME", "installHomePatch complete", { bridgeRegistered });

  return {
    uninstall() {
      logInfo("HOME", "uninstalling home patch");
      try {
        removeGlobalComponent?.();
        removeGlobalComponent = null;
      } catch {}
      while (uninstallHooks.length) {
        const fn = uninstallHooks.pop();
        try { fn?.(); } catch {}
      }
      try {
        routerHook?.removeGlobalComponent?.(GLOBAL_COMPONENT_ID);
      } catch {}
      try {
        routerHook?.removeGlobalComponent?.(HomeDomBridge);
      } catch {}
      if (timer) { window.clearInterval(timer); timer = 0; }
      observer?.disconnect();
      observer = null;
      hostWin.removeEventListener("hashchange", onRouteSignal);
      hostWin.removeEventListener("popstate", onRouteSignal);
      globalThis.removeEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);
      try { fallbackRoot?.unmount(); } catch {}
      fallbackRoot = null;
      try { hostDoc.getElementById(ROOT_ID)?.remove(); } catch {}
    },
  };
}
