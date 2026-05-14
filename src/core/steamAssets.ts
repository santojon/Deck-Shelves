export type SteamArt = {
  portrait: string;
  hero: string;
  header: string;
  capsule: string;
};

export function getLandscapeUrls(appid: number, mtime?: number): string[] {
  const cacheBust = mtime ? `?c=${mtime}` : "";
  return [
    `/customimages/${appid}.png`,
    `/customimages/${appid}.jpg`,
    `/assets/${appid}/header.jpg${cacheBust}`,
    `/assets/${appid}/library_header.jpg${cacheBust}`,
    `/assets/${appid}/library_hero.jpg${cacheBust}`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_header.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
  ];
}

export function getPortraitFallbacks(appid: number, capsuleFilename?: string, mtime?: number): string[] {
  const cacheBust = mtime ? `?c=${mtime}` : "";
  const file = capsuleFilename || "library_600x900.jpg";
  return [
    `/customimages/${appid}p.png`,
    `/customimages/${appid}p.jpg`,
    `/assets/${appid}/${file}${cacheBust}`,
    `/assets/${appid}/library_600x900.jpg${cacheBust}`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900_2x.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900_2x.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_616x353.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_467x181.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_231x87.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_184x69.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_sm_120.jpg`,
  ];
}
