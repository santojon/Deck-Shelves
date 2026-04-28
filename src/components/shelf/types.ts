export type DeckRowItem = {
  id: string | number;
  name: string;
  portraitUrl?: string;
  heroUrl?: string;
  isMoreLink?: boolean;
  isRefresh?: boolean;
  onActivate?: () => void;
  onMenuButton?: (evt: any) => void;
  appid?: number;
  deckCompatCategory?: number;
  playtimeMinutes?: number;
  isInstalled?: boolean;
  statusText?: string;
  shelfId?: string;
  updatePending?: boolean;
  isSteam?: boolean;
  isNew?: boolean;
};

export const CARD_W = 133;
export const CARD_ART_H = 200;
export const CARD_GAP = 12;

// Smart-shelf modes whose result can change between two clicks of the
// trailing card — random shuffle, time-window switches, sliding cutoffs.
// Only these modes get a refresh card; deterministic modes get no
// trailing card at all (view-more would mislead — smart resolvers can't
// be opened in the library directly — and refresh against stable app data
// would be a no-op).
export const REFRESHABLE_SMART_MODES: readonly string[] = [
  "random_pick",
  "time_of_day",
  "spare_time",
  "recently_played",
];
