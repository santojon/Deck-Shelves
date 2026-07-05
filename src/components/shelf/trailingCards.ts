import { REFRESHABLE_SMART_MODES } from "./types";
import { isOnlineSource } from "../../domain/sourceUtils";

export type TrailingCardInput = {
  source: any;
  /* sort accepts the single-key string form (back-compat) or the
     multi-key array form. For trailing-card decisions we only care about
     whether the PRIMARY key is `random`, so the first element of the
     array is consulted when an array is passed. */
  sort?: string | string[];
  hideSeeMore?: boolean;
  hideRefreshCard?: boolean;
  globalHideSeeMore?: boolean;
  globalHideRefreshCard?: boolean;
  /* Dynamic "See more": the pre-limit match count and the shelf limit.
     When both are known (and the shelf isn't online), the card is hidden
     if the source has nothing more than what already fits. Absent on the
     modal preview, where the card keeps its previous always-shown shape. */
  resolvedTotal?: number;
  limit?: number;
  isOnline?: boolean;
};

function primarySort(sort: string | string[] | undefined): string | undefined {
  if (Array.isArray(sort)) return sort[0];
  return sort;
}

function isRandomNonSmart(src: any, sort: string | string[] | undefined): boolean {
  if (src?.type === "smart") return false;
  if (primarySort(sort) === "random") return true;
  const filterSort = src?.type === "filter" ? src?.filter?.sort : undefined;
  return primarySort(filterSort) === "random";
}

// Direct-only check (kept for callers that need the strict shape).
export function isOnlineShelfSource(src: any): boolean {
  return src?.type === "wishlist" || src?.type === "store";
}

export function shouldShowRefreshCard(input: TrailingCardInput): boolean {
  if (input.globalHideRefreshCard === true || input.hideRefreshCard === true) return false;
  const src = input.source;
  if (src?.type === "smart") return REFRESHABLE_SMART_MODES.includes(src.mode);
  // Recurses into composite.sources so a combined shelf with any online
  // child still surfaces the refresh card (parity with the context-menu fix).
  if (isOnlineSource(src)) return true;
  return isRandomNonSmart(src, input.sort);
}

export function shouldShowMoreCard(input: TrailingCardInput): boolean {
  if (input.globalHideSeeMore === true || input.hideSeeMore === true) return false;
  if (input.source?.type === "smart") return false;
  /* Dynamic: on a library (non-online) shelf, hide "See more" when the source
     has nothing beyond what the limit already shows. Online shelves always link
     out to the store. When the total is unknown (resolver didn't report it, or
     the modal preview), keep the previous behaviour and show the card. */
  if (input.isOnline !== true
      && typeof input.resolvedTotal === "number"
      && typeof input.limit === "number"
      && input.resolvedTotal <= input.limit) {
    return false;
  }
  return true;
}
