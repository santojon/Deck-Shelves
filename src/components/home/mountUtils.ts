// Mount discovery + anchor-resolution helpers for HomeShelves. Pure
// DOM probing — no React state, no observers, idempotent.
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../../runtime/steamHost";
import { getRuntimeClassMap } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { getSessionState } from "../../runtime/sessionState";
import { matchesSteamText, steamTextSelectors } from "../../steam/steamText";

export const ROOT_ID = "deck-shelves-home-root";

// Fallback for the native shelf-section token before the classmap warms.
const FALLBACK_SHELF_SECTION = "_282X0J4BtrSF1IXctmOe-X";

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = (seed | 0) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function collectKnownWindows(): Window[] {
  const wins: Window[] = [];
  try { wins.push(getPreferredSteamWindow()); } catch {}
  try {
    for (const d of getAllSteamDocuments()) {
      const w = d.defaultView;
      if (w && !wins.includes(w)) wins.push(w);
    }
  } catch {}
  return wins;
}

function windowIsOnHome(win: Window): boolean {
  try {
    const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
    return href.includes("/library/home");
  } catch { return false; }
}

// The Home stays mounted behind a running game; its upkeep polls skip that time.
export function homeBehindGame(): boolean {
  return getSessionState().gameRunning && !isHomeRoute();
}

export function isHomeRoute(): boolean {
  return collectKnownWindows().some(windowIsOnHome);
}

export function hasHomeDomSignals(): boolean {
  const doc = getPreferredSteamDocument();
  if (!doc) return false;
  if (doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]')) return true;
  if (doc.querySelector([...steamTextSelectors("recentGames", "aria-label", "exact"), '[class*="ReactVirtualized__Grid"][aria-label]'].join(", "))) return true;
  try {
    const token = getRuntimeClassMap(doc)?.shelfSection || FALLBACK_SHELF_SECTION;
    if (doc.querySelector(`div.${token}, [class*="${token}"]`)) return true;
  } catch (e) { logInfo("HOME", "hasHomeDomSignals: class selector failed", String(e)); }
  return false;
}

function findGamepadNavController(): any {
  return (globalThis as any).FocusNavController
    ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
}

function findGamepadNavRoot(ctrl: any): any {
  const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
  const main = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
  if (!main) return null;
  return main.Root || main.m_Root;
}

// Nav-tree facts for on-device drivers: node count + how many hold a DS card.
export function countNavTreeDsCards(): { total: number; dsCards: number } | null {
  const ctrl = findGamepadNavController();
  const root = ctrl ? findGamepadNavRoot(ctrl) : null;
  if (!root) return null;
  let total = 0;
  let dsCards = 0;
  const walk = (node: any, depth: number): void => {
    if (!node || depth > 40) return;
    total++;
    const el = node.m_element;
    if (el?.classList?.contains?.("ds-card")) dsCards++;
    for (const child of (node.m_rgChildren ?? [])) walk(child, depth + 1);
  };
  walk(root, 0);
  return { total, dsCards };
}

export function detectNavTreeApi(): { available: boolean; detail: string } {
  try {
    const ctrl = findGamepadNavController();
    if (!ctrl) return { available: false, detail: 'no FocusNavController' };
    const root = findGamepadNavRoot(ctrl);
    if (!root) return { available: false, detail: 'no GamepadUI_Full_Root tree' };
    if (!Array.isArray(root.m_rgChildren)) return { available: false, detail: 'm_rgChildren unavailable' };
    return { available: true, detail: `${root.m_rgChildren.length} root children` };
  } catch (e) {
    return { available: false, detail: String(e) };
  }
}

/* `lenient` accepts an `overflow-y: auto|scroll` panel that doesn't overflow
   yet — early on, the Home holds only the native recents row, so the strict
   test fails and the anchor fell through to the multi-child wrapper, i.e.
   INSIDE the recents block (confirmed live under native Big Art: recents then
   can't be collapsed without hiding the mount; the native hero shows through). */
/* An element inside a `display: none` subtree never lays out, so it can never
   host the mount: a previous instance's hidden native rows look like anchors
   otherwise (the recents label still sits inside them). */
function isDisplayed(el: HTMLElement): boolean {
  try {
    const doc = el.ownerDocument;
    const win = doc?.defaultView ?? getPreferredSteamWindow();
    for (let cur: HTMLElement | null = el; cur && cur !== doc.body; cur = cur.parentElement) {
      if (win.getComputedStyle(cur).display === "none") return false;
    }
    return true;
  } catch { return true; }
}

function isScrollableViewport(p: HTMLElement, lenient = false): boolean {
  if (!isDisplayed(p)) return false;
  try {
    const win = p.ownerDocument?.defaultView ?? getPreferredSteamWindow();
    const cs = win.getComputedStyle(p);
    const oy = (cs.overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll') && (lenient || p.scrollHeight > p.clientHeight);
  } catch (e) { logInfo("HOME", "resolveAnchor: getComputedStyle failed", String(e)); return false; }
}

function walkToScrollableAncestor(start: HTMLElement, body: HTMLElement, maxHops: number, lenient = false): { parent: HTMLElement; before: ChildNode | null } | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < maxHops && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === body) break;
    if (isScrollableViewport(p, lenient)) return { parent: p, before: container.nextSibling };
    container = p;
  }
  return null;
}

function walkToMultiChildAncestor(start: HTMLElement, body: HTMLElement, maxHops: number): { parent: HTMLElement; before: ChildNode | null } | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < maxHops && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === body) break;
    if (p.childElementCount > 1 && isDisplayed(p)) return { parent: p, before: container.nextSibling };
    container = p;
  }
  return null;
}

function findScrollableAnchorAfterRecents(doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  const body = doc.body;
  const candidates = Array.from(doc.querySelectorAll('[role="list"],[aria-label],[class*="ReactVirtualized__Grid"]'));
  for (const node of candidates) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`;
    if (!matchesSteamText(txt, "recentGames", "contains")) continue;
    const start = node as HTMLElement;
    const scrollable = walkToScrollableAncestor(start, body, 12) ?? walkToScrollableAncestor(start, body, 12, true);
    if (scrollable) return scrollable;
    const fallback = walkToMultiChildAncestor(start, body, 6);
    if (fallback) return fallback;
  }
  return null;
}

function chipRowAnchor(row: HTMLElement | null, doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  if (!row?.parentElement || row === doc.body || !isDisplayed(row.parentElement)) return null;
  return { parent: row.parentElement, before: row };
}

function findAnchorByChipRow(doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    if (!matchesSteamText(node.textContent || "", "homeTabs", "exact")) continue;
    let row: HTMLElement | null = node.parentElement as HTMLElement;
    while (row && row.childElementCount <= 1 && row !== doc.body) row = row.parentElement;
    const anchor = chipRowAnchor(row, doc);
    if (anchor) return anchor;
  }
  return null;
}

function findAnchorByContainer(doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  try {
    const token = getRuntimeClassMap(doc)?.shelfSection || FALLBACK_SHELF_SECTION;
    const known = doc.querySelector(`div.${token}, [class*="${token}"]`) as HTMLElement | null;
    if (known?.parentElement && isDisplayed(known.parentElement)) return { parent: known.parentElement, before: known.nextSibling };
  } catch (e) { logInfo("HOME", "findAnchorByContainer: known-token lookup failed", String(e)); }
  const containers = Array.from(doc.querySelectorAll('[class*="gamepadlibrary"],[class*="libraryhome"],[class*="LibraryHome"],[class*="BasicHomeView"],[class*="AppGridFilterContainer"],[class*="AllPagesContainer"],main,[role="main"]'));
  for (const node of containers) {
    if (node instanceof HTMLElement && isDisplayed(node)) return { parent: node, before: node.firstChild };
  }
  return null;
}

export function resolveAnchor(doc?: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  doc = doc ?? getPreferredSteamDocument();
  if (!doc) return null;
  return findScrollableAnchorAfterRecents(doc)
    ?? findAnchorByChipRow(doc)
    ?? findAnchorByContainer(doc);
}

// Holds the last mount we created so we can re-insert THE SAME node
// after Steam blows it away — keeps React's portal target stable.
let lastCreatedMount: HTMLElement | null = null;

/* Which instance owns the mount. A successor (a hot-swap) takes an existing
   mount over by stamping it, and the predecessor's later cleanup must then
   leave it alone: it used to remove any node with the mount's id. */
const INSTANCE_TOKEN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function claimMount(mount: HTMLElement): HTMLElement {
  mount.dataset.dsOwner = INSTANCE_TOKEN;
  return mount;
}

export function removeOwnMounts(docs: Iterable<Document>): void {
  for (const d of docs) {
    try {
      const mount = d.getElementById(ROOT_ID) as HTMLElement | null;
      if (mount?.dataset.dsOwner === INSTANCE_TOKEN) mount.remove();
    } catch {}
  }
}

function collectKnownDocs(): Document[] {
  const seen = new Set<Document>();
  const docs: Document[] = [];
  const push = (d: Document | null | undefined) => {
    if (d && !seen.has(d)) { seen.add(d); docs.push(d); }
  };
  push(getPreferredSteamDocument());
  for (const d of getAllSteamDocuments()) push(d);
  return docs;
}

function reattachExistingMount(docs: Document[]): HTMLElement | null {
  if (!lastCreatedMount || lastCreatedMount.isConnected) return null;
  for (const d of docs) {
    const anchor = resolveAnchor(d);
    if (!anchor || anchor.parent === d.body) continue;
    try { if (lastCreatedMount.ownerDocument !== d) d.adoptNode(lastCreatedMount); } catch {}
    anchor.parent.insertBefore(lastCreatedMount, anchor.before);
    return lastCreatedMount;
  }
  return null;
}

function createMountIn(docs: Document[]): HTMLElement | null {
  for (const d of docs) {
    const anchor = resolveAnchor(d);
    if (!anchor || anchor.parent === d.body) continue;
    const mount = d.createElement("div");
    mount.id = ROOT_ID;
    mount.style.cssText = "width:100%;display:block;position:relative;z-index:0;margin:0;padding:0;";
    anchor.parent.insertBefore(mount, anchor.before);
    lastCreatedMount = claimMount(mount);
    logInfo("HOME", "mount created", { parent: anchor.parent.tagName });
    return mount;
  }
  return null;
}

/* A mount that landed INSIDE the recents block (early multi-child anchor) also
   has a grid-bearing previous sibling, yet it is misplaced: collapsing recents
   would hide the mount with it. Only a sibling of the whole block is adjacent. */
function mountNestedInRecents(mount: HTMLElement): boolean {
  const parent = mount.parentElement;
  if (!parent || isScrollableViewport(parent, true)) return false;
  const grid = parent.querySelector('[class*="ReactVirtualized"]');
  return !!grid && !mount.contains(grid);
}

/* True when the mount sits right after the recents row (its previous sibling is
   the recents, or a wrapper containing the virtualized recents grid). */
function isRecentsAdjacent(mount: HTMLElement): boolean {
  const prev = mount.previousElementSibling as HTMLElement | null;
  if (!prev || mountNestedInRecents(mount)) return false;
  const txt = `${(prev.getAttribute?.("aria-label") || "")} ${(prev.textContent || "")}`.toLowerCase();
  if (matchesSteamText(txt, "recentGames", "contains")) return true;
  return !!prev.querySelector('[class*="ReactVirtualized"]');
}

/* The mount can be created early (before the home DOM settles), landing on the
   generic-container anchor instead of next to recents — breaking recents-hide
   and shelf position. Once the recents-adjacent anchor is available, move the
   existing mount there (a React portal follows its target, so this is safe).
   Only moves when currently misplaced, so it never thrashes. */
function maybeRepositionMount(mount: HTMLElement, doc: Document): void {
  try {
    if (isRecentsAdjacent(mount)) return;
    const anchor = findScrollableAnchorAfterRecents(doc);
    if (!anchor || anchor.parent === doc.body) return;
    if (mount.parentElement === anchor.parent && mount.nextSibling === anchor.before) return;
    anchor.parent.insertBefore(mount, anchor.before);
    logInfo("HOME", "mount repositioned to recents anchor", { parent: anchor.parent.tagName });
  } catch (e) { logInfo("HOME", "maybeRepositionMount failed", String(e)); }
}

export function findOrCreateMount(): HTMLElement | null {
  const docs = collectKnownDocs();
  for (const d of docs) {
    const existing = d.getElementById(ROOT_ID) as HTMLElement | null;
    if (existing?.isConnected) { maybeRepositionMount(existing, d); return claimMount(existing); }
  }
  return reattachExistingMount(docs) ?? createMountIn(docs);
}
