import { memo } from "react";
import type { DiscountBadgeMode } from './discountBadge';
import { GameCard } from "./GameCard";
import { MoreCard } from "./MoreCard";
import { RefreshCard } from "./RefreshCard";
import { SyntheticCard } from "./SyntheticCard";
import type { DeckRowItem } from "./types";
import type { CardWindow } from "../../domain/cardWindow";
import { withDefaults } from "../withDefaults";

export interface ShelfRowProps {
  items: DeckRowItem[];
  cardW: number;
  cardH: number;
  artH?: number;
  featuredW?: number;
  featuredH?: number;
  featuredArtH?: number;
  highlightFirst?: boolean;
  highlightAll?: boolean;
  highlightedSet?: Set<number>;
  hideStatusLine?: boolean;
  hideNewBadge?: boolean;
  hideDiscountBadge?: boolean;
  discountBadgeMode?: DiscountBadgeMode;
  hideCompatIcons?: boolean;
  hideNonSteamBadge?: boolean;
  hideGameName?: boolean;
  hideInstallIndicator?: boolean;
  friendsOverlay?: boolean;
  friendsOverlayRecent?: boolean;
  enableLogo?: boolean;
  enableIcon?: boolean;
  enableDescription?: boolean;
  descriptionBelowLogo?: boolean;
  logoPosition?: 'left' | 'center' | 'right';
  descriptionPosition?: 'left' | 'center' | 'right';
  iconVerticalAlign?: 'top' | 'center' | 'bottom';
  gameNamePosition?: 'left' | 'center' | 'right';
  playtimePosition?: 'left' | 'center' | 'right';
  refreshInteractive?: boolean;
  moreInteractive?: boolean;
  // For the modal preview: the portal overlay treats a modal as covering the Home and hides the badge.
  inlineBadges?: boolean;
  previewMode?: boolean;
  removableSet?: Set<number>;
  onRemoveCard?: (appid: number) => void;
  hiddenSet?: Set<number>;
  onHideCard?: (appid: number) => void;
  window?: CardWindow | null;
}

const ROW_DEFAULTS = {
  highlightFirst: false, highlightAll: false,
  hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false,
  hideGameName: false, hideInstallIndicator: false,
  friendsOverlay: false, friendsOverlayRecent: false,
  enableLogo: false, enableIcon: false, enableDescription: false, descriptionBelowLogo: false,
  logoPosition: 'left', descriptionPosition: 'left', iconVerticalAlign: 'top', gameNamePosition: 'left', playtimePosition: 'left',
  inlineBadges: false, previewMode: false,
} as const satisfies Partial<ShelfRowProps>;

type RowProps = ShelfRowProps & Required<Pick<ShelfRowProps, keyof typeof ROW_DEFAULTS>>;

const withRowDefaults = (props: ShelfRowProps): RowProps => withDefaults(props, ROW_DEFAULTS);

type WideRule = Pick<ShelfRowProps, "highlightFirst" | "highlightAll" | "highlightedSet">;

function isHighlighted(item: DeckRowItem, idx: number, p: WideRule): boolean {
  if (p.highlightAll) return true;
  if (p.highlightFirst && idx === 0) return true;
  return !!p.highlightedSet && item.appid !== undefined && p.highlightedSet.has(item.appid);
}

function cardSize(wide: boolean, p: RowProps): { w: number; h: number; artH: number | undefined } {
  return {
    w: wide && p.featuredW !== undefined ? p.featuredW : p.cardW,
    h: wide && p.featuredH !== undefined ? p.featuredH : p.cardH,
    artH: wide && p.featuredArtH !== undefined ? p.featuredArtH : p.artH,
  };
}

export function isWideItem(item: DeckRowItem, idx: number, p: WideRule): boolean {
  if (item.synthetic) return item.synthetic.size === "featured";
  return !item.isRefresh && !item.isMoreLink && isHighlighted(item, idx, p);
}

function renderSlot(item: DeckRowItem, idx: number, p: RowProps) {
  const { w, h } = cardSize(isWideItem(item, idx, p), p);
  return <div key={item.id} className="ds-card-slot" aria-hidden="true" style={{ width: w, minWidth: w, height: h, flexShrink: 0 }} />;
}

function gameCardFlags(p: RowProps) {
  return {
    hideStatusLine: p.hideStatusLine,
    hideNewBadge: p.hideNewBadge,
    hideDiscountBadge: p.hideDiscountBadge,
    discountBadgeMode: p.discountBadgeMode,
    hideCompatIcons: p.hideCompatIcons,
    hideNonSteamBadge: p.hideNonSteamBadge,
    hideGameName: p.hideGameName,
    hideInstallIndicator: p.hideInstallIndicator,
    friendsOverlay: p.friendsOverlay,
    friendsOverlayRecent: p.friendsOverlayRecent,
    enableLogo: p.enableLogo,
    enableIcon: p.enableIcon,
    enableDescription: p.enableDescription,
    descriptionBelowLogo: p.descriptionBelowLogo,
    logoPosition: p.logoPosition,
    descriptionPosition: p.descriptionPosition,
    iconVerticalAlign: p.iconVerticalAlign,
    gameNamePosition: p.gameNamePosition,
    playtimePosition: p.playtimePosition,
    inlineBadges: p.inlineBadges,
    previewMode: p.previewMode,
    removableSet: p.removableSet,
    onRemoveCard: p.onRemoveCard,
    hiddenSet: p.hiddenSet,
    onHideCard: p.onHideCard,
  };
}

function renderCard(item: DeckRowItem, idx: number, p: RowProps) {
  if (item.synthetic) {
    const s = cardSize(item.synthetic.size === "featured", p);
    return <SyntheticCard key={item.id} item={item} cardW={s.w} cardH={s.h} featuredW={p.featuredW} />;
  }
  if (item.isRefresh) {
    return (
      <RefreshCard
        key={item.id}
        item={item}
        cardW={p.cardW}
        cardH={p.cardH}
        {...(p.refreshInteractive !== undefined ? { interactive: p.refreshInteractive } : {})}
      />
    );
  }
  if (item.isMoreLink) {
    return (
      <MoreCard
        key={item.id}
        item={item}
        cardW={p.cardW}
        cardH={p.cardH}
        {...(p.moreInteractive !== undefined ? { interactive: p.moreInteractive } : {})}
      />
    );
  }
  const isFeatured = isHighlighted(item, idx, p);
  const s = cardSize(isFeatured, p);
  return (
    <GameCard
      key={item.id}
      item={item}
      cardW={s.w}
      cardH={s.h}
      artH={s.artH}
      featured={isFeatured}
      cardIndex={idx}
      {...gameCardFlags(p)}
    />
  );
}

function ShelfRowImpl(props: ShelfRowProps) {
  const p = withRowDefaults(props);
  return (
    <>
      {props.items.map((item, idx) => (
        p.window && (idx < p.window.start || idx >= p.window.end) ? renderSlot(item, idx, p) : renderCard(item, idx, p)
      ))}
    </>
  );
}

export const ShelfRow = memo(ShelfRowImpl);
