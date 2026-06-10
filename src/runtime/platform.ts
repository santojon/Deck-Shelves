import type { ShelfSource } from "../types";

export type PlatformCollection = { id: string; name: string };
export type PlatformTab = { id: string; name: string; source?: ShelfSource };

export type PlatformAppMeta = {
  appid: number;
  name: string;
  heroUrl?: string;
  portraitUrl?: string;
  logoUrl?: string;
  iconUrl?: string;
  installed?: boolean;
  isSteam?: boolean;
  deckCompatCategory?: number;
  playtimeMinutes?: number;
  addedTimestamp?: number;
  updatePending?: boolean;
  /** Short store-page snippet (plain text). Populated lazily from
   *  `appDetailsStore.GetDescriptions(appid).strSnippet` — null until the
   *  first call after `preloadAppDescriptions` warms it. */
  description?: string;
  /** Full HTML store description from `GetDescriptions().strFullDescription`. */
  fullDescription?: string;
  /** Unix-seconds release date (from `rt_original_release_date` on overview). */
  releaseTimestamp?: number;
  /** Metacritic score (0-100) when Steam exposes one. */
  metacriticScore?: number;
  /** On-disk size in bytes from `appDetailsStore.GetAppDetails(appid).lDiskUsageBytes`. */
  diskUsageBytes?: number;
};

export interface PlatformApi {
  listCollections(): Promise<PlatformCollection[]>;
  listLibraryTabs(): Promise<PlatformTab[]>;
  resolveShelfAppIds(source: ShelfSource, limit: number, sort?: string | string[], shelfId?: string, sortReverse?: boolean | boolean[], options?: { hiddenAppIds?: number[]; dedupeByName?: boolean }): Promise<number[]>;
  getAppName(appid: number): Promise<string>;
  getAppMeta(appid: number): Promise<PlatformAppMeta>;
  /** Batched meta lookup — single catalog walk + O(1) per-id resolution.
   *  Falls back to per-id `getAppMeta` calls when not implemented. */
  getAppMetaBatch?(appids: number[]): Promise<Map<number, PlatformAppMeta>>;
  navigateToApp(appid: number): void;
  navigateToShelfSource?(source: ShelfSource, title?: string): void;
}
