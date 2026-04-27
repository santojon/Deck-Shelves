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
