import type { ShelfSource } from "../types";

export type PlatformCollection = { id: string; name: string };
export type PlatformTab = { id: string; name: string; source?: ShelfSource };

export type PlatformAppMeta = {
  appid: number;
  name: string;
  heroUrl?: string;
  portraitUrl?: string;
  installed?: boolean;
  isSteam?: boolean;
  deckCompatCategory?: number;
  playtimeMinutes?: number;
  addedTimestamp?: number;
  updatePending?: boolean;
};

export interface PlatformApi {
  listCollections(): Promise<PlatformCollection[]>;
  listLibraryTabs(): Promise<PlatformTab[]>;
  resolveShelfAppIds(source: ShelfSource, limit: number, sort?: string | string[], shelfId?: string, sortReverse?: boolean | boolean[], options?: { hiddenAppIds?: number[]; dedupeByName?: boolean }): Promise<number[]>;
  getAppName(appid: number): Promise<string>;
  getAppMeta(appid: number): Promise<PlatformAppMeta>;
  navigateToApp(appid: number): void;
  navigateToShelfSource?(source: ShelfSource, title?: string): void;
}
