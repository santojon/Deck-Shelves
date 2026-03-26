export type SteamArt = {
  portrait: string;
  hero: string;
  header: string;
  capsule: string;
};

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
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  ];
}
