import React from "react";
import i18next from "i18next";
import { HomeShelves as HomeShelvesRaw } from "../components/HomeInject";
import { wrapHomeShelves } from "../qa/harness";
const HomeShelves = wrapHomeShelves(HomeShelvesRaw);
import { refreshSettings } from "../settingsStore";
import type { Shelf } from "../types";
import { createDeckyPlatform } from "./deckyPlatform";
import { logDiagnostic } from "./diagnostics";
import { logError, logInfo, logWarn } from "./logger";
import { setPreferredSteamWindow } from "./steamHost";
import { discoverClassMap, setRuntimeClassMap, getRuntimeClassMap } from "../core/webpackCompat";
import { toaster } from "../shims/decky-api";

const ROOT_ID = "deck-shelves-home-root";
const GLOBAL_COMPONENT_ID = "DeckShelvesHomeDomBridge";
const platform = createDeckyPlatform();

let observer: MutationObserver | null = null;
let timer = 0;
let rendering = false;
let lastRenderKey = "";
let homeHiddenLogged = false;
let noAnchorLogged = false;
let removeGlobalComponent: (() => void) | null = null;
const uninstallHooks: Array<() => void> = [];
let lastContextLogAt = 0;
let lastHostSource = "";
const rowScrollState = new Map<string, number>();

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
export function resetMountFailed(): void { mountFailed = false; mountError = null; boundaryFailureCount = 0; lastRenderKey = ""; notifyMountFailedChange(); }

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

  if (cachedRecentsEl) {
    try { cachedRecentsEl.style.visibility = hidden ? "hidden" : ""; cachedRecentsEl.style.height = hidden ? "0px" : ""; cachedRecentsEl.style.overflow = hidden ? "hidden" : ""; } catch (e) { logInfo("HOME", "applyHideRecents: style set failed", String(e)); }
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
  try {
    const { doc } = getHostContext();
    const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;

    // Always restore previously-hidden elements first (handles parent changes).
    for (const el of Array.from(hiddenHomeTabs)) {
      if (el.isConnected) setSiblingHidden(el, false);
      hiddenHomeTabs.delete(el);
    }
    if (!hidden) return;
    if (!mount) return;

    for (const el of collectHomeTabSiblings(mount)) {
      setSiblingHidden(el, true);
      hiddenHomeTabs.add(el);
    }
  } catch (e) { logInfo("HOME", "applyHideHomeTabs failed", String(e)); }
}

function findRecentsEl(doc: Document, mountEl: HTMLElement): HTMLElement | null {
  const labels = ["jogos recentes", "recent games", "recently played", "played recently", "jogados recentemente"];
  // Walk from aria-label nodes up to find the sibling of mountEl's parent
  const mountParent = mountEl.parentElement;
  if (!mountParent) return null;

  // Check mountEl.previousElementSibling first (fastest path)
  const prev = mountEl.previousElementSibling as HTMLElement | null;
  if (prev) {
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
    if (el.parentElement === mountParent && el !== mountEl) return el;
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

function clearMount() {
  const { doc } = getHostContext();
  doc.getElementById(ROOT_ID)?.remove();
}

function buildImageCandidates(appid: number, portrait?: string, hero?: string): string[] {
  const candidates = [
    portrait,
    hero,
    `/customimages/${appid}p.png`,
    `/customimages/${appid}p.jpg`,
    `/assets/${appid}/library_600x900.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const seen = new Set<string>();
  return candidates.filter((url) => {
    const base = url.split("?")[0];
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });
}

function injectHomeStyles(doc: Document) {
  const STYLE_ID = "deck-shelves-home-style";
  if (doc.getElementById(STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      overflow: visible;
      margin-top: -32px;
    }
    #${ROOT_ID} .deck-shelves-section { margin: 0 0 8px 0; }
    #${ROOT_ID} .deck-shelves-header {
      color: #ffffff;
      font-size: 22px;
      font-weight: 800;
      line-height: 1.2;
      margin: 0 0 6px 0;
      letter-spacing: 0;
      text-transform: none;
    }
    #${ROOT_ID} .deck-shelves-grid {
      box-sizing: border-box;
      direction: ltr;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #${ROOT_ID} .deck-shelves-grid::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
    #${ROOT_ID} .deck-shelves-inner {
      display: flex;
      align-items: stretch;
      min-width: max-content;
      gap: 0;
      overflow: visible;
      position: relative;
    }
    #${ROOT_ID} .deck-shelves-item {
      width: calc(var(--ds-native-card-w, 133px) + 12px);
      min-width: calc(var(--ds-native-card-w, 133px) + 12px);
      position: relative;
      padding: 0;
      border: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    #${ROOT_ID} .deck-shelves-item:focus {
      outline: none;
    }
    #${ROOT_ID} .deck-shelves-card {
      width: var(--ds-native-card-w, 133px);
      height: calc(var(--ds-native-card-h, 200px) + 51.5px);
      border-radius: 2px;
      overflow: hidden;
      background: rgba(3, 10, 30, 0.92);
      border: none;
      transition: transform 80ms ease;
    }
    #${ROOT_ID} .deck-shelves-item:focus .deck-shelves-card,
    #${ROOT_ID} .deck-shelves-item:hover .deck-shelves-card {
      transform: scale(1.06);
    }
    #${ROOT_ID} .deck-shelves-art {
      width: 100%;
      height: var(--ds-native-card-h, 200px);
      object-fit: cover;
      display: block;
      background: #111827;
    }
    #${ROOT_ID} .deck-shelves-title {
      color: #f8fafc;
      font-size: 13px;
      line-height: 1.2;
      font-weight: 700;
      padding: 10px 10px 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      transform: translateY(3px);
      transition: opacity .14s ease, transform .14s ease;
    }
    #${ROOT_ID} .deck-shelves-item.is-selected .deck-shelves-title,
    #${ROOT_ID} .deck-shelves-item:focus .deck-shelves-title,
    #${ROOT_ID} .deck-shelves-item:hover .deck-shelves-title {
      opacity: 1;
      transform: translateY(0);
    }
    #${ROOT_ID} .deck-shelves-more {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
      font-size: 20px;
      font-weight: 800;
      background: linear-gradient(180deg, rgba(15,23,42,.55), rgba(2,6,23,.9));
    }
  `;
  doc.head.appendChild(style);
}

function createShelfCard(
  app: { appid: number; name: string; portrait?: string; hero?: string },
  onActivate: () => void,
  options?: { isMore?: boolean },
): HTMLButtonElement {
  const { doc } = getHostContext();
  injectHomeStyles(doc);

  const card = doc.createElement("button");
  card.type = "button";
  card.className = "deck-shelves-item Panel Focusable";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", app.name);

  const img = doc.createElement("img");
  const imageCandidates = buildImageCandidates(app.appid, app.portrait, app.hero);
  img.src = imageCandidates[0] ?? "";
  img.alt = app.name;
  img.className = "deck-shelves-art";
  let imageIdx = 1;
  img.onerror = () => {
    if (imageIdx >= imageCandidates.length) return;
    img.src = imageCandidates[imageIdx++] ?? "";
  };

  const cardInner = doc.createElement("div");
  cardInner.className = "deck-shelves-card _1HIFNGSxh4-jOhPiDynR4C Panel";

  const artWrap = doc.createElement("div");
  artWrap.style.height = "199.5px";
  artWrap.style.position = "relative";
  artWrap.style.overflow = "hidden";

  const label = doc.createElement("div");
  label.className = "deck-shelves-title";
  label.textContent = app.name;

  if (options?.isMore) {
    img.remove();
    const more = doc.createElement("div");
    more.className = "deck-shelves-more";
    more.textContent = "→";
    more.style.width = "100%";
    more.style.height = "100%";
    artWrap.appendChild(more);
  } else {
    artWrap.appendChild(img);
  }

  cardInner.appendChild(artWrap);
  cardInner.appendChild(label);
  card.appendChild(cardInner);
  card.addEventListener("click", onActivate);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const row = card.closest(".deck-shelves-inner");
      if (!row) return;
      const cards = Array.from(row.querySelectorAll<HTMLButtonElement>(".deck-shelves-item"));
      const idx = cards.indexOf(card);
      if (idx < 0) return;
      const nextIdx = event.key === "ArrowRight" ? Math.min(cards.length - 1, idx + 1) : Math.max(0, idx - 1);
      const next = cards[nextIdx];
      if (!next || next === card) return;
      event.preventDefault();
      next.focus();
      next.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  });
  card.addEventListener("focus", () => {
    const row = card.closest(".deck-shelves-inner");
    if (!row) return;
    for (const item of Array.from(row.querySelectorAll<HTMLButtonElement>(".deck-shelves-item"))) {
      item.classList.toggle("is-selected", item === card);
    }
  });
  return card;
}

async function buildShelfNode(shelf: Shelf): Promise<HTMLElement | null> {
  const ids = await platform.resolveShelfAppIds(shelf.source, shelf.limit, (shelf as any).sort);
  if (!ids.length) {
    logWarn("HOME", "shelf resolved zero apps", { shelfId: shelf.id, title: shelf.title, source: shelf.source });
    logDiagnostic("warn", "Shelf resolved zero apps", JSON.stringify({ shelfId: shelf.id, title: shelf.title }));
    return null;
  }

  logInfo("HOME", "shelf resolved apps", { shelfId: shelf.id, title: shelf.title, count: ids.length, sample: ids.slice(0, 8) });

  const { doc } = getHostContext();

  const metas = await Promise.all(ids.slice(0, Math.min(shelf.limit, 12)).map(async (appid) => {
    try {
      const meta = await platform.getAppMeta(appid);
      return {
        appid,
        name: meta.name,
        portrait: meta.portraitUrl,
        hero: meta.heroUrl,
      };
    } catch {
      return {
        appid,
        name: `App ${appid}`,
      };
    }
  }));

  const section = doc.createElement("div");
  section.className = "deck-shelves-section Panel";

  const header = doc.createElement("div");
  header.style.margin = "0 0 8px";

  const title = doc.createElement("h3");
  title.className = "deck-shelves-header";
  title.textContent = shelf.title;
  title.style.margin = "0";

  header.appendChild(title);

  const row = doc.createElement("div");
  row.className = "deck-shelves-grid ReactVirtualized__Grid _3MdH5Czolhh5rC_nofUlcQ";
  row.setAttribute("aria-label", shelf.title || "Deck Shelves");
  row.setAttribute("aria-readonly", "true");
  row.setAttribute("role", "generic");
  row.style.width = "100%";

  const inner = doc.createElement("div");
  inner.className = "deck-shelves-inner ReactVirtualized__Grid__innerScrollContainer";
  inner.setAttribute("role", "list");
  inner.setAttribute("aria-label", shelf.title || "Deck Shelves");
  inner.setAttribute("data-shelf-id", shelf.id);

  for (const app of metas) {
    const listItem = doc.createElement("div");
    listItem.setAttribute("role", "listitem");
    listItem.style.cssText = "position:relative;flex-shrink:0;display:inline-block;";
    listItem.appendChild(createShelfCard(app, () => platform.navigateToApp(app.appid)));
    inner.appendChild(listItem);
  }

  const moreListItem = doc.createElement("div");
  moreListItem.setAttribute("role", "listitem");
  moreListItem.style.cssText = "position:relative;flex-shrink:0;display:inline-block;";
  moreListItem.appendChild(createShelfCard(
    { appid: -1, name: i18next.t("view_more") },
    () => platform.navigateToShelfSource?.(shelf.source, shelf.title),
    { isMore: true },
  ));
  inner.appendChild(moreListItem);

  const first = inner.querySelector<HTMLButtonElement>(".deck-shelves-item");
  if (first) first.classList.add("is-selected");

  const prevScroll = rowScrollState.get(shelf.id) ?? 0;
  if (prevScroll > 0) row.scrollLeft = prevScroll;
  row.addEventListener("scroll", () => {
    rowScrollState.set(shelf.id, row.scrollLeft);
  }, { passive: true });

  row.appendChild(inner);
  section.appendChild(header);
  section.appendChild(row);
  return section;
}

async function renderHomeShelves() {
  if (rendering) return;
  rendering = true;
  try {
    if (!isHomeVisible()) {
      if (!homeHiddenLogged) {
        homeHiddenLogged = true;
        logInfo("HOME", "home not visible yet", getContextSnapshot());
      }
      clearMount();
      lastRenderKey = "";
      return;
    }
    homeHiddenLogged = false;

    if (document.readyState !== "complete") {
      const now = Date.now();
      if (now - lastContextLogAt > 5000) {
        lastContextLogAt = now;
        logInfo("HOME", "waiting for full document readiness", getContextSnapshot());
      }
      return;
    }

    // Don't attempt mount if crash protection is engaged
    if (mountFailed) return;

    const mount = ensureMount();
    if (!mount) return;

    // Apply hideRecents setting immediately after a successful mount
    try {
      const settingsForHide = await refreshSettings();
      applyHideRecents(settingsForHide.hideRecents === true);
    } catch {}

    // Discover obfuscated/webpack-hashed class tokens and inject a runtime map so
    // the rest of the plugin can rely on deterministic selectors — classes are
    // discovered at runtime and made available to injected code before mounting UI.
    try {
      const hostDoc = getHostContext().doc;
      // Always run discovery so new keys (nativeShelf, nativeShelfRow, etc.) get populated
      // even when a bootstrap classmap already exists in localStorage. Existing values win
      // on conflicts (bootstrap tokens are more precise); discovered fills in missing keys.
      const existing = getRuntimeClassMap(hostDoc as Document) ?? {};
      const discovered = discoverClassMap(hostDoc as Document) ?? {};
      const merged: Record<string, string> = { ...discovered };
      for (const [k, v] of Object.entries(existing)) {
        if (v) merged[k] = v;
      }
      setRuntimeClassMap(hostDoc as Document, merged);
      logInfo("HOME", "runtime class map merged", merged);
    } catch (e) {
      logWarn("HOME", "classmap discovery failed", String(e));
    }
    if (mount.dataset.deckShelvesRenderer === "react") {
      return;
    }

    const settings = await refreshSettings();
    const shelves = (settings.shelves ?? []).filter((s) => s.enabled && !s.hidden);
    const renderKey = JSON.stringify({
      enabled: settings.enabled,
      shelves: shelves.map((s) => ({ id: s.id, title: s.title, source: s.source, limit: s.limit })),
    });

    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    mount.innerHTML = "";
    if (!settings.enabled || !shelves.length) {
      mount.style.display = "none";
      return;
    }
    mount.style.display = "block";

    const nodes = await Promise.all(shelves.map((s) => buildShelfNode(s)));
    let rendered = 0;
    for (const node of nodes) {
      if (!node) continue;
      mount.appendChild(node);
      rendered += 1;
    }

    if (!rendered) {
      mount.style.display = "none";
    }

    logInfo("HOME", "dom shelves rendered", { configured: shelves.length, rendered });
    logDiagnostic("info", "Home shelves rendered", JSON.stringify({ configured: shelves.length, rendered }));
  } catch (error) {
    logError("HOME", "dom render failed", String(error));
    logDiagnostic("error", "Home render failed", String(error));
  } finally {
    rendering = false;
  }
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
        if (fallbackRoot) {
          fallbackRoot.unmount();
          fallbackRoot = null;
          fallbackMountId = null;
        }
        fallbackRetries = 0; // Reset counter when home not visible
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
