import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { getRuntimeClassMap } from "./webpackCompat";

/**
 * Lightweight detection helpers for CSS Loader + the ArtHero theme family.
 *
 * CSS Loader injects every theme rule under `<style class="css-loader-style">`
 * tags. On most builds the tags don't carry a `data-name`/`data-id` attribute
 * (only `id=<UUID>`), and ArtHero's CSS doesn't reference the string "ArtHero"
 * anywhere — so name-based detection is unreliable. Instead we detect ArtHero
 * by its **structural signature**: it's the only theme that styles the native
 * hero-inner element (`heroInner` in our classmap) with a `mask-image` rule.
 *
 * Used by:
 *  - `HeroBackground` to skip rendering when the active theme paints its own
 *    hero image on the recents slot (avoids double zoom/blur animations).
 *  - `HomeInject` to flag the first DS shelf with `data-ds-recents-slot` and
 *    the native recents wrapper class so theme rules can target it as if it
 *    were the native recents element.
 */

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

/** Returns true when at least one CSS Loader theme is active. */
export function isCssLoaderActive(): boolean {
  return getCssLoaderStyleNodes().length > 0;
}

/**
 * Returns true when an ArtHero-family theme is active (ArtHero, ArtHero Dark,
 * ArtHero Alt, derivatives). Detection is structural rather than name-based:
 * ArtHero is the only theme that injects a CSS rule combining the native
 * hero-inner class with a `mask-image` declaration. Internal Steam updates
 * that rename `heroInner` are tracked via the runtime classmap, so a single
 * repository edit (in `classmap.json`) is enough to keep detection working.
 */
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

/**
 * Returns the class name of the native recents sibling (the element that sits
 * immediately before our mount in the DOM). Used to promote our first shelf
 * into the same selector space as the native recents block so themes that
 * style the recents wrapper also style our shelf when recents are hidden.
 */
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
