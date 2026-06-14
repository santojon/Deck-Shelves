import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { getRuntimeClassMap } from "./webpackCompat";

// Fallback for the heroInner token if the runtime classmap hasn't been
// populated yet — same value as `classmap.json` ships with.
const FALLBACK_HERO_INNER = "_30D-80Lg-Luy-KxOumBlaY";

function getCssLoaderStyleNodes(): HTMLStyleElement[] {
  // SteamOS 3.9: CSS Loader theme styles live in the BigPicture document's
  // <head>, but `preferredSteamWindow` may currently point at the
  // SharedJSContext (whose document has no theme styles). Sweep every known
  // Steam doc — preferred first for 3.7 parity — so ArtHero / theme
  // detection doesn't silently flip to false when preferred drifts.
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

export function isArtHeroActive(): boolean {
  let heroToken = FALLBACK_HERO_INNER;
  try {
    const doc = getPreferredSteamDocument();
    const map = doc ? getRuntimeClassMap(doc) : null;
    if (map?.heroInner && typeof map.heroInner === "string") heroToken = map.heroInner;
  } catch {}
  const nodes = getCssLoaderStyleNodes();
  for (const node of nodes) {
    try {
      const text = node.textContent || "";
      if (text.includes(heroToken) && /mask-image/i.test(text)) return true;
    } catch {}
  }
  return false;
}

// Aggregated CSS Loader style text — cached briefly so multiple `is*Active`
// callers in the same render pass don't each rebuild the concatenated text.
let _styleTextCache: { text: string; ts: number } | null = null;
function getAllStyleText(): string {
  const now = Date.now();
  if (_styleTextCache && now - _styleTextCache.ts < 2000) return _styleTextCache.text;
  const text = getCssLoaderStyleNodes().map((n) => n.textContent || "").join("\n");
  _styleTextCache = { text, ts: now };
  return text;
}

// Theme CSS references native classes in two forms — module-prefixed
// (gamepadhomerecentgames_RecentGames...) or raw hashed (_282X0...).
// Pair the live runtime token with the module signature so we match both.
function tokensForKey(key: string, fallback: string): string[] {
  const out = new Set<string>([fallback]);
  try {
    const doc = getPreferredSteamDocument();
    const map = doc ? getRuntimeClassMap(doc) : null;
    const live = (map as any)?.[key];
    if (typeof live === "string" && live) out.add(live);
  } catch {}
  return Array.from(out);
}

function matchesAny(text: string, tokens: string[], suffixRegex: string): boolean {
  for (const t of tokens) {
    const esc = t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const re = new RegExp(esc + "[\\w-]*[^}]*" + suffixRegex, "i");
    if (re.test(text)) return true;
  }
  return false;
}

export function isNoHeroGradientActive(): boolean {
  const text = getAllStyleText();
  const rootTokens = tokensForKey("heroRoot", "gamepadhomerecentgames_RecentGamesBackgroundContainer");
  const innerTokens = tokensForKey("heroInner", "gamepadhomerecentgames_RecentGamesBackgroundImages");
  const bgTokens = ["gamepadhomerecentgames_RecentGamesBackground"];
  return matchesAny(text, rootTokens, "(?:-webkit-)?mask-image\\s*:\\s*none")
    || matchesAny(text, innerTokens, "(?:-webkit-)?mask-image\\s*:\\s*none")
    || matchesAny(text, bgTokens, "(?:-webkit-)?mask-image\\s*:\\s*none")
    || matchesAny(text, bgTokens, "filter\\s*:\\s*brightness\\(\\s*100");
}

export function isHeroFullscreenActive(): boolean {
  const text = getAllStyleText();
  const sectionTokens = tokensForKey("shelfSection", "gamepadhomerecentgames_RecentGamesInnerContainer");
  const rootTokens = tokensForKey("heroRoot", "gamepadhomerecentgames_RecentGamesBackgroundContainer");
  const innerTokens = tokensForKey("heroInner", "gamepadhomerecentgames_RecentGamesBackgroundImages");
  return matchesAny(text, sectionTokens, "height\\s*:\\s*100vh")
    || matchesAny(text, rootTokens, "height\\s*:\\s*100vh")
    || matchesAny(text, innerTokens, "height\\s*:\\s*100vh");
}

export function isFocusRoundCompatActive(): boolean {
  const text = getAllStyleText();
  return /appportrait_blinker_[\w-]*flangrande/i.test(text)
    || /focusring_blinker_[\w-]*flangrande/i.test(text);
}

export function isTiltedHomeActive(): boolean {
  const text = getAllStyleText();
  return /--ren-tilt-angle\s*:/i.test(text);
}

export function getTiltedHomeMode(): { method: "skew" | "3d"; direction: "one-way" | "opposites" } | null {
  if (!isTiltedHomeActive()) return null;
  const text = getAllStyleText();
  // Method: 3d if any tilt rule combines perspective+rotateY with the
  // --ren-tilt-angle var; otherwise skew (the default / most common
  // installed variant uses skew()).
  const method: "skew" | "3d" =
    /transform\s*:[^;}]*rotateY[^;}]*--ren-tilt-angle/i.test(text)
    || /transform\s*:[^;}]*perspective\([^)]*\)[^;}]*--ren-tilt-angle/i.test(text)
      ? "3d"
      : "skew";
  // Direction: opposites mode injects a sibling-after-focused override
  // (`> div.gpfocuswithin ~ div`) somewhere in the chain. one-way mode
  // has no such override — every tile uses the same tilt direction.
  const direction: "one-way" | "opposites" =
    />\s*div\.gpfocuswithin\s*~\s*div/i.test(text) ? "opposites" : "one-way";
  return { method, direction };
}

export function getTiltedHomeConfig(): {
  tiltAngle: string;
  imageZoom: string;
  mostRecentOffset: string;
  viewMoreOffset: string;
  viewMoreFocusScale: string;
} | null {
  if (!isTiltedHomeActive()) return null;
  try {
    const doc = getPreferredSteamDocument();
    const root = doc?.documentElement;
    if (!root) return null;
    const cs = (doc?.defaultView ?? window).getComputedStyle(root);
    return {
      tiltAngle: cs.getPropertyValue("--ren-tilt-angle").trim() || "-5deg",
      imageZoom: cs.getPropertyValue("--ren-image-zoom").trim() || "1.15",
      mostRecentOffset: cs.getPropertyValue("--ren-most-recent-offset").trim() || "2%",
      viewMoreOffset: cs.getPropertyValue("--ren-view-more-offset").trim() || "-7%",
      viewMoreFocusScale: cs.getPropertyValue("--ren-view-more-focus-scale").trim() || "0.88",
    };
  } catch {
    return null;
  }
}

export function isNoHomeTextActive(): boolean {
  const text = getAllStyleText();
  const labelTokens = tokensForKey("nativeCarouselGameLabel", "basicgamecarousel_CarouselGameLabel");
  // Also include the observed hashed token directly as a safety net for
  // builds where the classmap key isn't populated yet.
  labelTokens.push("_3CKjiR7-fuBPyKZKpPI6UZ");
  return matchesAny(text, labelTokens, "visibility\\s*:\\s*hidden");
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
