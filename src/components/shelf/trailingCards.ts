import { REFRESHABLE_SMART_MODES } from "./types";

export type TrailingCardInput = {
  source: any;
  // sort accepts the single-key string form (back-compat) or the
  // multi-key array form. For trailing-card decisions we only care about
  // whether the PRIMARY key is `random`, so the first element of the
  // array is consulted when an array is passed.
  sort?: string | string[];
  hideSeeMore?: boolean;
  hideRefreshCard?: boolean;
  globalHideSeeMore?: boolean;
  globalHideRefreshCard?: boolean;
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

export function isOnlineShelfSource(src: any): boolean {
  return src?.type === "wishlist" || src?.type === "store";
}

export function shouldShowRefreshCard(input: TrailingCardInput): boolean {
  if (input.globalHideRefreshCard === true || input.hideRefreshCard === true) return false;
  const src = input.source;
  if (src?.type === "smart") return REFRESHABLE_SMART_MODES.includes(src.mode);
  if (isOnlineShelfSource(src)) return true;
  return isRandomNonSmart(src, input.sort);
}

export function shouldShowMoreCard(input: TrailingCardInput): boolean {
  if (input.globalHideSeeMore === true || input.hideSeeMore === true) return false;
  return input.source?.type !== "smart";
}
