
import { getAssetRevision } from "./assetRevision";
import { STEAM_CDN_AKAMAI, STEAM_CDN_CLOUDFLARE } from "../constants";

const LOOPBACK_ORIGIN = "https://steamloopback.host";
const STEAMSTATIC_ORIGIN = STEAM_CDN_CLOUDFLARE;
const AKAMAI_ORIGIN = STEAM_CDN_AKAMAI;
const STEAMCOMMUNITY_ORIGIN = `${STEAM_CDN_AKAMAI}/steamcommunity/public/images`;

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

// Steam URLs carry their own `?c=` buster; this revision is the only signal for `/customimages/` paths.
export function getAppAssetCacheKey(_appid: number): string {
  return getAssetRevision();
}

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

// Only local paths whose file can change in place get the revision buster.
// Remote CDN art is immutable per appid and file, so it skips the buster.

function rev(): string {
  return getAssetRevision();
}

export function buildLoopbackUrl(appid: number, file: string, version?: string | number | null): string {
  const v = (version === undefined ? getCacheVersion(appid) : version);
  const versionedBust = (v !== null && v !== undefined && v !== "") ? `c=${v}` : "";
  const parts = [versionedBust, `r=${rev()}`].filter(Boolean);
  return `${LOOPBACK_ORIGIN}/assets/${appid}/${file}?${parts.join("&")}`;
}

export function buildSteamstaticUrl(appid: number, file: string): string {
  return `${STEAMSTATIC_ORIGIN}/store_item_assets/steam/apps/${appid}/${file}`;
}

export function buildAkamaiUrl(appid: number, file: string): string {
  return `${AKAMAI_ORIGIN}/steam/apps/${appid}/${file}`;
}

function getLibraryAssets(appid: number): Record<string, string | null> | null {
  try {
    const ads = (globalThis as any).appDetailsStore;
    return ads?.GetAppDetails?.(appid)?.libraryAssets ?? null;
  } catch { return null; }
}

export function getHeroUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const bust = customBust(appid);
  const la = getLibraryAssets(appid);
  // strHeroImage may carry a hash-dir prefix for community art.
  const heroFile = la?.strHeroImage ?? (version ? "library_hero.jpg" : null);
  const urls: string[] = [];
  // Custom artwork must win over the default hero; a missing file 404s fast and falls back.
  urls.push(`/customimages/${appid}_hero.png${bust}`);
  urls.push(`/customimages/${appid}_hero.jpg${bust}`);
  if (heroFile && version) urls.push(buildLoopbackUrl(appid, heroFile, version));
  else if (version) urls.push(buildLoopbackUrl(appid, "library_hero.jpg", version));
  urls.push(buildSteamstaticUrl(appid, "library_hero.jpg"));
  urls.push(buildAkamaiUrl(appid, "library_hero.jpg"));
  return urls;
}

export function getHeroBlurUrls(appid: number): string[] {
  const ov = getOverview(appid);
  const version = getCacheVersion(appid, ov);
  const la = getLibraryAssets(appid);
  const blurFile = la?.strHeroBlurImage ?? "library_hero_blur.jpg";
  const urls: string[] = [];
  if (version) urls.push(buildLoopbackUrl(appid, blurFile, version));
  if (blurFile !== "library_hero_blur.jpg" && version) {
    urls.push(buildLoopbackUrl(appid, "library_hero_blur.jpg", version));
  }
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
  const la = getLibraryAssets(appid);
  const urls: string[] = [
    `/customimages/${appid}.png${bust}`,
    `/customimages/${appid}.jpg${bust}`,
  ];
  if (version) {
    const headerFile = la?.strHeaderImage ?? "library_header.jpg";
    urls.push(buildLoopbackUrl(appid, headerFile, version));
    if (headerFile !== "library_header.jpg") {
      urls.push(buildLoopbackUrl(appid, "library_header.jpg", version));
    }
    urls.push(buildLoopbackUrl(appid, "header.jpg", version));
    const heroFile = la?.strHeroImage ?? "library_hero.jpg";
    urls.push(buildLoopbackUrl(appid, heroFile, version));
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
  const la = getLibraryAssets(appid);
  const logoFile = la?.strLogoImage ?? "logo.png";
  const urls: string[] = [
    `/customimages/${appid}_logo.png${bust}`,
  ];
  if (version) {
    urls.push(buildLoopbackUrl(appid, logoFile, version));
    if (logoFile !== "logo.png") urls.push(buildLoopbackUrl(appid, "logo.png", version));
  }
  urls.push(buildSteamstaticUrl(appid, "logo.png"));
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
    // Pinned by SHA1, so it never goes stale.
    urls.push(`${STEAMCOMMUNITY_ORIGIN}/apps/${appid}/${iconHash}.jpg`);
    urls.push(`${STEAMCOMMUNITY_ORIGIN}/apps/${appid}/${iconHash}.png`);
  }
  urls.push(buildSteamstaticUrl(appid, "icon.jpg"));
  return urls;
}

