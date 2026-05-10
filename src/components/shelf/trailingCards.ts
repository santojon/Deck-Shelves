import { REFRESHABLE_SMART_MODES } from "./types";

export type TrailingCardInput = {
  source: any;
  sort?: string;
  hideSeeMore?: boolean;
  hideRefreshCard?: boolean;
  globalHideSeeMore?: boolean;
  globalHideRefreshCard?: boolean;
};

function isRandomNonSmart(src: any, sort: string | undefined): boolean {
  if (src?.type === "smart") return false;
  if (sort === "random") return true;
  return src?.type === "filter" && src?.filter?.sort === "random";
}

export function shouldShowRefreshCard(input: TrailingCardInput): boolean {
  if (input.globalHideRefreshCard === true || input.hideRefreshCard === true) return false;
  const src = input.source;
  if (src?.type === "smart") return REFRESHABLE_SMART_MODES.includes(src.mode);
  return isRandomNonSmart(src, input.sort);
}

export function shouldShowMoreCard(input: TrailingCardInput): boolean {
  if (input.globalHideSeeMore === true || input.hideSeeMore === true) return false;
  return input.source?.type !== "smart";
}
