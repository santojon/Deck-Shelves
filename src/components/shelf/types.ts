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
  controllerSupport?: number;
  playtimeMinutes?: number;
  isInstalled?: boolean;
  statusText?: string;
  shelfId?: string;
  updatePending?: boolean;
  isSteam?: boolean;
  isNew?: boolean;
  discountPercent?: number;
  priceText?: string;
  selectionMark?: 'highlight' | 'hidden' | 'grabbed' | 'added';
  onToggleSelection?: () => void;
  synthetic?: {
    image?: string;
    text?: string;
    link?: { type: "app" | "url"; value: string };
    size: "normal" | "featured";
    alpha?: number;
    placeholder?: boolean;
    heroImage?: string;
    shadowMode?: "never" | "onFocus" | "always";
    index?: number;
  };
};

export const CARD_W = 134;
export const CARD_ART_H = 201;
export const CARD_GAP = 12;

export const REFRESHABLE_SMART_MODES: readonly string[] = [
  "random_pick",
  "time_of_day",
  "spare_time",
  "recently_played",
];
