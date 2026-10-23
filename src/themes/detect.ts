import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { call } from "../runtime/host/decky";

/* Shared detection primitives for the theme adapters: the injected CSS Loader
   style text, token matching against live class names, and the active theme
   names from disk. Theme-specific detectors live in ./adapters/*. */

function getCssLoaderStyleNodes(): HTMLStyleElement[] {
  /* SteamOS 3.9: CSS Loader theme styles live in the BigPicture document's
     <head>, but `preferredSteamWindow` may currently point at the
     SharedJSContext (whose document has no theme styles). Sweep every known
     Steam doc — preferred first for 3.7 parity — so theme detection doesn't
     silently flip to false when preferred drifts. */
  const out: HTMLStyleElement[] = [];
  const seen = new Set<Document>();
  const pushFrom = (d: Document | null | undefined) => {
    if (!d || seen.has(d)) return;
    seen.add(d);
    try { out.push(...Array.from(d.querySelectorAll<HTMLStyleElement>("style.css-loader-style"))); } catch {}
  };
  try { pushFrom(getPreferredSteamDocument()); } catch {}
  try { for (const d of getAllSteamDocuments()) pushFrom(d); } catch {}
  return out;
}

export function isCssLoaderActive(): boolean {
  return getCssLoaderStyleNodes().length > 0;
}

/** Number of CSS Loader style blocks injected across the Steam documents — a
    signal that something is active even when no known theme matches. */
export function cssLoaderStyleCount(): number {
  return getCssLoaderStyleNodes().length;
}

/** Every injected style node's text, for detectors that need to inspect a node at a time. */
export function cssLoaderStyleTexts(): string[] {
  return getCssLoaderStyleNodes().map((n) => n.textContent || "");
}

// Aggregated CSS Loader style text — cached briefly so multiple detectors in
// the same pass don't each rebuild the concatenated text.
let _styleTextCache: { text: string; ts: number } | null = null;
export function getAllStyleText(): string {
  const now = Date.now();
  if (_styleTextCache && now - _styleTextCache.ts < 2000) return _styleTextCache.text;
  const text = cssLoaderStyleTexts().join("\n");
  _styleTextCache = { text, ts: now };
  return text;
}

// Test-only reset — keeps vitest cases isolated from the short-lived cache.
export function __resetThemeDetectCacheForTest(): void {
  _styleTextCache = null;
}

/** The live runtime class token for a classmap key, or null when the map has none yet. */
function liveClassToken(key: string): string | null {
  try {
    const doc = getPreferredSteamDocument();
    const map = doc ? getRuntimeClassMap(doc) : null;
    const live = (map as any)?.[key];
    return typeof live === "string" && live ? live : null;
  } catch { return null; }
}

// Theme CSS references native classes in two forms — module-prefixed
// (gamepadhomerecentgames_RecentGames...) or raw hashed (_282X0...).
// Pair the live runtime token with the module signature so we match both.
export function tokensForKey(key: string, fallback: string): string[] {
  const out = new Set<string>([fallback]);
  const live = liveClassToken(key);
  if (live) out.add(live);
  return Array.from(out);
}

export function matchesAny(text: string, tokens: string[], suffixRegex: string): boolean {
  for (const t of tokens) {
    const esc = t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const re = new RegExp(esc + "[\\w-]*[^}]*" + suffixRegex, "i");
    if (re.test(text)) return true;
  }
  return false;
}

/** A computed custom property on <html>, trimmed ("" when unset). */
export function rootVar(doc: Document, name: string): string {
  try {
    const view = doc.defaultView ?? window;
    return view.getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
  } catch { return ""; }
}

export function getNativeRecentsClassName(mountEl: HTMLElement): string | null {
  try {
    const prev = mountEl.previousElementSibling as HTMLElement | null;
    if (!prev) return null;
    // Prefer the first hashed token (starts with `_`) since theme rules
    // typically target that — bare "Panel"/"Focusable" are too generic.
    const tokens = Array.from(prev.classList);
    const hashed = tokens.find((t) => t.startsWith("_") && t.length > 5);
    return hashed ?? tokens[0] ?? null;
  } catch {
    return null;
  }
}

// --- Actual theme names (from the Python backend) ---
/* The injected style nodes carry only per-block UUID ids and CSS Loader exposes
   no frontend store, so the actual active theme names come from disk via the
   backend (reads each theme folder's theme.json + config_USER.json). Fetched on
   demand and gated by `isCssLoaderInstalled()` so a user without CSS Loader never
   hits the backend; fail-soft keeps the prior cache on error. */
let _themesCache: { active: string[]; installed: number } | null = null;

/* CSS Loader (SDH-CssLoader) present in the Decky plugin list — the gate for the
   backend theme read. Checked by INSTALL (not just active styles) so the disk
   read never runs on a Deck without CSS Loader. Self-contained (reads the loader
   globals directly) to stay free of an integrations import. */
function isCssLoaderInstalled(): boolean {
  try {
    const g: any = globalThis as any;
    const loader = g.DeckyPluginLoader ?? g.deckyPluginLoader
      ?? (typeof window !== "undefined" ? (window as any).DeckyPluginLoader : null);
    const raw = loader?.plugins ?? loader?.pluginList;
    const arr: any[] = raw instanceof Map ? Array.from(raw.values()) : (Array.isArray(raw) ? raw : []);
    return arr.some((p: any) => typeof p?.name === "string" && p.name.toLowerCase() === "css loader");
  } catch { return false; }
}

export async function refreshCssLoaderThemes(): Promise<void> {
  if (!isCssLoaderInstalled()) { _themesCache = { active: [], installed: 0 }; return; }
  try {
    const res = await call<[], { active?: unknown; installed?: unknown }>("get_css_loader_themes");
    const active = Array.isArray(res?.active) ? res.active.filter((x): x is string => typeof x === "string") : [];
    const installed = typeof res?.installed === "number" ? res.installed : 0;
    _themesCache = { active, installed };
  } catch { /* keep the prior cache (fail-soft) */ }
}

export function getActiveCssLoaderThemes(): string[] {
  return _themesCache?.active ?? [];
}
