export type ShelfSourceType = "collection" | "tab" | "filter";

export type ShelfTabType =
  | "installed"
  | "favorites"
  | "recently_played"
  | "not_played"
  | "non_steam"
  | "hidden";

export interface ShelfDefinitionBase {
  id: string;
  name: string;
  enabled: boolean;
  limit: number; // max apps shown
  sourceType: ShelfSourceType;
}

export interface CollectionShelfDefinition extends ShelfDefinitionBase {
  sourceType: "collection";
  collectionId: string;
}

export interface TabShelfDefinition extends ShelfDefinitionBase {
  sourceType: "tab";
  tab: ShelfTabType;
}

/**
 * Filter model intentionally aligned with TabMaster's *concepts*:
 * each shelf can have multiple filters and each filter has its own editor.
 *
 * We keep this purely declarative and evaluate it against Steam's runtime
 * AppOverview data so it reflects the device state (and other plugins that
 * inject non-Steam apps into the library).
 */
export type FilterType =
  | "collection"
  | "installed"
  | "regex"
  | "tags"
  | "whitelist"
  | "blacklist"
  | "platform"
  | "deck_compat"
  | "time_played"
  | "last_played";

export type FilterMode = "any" | "all";

export interface BaseFilter {
  id: string;
  type: FilterType;
  enabled: boolean;
}

export interface CollectionFilter extends BaseFilter {
  type: "collection";
  collectionId: string;
}

export interface InstalledFilter extends BaseFilter {
  type: "installed";
  installed: boolean;
}

export interface RegexFilter extends BaseFilter {
  type: "regex";
  pattern: string;
  flags?: string;
}

export interface TagsFilter extends BaseFilter {
  type: "tags";
  mode: "any" | "all";
  tags: string[];
}

export interface ListFilter extends BaseFilter {
  type: "whitelist" | "blacklist";
  appids: number[];
}

export interface PlatformFilter extends BaseFilter {
  type: "platform";
  platform: "steam" | "non_steam";
}

export interface DeckCompatFilter extends BaseFilter {
  type: "deck_compat";
  statuses: ("verified" | "playable" | "unsupported" | "unknown")[];
}

export interface TimePlayedFilter extends BaseFilter {
  type: "time_played";
  comparator: ">" | ">=" | "<" | "<=";
  minutes: number;
}

export interface LastPlayedFilter extends BaseFilter {
  type: "last_played";
  comparator: "within_days" | "not_within_days";
  days: number;
}

export type ShelfFilter =
  | CollectionFilter
  | InstalledFilter
  | RegexFilter
  | TagsFilter
  | ListFilter
  | PlatformFilter
  | DeckCompatFilter
  | TimePlayedFilter
  | LastPlayedFilter;

export interface FilterShelfDefinition extends ShelfDefinitionBase {
  sourceType: "filter";
  mode: FilterMode;
  filters: ShelfFilter[];
}

export type ShelfDefinition =
  | CollectionShelfDefinition
  | TabShelfDefinition
  | FilterShelfDefinition;

export interface DeckShelvesSettings {
  enabled: boolean;
  shelves: ShelfDefinition[];
}
