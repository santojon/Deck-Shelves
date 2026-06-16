
import { getAssetRevision } from "./assetRevision";

const LOOPBACK_ORIGIN = "https://steamloopback.host";
const STEAMSTATIC_ORIGIN = "https://shared.cloudflare.steamstatic.com";
const AKAMAI_ORIGIN = "https://cdn.akamai.steamstatic.com";
const STEAMCOMMUNITY_ORIGIN = "https://cdn.akamai.steamstatic.com/steamcommunity/public/images";

// App overview helpers

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
    const store = (globalThis as unknown as { appStore?: { GetAppOverviewByAppID?: (id: number) => SteamAppOverview } }).appStore;
    return store?.GetAppOverviewByAppID?.(appid) ?? null;
  } catch { return null; }
}

// Drives memo deps so URL lists re-derive when the user changes art and
// returns to home. Steam-native URLs already carry `?c=<local_cache_version>`
// for their own cache busting; this revision is the *only* signal that
// flips for `/customimages/...` paths (those don't have any Steam-provided
// cache buster). Returning the bare revision keeps the dep array cheap —
// no per-render appStore reads — and matches the simpler URL behaviour the
// plugin had before the per-field overview snapshot.
export function getAppAssetCacheKey(_appid: number): string {
  return getAssetRevision();
}

// Customimages/ URLs are user-uploaded artwork served straight off disk;
// the file path is stable across replacements so the browser keeps showing
// the old bitmap until the page reloads. Append the global revision (which
// HomeInject bumps on returns to home) so the URL flips on the next render.
function customBust(_appid: number): string {
  return `?c=${getAssetRevision()}`;
}

function getCacheVersion(appid: number, overview?: SteamAppOverview | null): string | null {
  const ov = overview ?? getOverview(appid);
  const v = ov?.local_cache_version;
  if (typeof v === "string" && v) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

// Generic URL builders

export function buildLoopbackUrl(appid: number, file: string, version?: string | number | null): string {
  const v = (version === undefined ? getCacheVersion(appid) : version);
  const bust = (v !== null && v !== undefined && v !== "") ? `?c=${v}` : "";
  return `${LOOPBACK_ORIGIN}/assets/${appid}/${file}${bust}`;
}

export function buildSteamstaticUrl(appid: number, file: string): string {
  return `${STEAMSTATIC_ORIGIN}/store_item_assets/steam/apps/${appid}/${file}`;
}

export function buildAkamaiUrl(appid: number, file: string): string {
  return `${AKAMAI_ORIGIN}/steam/apps/${appid}/${file}`;
}

// Asset-type getters

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

export function getHeroBlurUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const urls: string[] = [];
  if (version) urls.push(buildLoopbackUrl(appid, "library_hero_blur.jpg", version));
  urls.push(buildSteamstaticUrl(appid, "library_hero_blur.jpg"));
  urls.push(buildAkamaiUrl(appid, "library_hero_blur.jpg"));
  return urls;
}

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

export function getPortraitUrls(appid: number, overview?: SteamAppOverview | null): string[] {
  const ov = overview ?? getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const file = ov?.library_capsule_filename || "library_600x900.jpg";
  const bust = customBust(appid);
  const urls: string[] = [
    `/customimages/${appid}p.png${bust}`,
    `/customimages/${appid}p.jpg${bust}`,
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

export function getLandscapeUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const bust = customBust(appid);
  const urls: string[] = [
    `/customimages/${appid}.png${bust}`,
    `/customimages/${appid}.jpg${bust}`,
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

export function getLogoUrls(appid: number): string[] {
  const version = getCacheVersion(appid);
  const bust = customBust(appid);
  const urls: string[] = [
    `/customimages/${appid}_logo.png${bust}`,
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

export function getIconUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const iconHash = ov?.icon_hash;
  const version = getCacheVersion(appid, ov);
  const bust = customBust(appid);
  const urls: string[] = [
    `/customimages/${appid}_icon.png${bust}`,
    `/customimages/${appid}_icon.jpg${bust}`,
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

