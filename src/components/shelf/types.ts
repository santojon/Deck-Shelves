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
  discountPercent?: number;
  // Editor-only overlays: when the user is in the highlight or hidden
  /* picker, the preview shifts the click target from "open game" to
     "toggle selection" and paints a tinted layer over each card so the
     user can see which entries are selected. `grabbed` is used by the
     manual-sort row to mark the card currently held in grab mode. All
     fields are absent on the home shelf — game cards behave normally. */
  selectionMark?: 'highlight' | 'hidden' | 'grabbed' | 'added';
  onToggleSelection?: () => void;
  // Synthetic-card slot. When set, ShelfRow renders the
  // SyntheticCard instead of a game card; the rules from
  // `ShelfSchema.syntheticCards.superRefine` govern focus + content.
  synthetic?: {
    image?: string;
    text?: string;
    link?: { type: "app" | "url"; value: string };
    size: "normal" | "featured";
    alpha?: number;
    placeholder?: boolean;
    // Optional hero image — when set AND the card is focused, the
    // per-shelf hero background swaps to this URL (same path
    // `PerShelfHero` uses for game cards via `data-appid`).
    heroImage?: string;
    /* Card-frame shadow mode for focusable synth cards. "never"
       (default) maps to `.ds-card--synthetic-noshadow`; "always" keeps
       the baseline frame shadow; "onFocus" suppresses at idle and
       restores on focus. No effect on non-focusable gaps. */
    shadowMode?: "never" | "onFocus" | "always";
    /* Persisted index into `shelf.syntheticCards`. Used by the home
       shelf's SyntheticCard X (remove) / Y (toggle size) bindings to
       patch the right entry. Optional — preview / drag modes that
       re-index synth cards leave it out and skip those bindings. */
    index?: number;
  };
};

export const CARD_W = 134;
export const CARD_ART_H = 201;
export const CARD_GAP = 12;

// Smart-shelf modes whose result can change between two clicks of the
/* trailing card — random shuffle, time-window switches, sliding cutoffs.
   Only these modes get a refresh card; deterministic modes get no
   trailing card at all (view-more would mislead — smart resolvers can't
   be opened in the library directly — and refresh against stable app data
   would be a no-op). */
export const REFRESHABLE_SMART_MODES: readonly string[] = [
  "random_pick",
  "time_of_day",
  "spare_time",
  "recently_played",
];
