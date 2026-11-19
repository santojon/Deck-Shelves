import { logInfo } from "./logger";
import { setPreferredSteamWindow } from "./steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { steamTextSelectors } from "../steam/steamText";

export const ROOT_ID = "deck-shelves-home-root";

let lastHostSource = "";

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

export function shelfSectionSelector(doc: Document): string {
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

export function getHostContext() {
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

export function getContextSnapshot() {
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

export function hrefIsHomeLike(href: string): boolean {
  if (href.includes("library/home") || href.includes("#library/home")) return true;
  return href.includes("/library") && !href.includes("/library/app/") && !href.includes("/library/collections");
}

// The desktop client shares the Home URL and DOM shape; only this body class tells them apart.
export function isDesktopUiActive(doc: Document): boolean {
  try { return !!doc.body?.classList?.contains("DesktopUI"); } catch { return false; }
}

export function isHomeVisible(): boolean {
  const { win, doc } = getHostContext();
  if (isDesktopUiActive(doc)) return false;
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
  if (hrefIsHomeLike(href)) return true;
  if (safeMatch(doc, LIBRARY_HOME_QS)) return true;
  if (safeMatch(doc, recentsQs())) return true;
  return safeMatch(doc, shelfSectionSelector(doc));
}
