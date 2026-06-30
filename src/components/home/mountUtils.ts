// Mount discovery + anchor-resolution helpers for HomeShelves. Pure
// DOM probing — no React state, no observers, idempotent.
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../../runtime/steamHost";
import { getRuntimeClassMap } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";

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

export function isHomeRoute(): boolean {
  return collectKnownWindows().some(windowIsOnHome);
}

export function hasHomeDomSignals(): boolean {
  const doc = getPreferredSteamDocument();
  if (!doc) return false;
  if (doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]')) return true;
  if (doc.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]')) return true;
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

const RECENT_LABELS = ["jogos recentes", "recent games", "recently played", "jogados recentemente"];
const CHIP_LABELS = ["what's new", "friends", "recommended", "novidades", "amigos", "recomendados"];

function isScrollableViewport(p: HTMLElement): boolean {
  try {
    const win = p.ownerDocument?.defaultView ?? getPreferredSteamWindow();
    const cs = win.getComputedStyle(p);
    const oy = (cs.overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight;
  } catch (e) { logInfo("HOME", "resolveAnchor: getComputedStyle failed", String(e)); return false; }
}

function walkToScrollableAncestor(start: HTMLElement, body: HTMLElement, maxHops: number): { parent: HTMLElement; before: ChildNode | null } | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < maxHops && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === body) break;
    if (isScrollableViewport(p)) return { parent: p, before: container.nextSibling };
    container = p;
  }
  return null;
}

function walkToMultiChildAncestor(start: HTMLElement, body: HTMLElement, maxHops: number): { parent: HTMLElement; before: ChildNode | null } | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < maxHops && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === body) break;
    if (p.childElementCount > 1) return { parent: p, before: container.nextSibling };
    container = p;
  }
  return null;
}

function findScrollableAnchorAfterRecents(doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  const body = doc.body;
  const candidates = Array.from(doc.querySelectorAll('[role="list"],[aria-label],[class*="ReactVirtualized__Grid"]'));
  for (const node of candidates) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`.toLowerCase();
    if (!RECENT_LABELS.some((l) => txt.includes(l))) continue;
    const start = node as HTMLElement;
    const scrollable = walkToScrollableAncestor(start, body, 12);
    if (scrollable) return scrollable;
    const fallback = walkToMultiChildAncestor(start, body, 6);
    if (fallback) return fallback;
  }
  return null;
}

function findAnchorByChipRow(doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!CHIP_LABELS.includes(text)) continue;
    let row: HTMLElement | null = node.parentElement as HTMLElement;
    while (row && row.childElementCount <= 1 && row !== doc.body) row = row.parentElement;
    if (row?.parentElement && row !== doc.body) return { parent: row.parentElement, before: row };
  }
  return null;
}

function findAnchorByContainer(doc: Document): { parent: HTMLElement; before: ChildNode | null } | null {
  const containers = Array.from(doc.querySelectorAll('[class*="gamepadlibrary"],[class*="libraryhome"],[class*="BasicHomeView"],main,[role="main"]'));
  for (const node of containers) {
    if (node instanceof HTMLElement) return { parent: node, before: node.firstChild };
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
    lastCreatedMount = mount;
    logInfo("HOME", "mount created", { parent: anchor.parent.tagName });
    return mount;
  }
  return null;
}

export function findOrCreateMount(): HTMLElement | null {
  const docs = collectKnownDocs();
  for (const d of docs) {
    const existing = d.getElementById(ROOT_ID) as HTMLElement | null;
    if (existing?.isConnected) return existing;
  }
  return reattachExistingMount(docs) ?? createMountIn(docs);
}
