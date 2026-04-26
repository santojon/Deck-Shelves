import { getPreferredSteamDocument } from "../runtime/steamHost";

/**
 * Lightweight detection helpers for CSS Loader + the ArtHero theme family.
 *
 * CSS Loader injects every theme rule under `<style class="css-loader-style">`
 * tags (one per theme). Each tag carries a `data-name`/`data-id` attribute
 * with the theme name; we read those to know which themes are active without
 * needing CSS Loader's own JS API.
 *
 * Used by:
 *  - `HeroBackground` to skip rendering when the active theme paints its own
 *    hero image on the recents slot (avoids double zoom/blur animations).
 *  - `HomeInject` to flag the first DS shelf with `data-ds-recents-slot` and
 *    the native recents wrapper class so theme rules can target it as if it
 *    were the native recents element.
 */

const ART_HERO_PATTERN = /art\s*hero|arthero/i;

function getCssLoaderStyleNodes(): HTMLStyleElement[] {
  try {
    const doc = getPreferredSteamDocument();
    if (!doc) return [];
    return Array.from(doc.querySelectorAll<HTMLStyleElement>("style.css-loader-style"));
  } catch {
    return [];
  }
}

/** Returns true when at least one CSS Loader theme is active. */
export function isCssLoaderActive(): boolean {
  return getCssLoaderStyleNodes().length > 0;
}

/**
 * Returns true when any active CSS Loader theme matches the ArtHero family
 * (ArtHero, ArtHero Dark, ArtHero Alt, etc.). The match is case-insensitive
 * and tolerates the optional space between "Art" and "Hero". Falls back to
 * scanning the style content for the theme name when the data attributes
 * are missing.
 */
export function isArtHeroActive(): boolean {
  const nodes = getCssLoaderStyleNodes();
  for (const node of nodes) {
    try {
      const name = node.getAttribute("data-name") || node.getAttribute("data-id") || "";
      if (ART_HERO_PATTERN.test(name)) return true;
    } catch {}
  }
  // Fallback: scan textContent for a theme-name comment when attributes are
  // absent (some CSS Loader builds inline the name as a comment).
  for (const node of nodes) {
    try {
      const text = node.textContent || "";
      if (ART_HERO_PATTERN.test(text)) return true;
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
