/**
 * Centralised Steam asset URL provider.
 *
 * Steam serves library art two ways:
 *
 *   • `steamloopback.host` — the local on-disk cache the client populates as
 *     it browses the library. Loads in 3-9 ms with no network. Needs the
 *     `?c=<local_cache_version>` cache buster Steam appends so the loopback
 *     server matches its file to the requested version.
 *   • Public CDNs — `shared.cloudflare.steamstatic.com`, `cdn.akamai.steamstatic.com`,
 *     etc. Always available but pays the network round trip (200-500 ms cold).
 *
 * Every getter in this file returns a deterministic priority list (loopback
 * first, then `/customimages` for user overrides, then CDN) so callers can
 * walk the list via `<img onError>` or pre-warm via
 * `firstCacheableUrl` + `warmCacheBackground`. Hero / portrait / landscape /
 * logo / icon all use the same convention.
 *
 * Logo and icon are exported even though no current feature consumes them —
 * they're here as primitives so a future spine layout, list view, or context-
 * menu enrichment can reuse the same fallback chain.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOOPBACK_ORIGIN = "https://steamloopback.host";
const STEAMSTATIC_ORIGIN = "https://shared.cloudflare.steamstatic.com";
const AKAMAI_ORIGIN = "https://cdn.akamai.steamstatic.com";
const STEAMCOMMUNITY_ORIGIN = "https://cdn.akamai.steamstatic.com/steamcommunity/public/images";

// ──────────────────────────────────────────────────────────────────────────
// App overview helpers
// ──────────────────────────────────────────────────────────────────────────

type SteamAppOverview = {
  appid?: number;
  local_cache_version?: string | number;
  icon_hash?: string;
  library_capsule_filename?: string;
  header_filename?: string;
  rt_store_asset_mtime?: number;
};

function getOverview(appid: number): SteamAppOverview | null {
  try {
    const store: any = (globalThis as any).appStore;
    return store?.GetAppOverviewByAppID?.(appid) ?? null;
  } catch { return null; }
}

function getCacheVersion(appid: number, overview?: SteamAppOverview | null): string | null {
  const ov = overview ?? getOverview(appid);
  const v = ov?.local_cache_version;
  if (typeof v === "string" && v) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Generic URL builders
// ──────────────────────────────────────────────────────────────────────────

/** Returns `https://steamloopback.host/assets/<appid>/<file>?c=<version>` —
 *  or the same URL without the `?c=` suffix when no cache buster is known.
 *  Public so callers that already have an overview can avoid the extra
 *  appStore round trip. */
export function buildLoopbackUrl(appid: number, file: string, version?: string | number | null): string {
  const v = (version === undefined ? getCacheVersion(appid) : version);
  const bust = (v !== null && v !== undefined && v !== "") ? `?c=${v}` : "";
  return `${LOOPBACK_ORIGIN}/assets/${appid}/${file}${bust}`;
}

/** Returns `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/<appid>/<file>`. */
export function buildSteamstaticUrl(appid: number, file: string): string {
  return `${STEAMSTATIC_ORIGIN}/store_item_assets/steam/apps/${appid}/${file}`;
}

/** Returns `https://cdn.akamai.steamstatic.com/steam/apps/<appid>/<file>`. */
export function buildAkamaiUrl(appid: number, file: string): string {
  return `${AKAMAI_ORIGIN}/steam/apps/${appid}/${file}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Asset-type getters
// ──────────────────────────────────────────────────────────────────────────

/** Wide hero art (1920×620). Loopback hits in 3-9 ms when the app overview
 *  carries `local_cache_version`; falls back to user customimages and the
 *  public CDN for store-only apps. */
export function getHeroUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const urls: string[] = [];
  if (version) urls.push(buildLoopbackUrl(appid, "library_hero.jpg", version));
  urls.push(`/customimages/${appid}_hero.png`);
  urls.push(`/customimages/${appid}_hero.jpg`);
  urls.push(buildSteamstaticUrl(appid, "library_hero.jpg"));
  urls.push(buildAkamaiUrl(appid, "library_hero.jpg"));
  return urls;
}

/** Blurred hero placeholder (192×62, ~10 KB). Loopback hits in 2 ms — useful
 *  as an instant placeholder while the full-resolution hero loads from the
 *  CDN. Cropped 10× smaller in both dimensions so the file is tiny but
 *  scales up legibly when used as a CSS background-image with `filter:
 *  blur()` or `image-rendering`. */
export function getHeroBlurUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const urls: string[] = [];
  if (version) urls.push(buildLoopbackUrl(appid, "library_hero_blur.jpg", version));
  urls.push(buildSteamstaticUrl(appid, "library_hero_blur.jpg"));
  urls.push(buildAkamaiUrl(appid, "library_hero_blur.jpg"));
  return urls;
}

/** Store-page background (1438×810, ~16:9 aspect). A separate asset Steam
 *  generates from the game's store page — typically a different framing of
 *  the hero art with more vertical headroom than the ultra-wide 1920×620
 *  `library_hero`. Useful for layouts where the hero needs vertical room
 *  (e.g. a portrait-mode card spotlight). Not on the loopback host — Steam
 *  only serves these from the public CDNs, so every fetch is a network
 *  round trip. `page_bg_generated_v6b.jpg` is the canonical filename; the
 *  other two are historical aliases for the same content. */
export function getStorePageBackgroundUrls(appid: number): string[] {
  return [
    buildSteamstaticUrl(appid, "page_bg_generated_v6b.jpg"),
    buildSteamstaticUrl(appid, "page_bg_generated.jpg"),
    buildSteamstaticUrl(appid, "page.bg.jpg"),
    buildSteamstaticUrl(appid, "page_bg_raw.jpg"),
    buildAkamaiUrl(appid, "page_bg_generated_v6b.jpg"),
    buildAkamaiUrl(appid, "page.bg.jpg"),
  ];
}

/** Portrait capsule (600×900, the library card art). The
 *  `library_capsule_filename` field on the overview points to the canonical
 *  per-app filename (most apps just use `library_600x900.jpg`). */
export function getPortraitUrls(appid: number, overview?: SteamAppOverview | null): string[] {
  const ov = overview ?? getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const file = ov?.library_capsule_filename || "library_600x900.jpg";
  const urls: string[] = [
    `/customimages/${appid}p.png`,
    `/customimages/${appid}p.jpg`,
  ];
  urls.push(buildLoopbackUrl(appid, file, version));
  if (file !== "library_600x900.jpg") urls.push(buildLoopbackUrl(appid, "library_600x900.jpg", version));
  urls.push(buildSteamstaticUrl(appid, "library_600x900.jpg"));
  urls.push(buildAkamaiUrl(appid, "library_600x900.jpg"));
  urls.push(buildSteamstaticUrl(appid, "library_600x900_2x.jpg"));
  urls.push(buildAkamaiUrl(appid, "library_600x900_2x.jpg"));
  urls.push(buildSteamstaticUrl(appid, "capsule_616x353.jpg"));
  urls.push(buildAkamaiUrl(appid, "capsule_616x353.jpg"));
  urls.push(buildSteamstaticUrl(appid, "header.jpg"));
  urls.push(buildAkamaiUrl(appid, "header.jpg"));
  urls.push(buildSteamstaticUrl(appid, "capsule_467x181.jpg"));
  urls.push(buildSteamstaticUrl(appid, "capsule_231x87.jpg"));
  urls.push(buildSteamstaticUrl(appid, "capsule_184x69.jpg"));
  urls.push(buildSteamstaticUrl(appid, "capsule_sm_120.jpg"));
  return urls;
}

/** Landscape header art (460×215). Used for "featured" / spotlight cards. */
export function getLandscapeUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const urls: string[] = [
    `/customimages/${appid}.png`,
    `/customimages/${appid}.jpg`,
  ];
  if (version) {
    urls.push(buildLoopbackUrl(appid, "header.jpg", version));
    urls.push(buildLoopbackUrl(appid, "library_header.jpg", version));
    urls.push(buildLoopbackUrl(appid, "library_hero.jpg", version));
  }
  urls.push(buildSteamstaticUrl(appid, "header.jpg"));
  urls.push(buildSteamstaticUrl(appid, "library_header.jpg"));
  urls.push(buildAkamaiUrl(appid, "header.jpg"));
  urls.push(buildSteamstaticUrl(appid, "library_hero.jpg"));
  return urls;
}

/** Logo overlay (the game's title art as a transparent PNG). Most often
 *  composited onto the hero. Steam doesn't expose a local_cache_version
 *  scoped to logos, so the loopback path is best-effort and may 404 — the
 *  CDN fallbacks always serve. */
export function getLogoUrls(appid: number): string[] {
  const version = getCacheVersion(appid);
  const urls: string[] = [
    `/customimages/${appid}_logo.png`,
  ];
  if (version) {
    urls.push(buildLoopbackUrl(appid, "logo.png", version));
    urls.push(buildLoopbackUrl(appid, "library_logo.png", version));
  }
  urls.push(buildSteamstaticUrl(appid, "logo.png"));
  urls.push(buildSteamstaticUrl(appid, "library_logo.png"));
  urls.push(buildAkamaiUrl(appid, "library_logo.png"));
  return urls;
}

/** Small square icon (~32-184px). Steam Community CDN serves a per-hash
 *  variant which is what the native client uses; the overview's `icon_hash`
 *  field carries the SHA1. */
export function getIconUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const iconHash = ov?.icon_hash;
  const version = getCacheVersion(appid, ov);
  const urls: string[] = [
    `/customimages/${appid}_icon.png`,
    `/customimages/${appid}_icon.jpg`,
  ];
  if (version) {
    urls.push(buildLoopbackUrl(appid, "icon.jpg", version));
  }
  if (iconHash) {
    // Steam Community public images host — the canonical icon URL native
    // friends/profile UI uses. Pinned by SHA1 so it never goes stale.
    urls.push(`${STEAMCOMMUNITY_ORIGIN}/apps/${appid}/${iconHash}.jpg`);
    urls.push(`${STEAMCOMMUNITY_ORIGIN}/apps/${appid}/${iconHash}.png`);
  }
  urls.push(buildSteamstaticUrl(appid, "icon.jpg"));
  return urls;
}

