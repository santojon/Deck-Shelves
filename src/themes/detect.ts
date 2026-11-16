import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { call } from "../runtime/host/decky";

function getCssLoaderStyleNodes(): HTMLStyleElement[] {
  // Theme styles live in the Big Picture document, which may not be the preferred window.
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

export function cssLoaderStyleCount(): number {
  return getCssLoaderStyleNodes().length;
}

export function cssLoaderStyleTexts(): string[] {
  return getCssLoaderStyleNodes().map((n) => n.textContent || "");
}

let _styleTextCache: { text: string; ts: number } | null = null;
export function getAllStyleText(): string {
  const now = Date.now();
  if (_styleTextCache && now - _styleTextCache.ts < 2000) return _styleTextCache.text;
  const text = cssLoaderStyleTexts().join("\n");
  _styleTextCache = { text, ts: now };
  return text;
}

export function __resetThemeDetectCacheForTest(): void {
  _styleTextCache = null;
}

function liveClassToken(key: string): string | null {
  try {
    const doc = getPreferredSteamDocument();
    const map = doc ? getRuntimeClassMap(doc) : null;
    const live = (map as any)?.[key];
    return typeof live === "string" && live ? live : null;
  } catch { return null; }
}

// Theme CSS references native classes module-prefixed or raw hashed, so match both.
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
    // Theme rules usually target the hashed token; bare names are too generic.
    const tokens = Array.from(prev.classList);
    const hashed = tokens.find((t) => t.startsWith("_") && t.length > 5);
    return hashed ?? tokens[0] ?? null;
  } catch {
    return null;
  }
}

// CSS Loader exposes no frontend store, so theme names come from disk via the backend.
let _themesCache: { active: string[]; installed: number } | null = null;

// Checked by install so the disk read never runs without CSS Loader.
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
  } catch {}
}

export function getActiveCssLoaderThemes(): string[] {
  return _themesCache?.active ?? [];
}
