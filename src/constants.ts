/* Central constants — the external origins and fixed links used across the
   plugin, gathered here so they are not scattered inline. Endpoint PATH and
   query building stays with its caller (that is request logic, not a constant);
   only the origins and fixed URLs live here. */

/** Steam store web + JSON API origin. */
export const STEAM_STORE_BASE = "https://store.steampowered.com";
/** Steam image CDNs. */
export const STEAM_CDN_AKAMAI = "https://cdn.akamai.steamstatic.com";
export const STEAM_CDN_CLOUDFLARE = "https://shared.cloudflare.steamstatic.com";
/** Steam avatar host (friends' pictures). */
export const STEAM_AVATARS_BASE = "https://avatars.steamstatic.com";
/** Steam Community web origin. */
export const STEAMCOMMUNITY_BASE = "https://steamcommunity.com";

/** Project links. */
export const GITHUB_REPO = "https://github.com/santojon/Deck-Shelves";
export const GITHUB_ISSUES_NEW = `${GITHUB_REPO}/issues/new`;
export const GITHUB_RELEASES = `${GITHUB_REPO}/releases`;
export const REDDIT_COMMUNITY = "https://www.reddit.com/r/DeckShelves/";
export const DISCORD_INVITE = "https://discord.gg/EChuVEDakk";
export const KOFI_URL = "https://ko-fi.com/F2F61WE76V";
