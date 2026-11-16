import { REFRESHABLE_SMART_MODES } from "./types";
import { isOnlineSource } from "../../domain/sourceUtils";

export type TrailingCardInput = {
  source: any;
  sort?: string | string[];
  hideSeeMore?: boolean;
  hideRefreshCard?: boolean;
  globalHideSeeMore?: boolean;
  globalHideRefreshCard?: boolean;
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

export function shouldShowRefreshCard(input: TrailingCardInput): boolean {
  if (input.globalHideRefreshCard === true || input.hideRefreshCard === true) return false;
  const src = input.source;
  if (src?.type === "smart") return REFRESHABLE_SMART_MODES.includes(src.mode);
  if (isOnlineSource(src)) return true;
  return isRandomNonSmart(src, input.sort);
}

export function shouldShowMoreCard(input: TrailingCardInput): boolean {
  if (input.globalHideSeeMore === true || input.hideSeeMore === true) return false;
  if (input.source?.type === "smart") return false;
  if (input.isOnline !== true
      && typeof input.resolvedTotal === "number"
      && typeof input.limit === "number"
      && input.resolvedTotal <= input.limit) {
    return false;
  }
  return true;
}
