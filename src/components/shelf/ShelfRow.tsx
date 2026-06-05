/* eslint-disable complexity */
import { memo } from "react";
import { GameCard } from "./GameCard";
import { MoreCard } from "./MoreCard";
import { RefreshCard } from "./RefreshCard";
import { SyntheticCard } from "./SyntheticCard";
import type { DeckRowItem } from "./types";

// Shared `items.map → GameCard/RefreshCard/MoreCard` loop used by both the
// home shelf (DeckRow) and the EditShelfModal preview. Pure presentational
// — no state, no effects. Sizing, featured rules, and hide-flags come in
// as props; the caller owns the surrounding wrapper (focus delegate,
// scroll padding, theme overrides).
//
// Trailing cards (Refresh, More) follow the same `isRefresh` / `isMoreLink`
// item-flag convention DeckRow already uses. Home shelves render them
// interactive by default; preview sets `refreshInteractive`/`moreInteractive`
// to opt out where the modal wants flat / read-only cards.
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
  hideCompatIcons?: boolean;
  hideNonSteamBadge?: boolean;
  hideGameName?: boolean;
  hideInstallIndicator?: boolean;
  refreshInteractive?: boolean;
  moreInteractive?: boolean;
  // Render badges inside the card instead of via the BP-body portal.
  // The modal preview needs this because the portal's overlay-detection
  // sees the modal blocking the home root and hides the badge.
  inlineBadges?: boolean;
  // Suppress per-card quick actions whose effect bypasses the parent's
  // edit-state (currently Y → highlight). Set by the modal preview.
  previewMode?: boolean;
  // Per-card X-button binding. `removableSet` = appids that get the
  // "Remove from shelf" action — the manualOrder entries NOT present in
  // the resolved source (typically games appended via the library menu
  // "Add to shelf"). Drag-ordered cards stay OUT of this set so X
  // doesn't pretend to remove them (it'd just re-pop them from source).
  // For cards NOT in `removableSet`, X falls back to "Hide from shelf"
  // when `onHideCard` is provided.
  removableSet?: Set<number>;
  onRemoveCard?: (appid: number) => void;
  hiddenSet?: Set<number>;
  onHideCard?: (appid: number) => void;
}

function ShelfRowImpl({
  items,
  cardW, cardH, artH,
  featuredW, featuredH, featuredArtH,
  highlightFirst = false, highlightAll = false, highlightedSet,
  hideStatusLine = false, hideNewBadge = false, hideDiscountBadge = false,
  hideCompatIcons = false, hideNonSteamBadge = false,
  hideGameName = false, hideInstallIndicator = false,
  refreshInteractive, moreInteractive,
  inlineBadges = false,
  previewMode = false,
  removableSet,
  onRemoveCard,
  hiddenSet,
  onHideCard,
}: ShelfRowProps) {
  return (
    <>
      {items.map((item, idx) => {
        if (item.synthetic) {
          const isFeat = item.synthetic.size === "featured";
          return (
            <SyntheticCard
              key={item.id}
              item={item}
              cardW={isFeat && featuredW !== undefined ? featuredW : cardW}
              cardH={isFeat && featuredH !== undefined ? featuredH : cardH}
              featuredW={featuredW}
            />
          );
        }
        if (item.isRefresh) {
          return (
            <RefreshCard
              key={item.id}
              item={item}
              cardW={cardW}
              cardH={cardH}
              {...(refreshInteractive !== undefined ? { interactive: refreshInteractive } : {})}
            />
          );
        }
        if (item.isMoreLink) {
          return (
            <MoreCard
              key={item.id}
              item={item}
              cardW={cardW}
              cardH={cardH}
              {...(moreInteractive !== undefined ? { interactive: moreInteractive } : {})}
            />
          );
        }
        const isFeatured = highlightAll
          || (highlightFirst && idx === 0)
          || (!!highlightedSet && item.appid !== undefined && highlightedSet.has(item.appid));
        return (
          <GameCard
            key={item.id}
            item={item}
            cardW={isFeatured && featuredW !== undefined ? featuredW : cardW}
            cardH={isFeatured && featuredH !== undefined ? featuredH : cardH}
            artH={isFeatured && featuredArtH !== undefined ? featuredArtH : artH}
            featured={isFeatured}
            cardIndex={idx}
            hideStatusLine={hideStatusLine}
            hideNewBadge={hideNewBadge}
            hideDiscountBadge={hideDiscountBadge}
            hideCompatIcons={hideCompatIcons}
            hideNonSteamBadge={hideNonSteamBadge}
            hideGameName={hideGameName}
            hideInstallIndicator={hideInstallIndicator}
            inlineBadges={inlineBadges}
            previewMode={previewMode}
            removableSet={removableSet}
            onRemoveCard={onRemoveCard}
            hiddenSet={hiddenSet}
            onHideCard={onHideCard}
          />
        );
      })}
    </>
  );
}

export const ShelfRow = memo(ShelfRowImpl);
