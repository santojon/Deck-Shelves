export type DiscountBadgeMode = "percent" | "price" | "both" | "percent_price";

export const DISCOUNT_BADGE_MODES: readonly DiscountBadgeMode[] = ["percent", "price", "both", "percent_price"];

export function discountBadgeModeOf(value: unknown): DiscountBadgeMode {
  return value === "price" || value === "both" || value === "percent_price" ? value : "percent";
}

export function discountBadgeText(mode: DiscountBadgeMode, priceText: string | undefined, percentText: string): string {
  if (mode === "price" && priceText) return priceText;
  if (mode === "both" && priceText) return `${priceText} · ${percentText}`;
  if (mode === "percent_price" && priceText) return `${percentText} · ${priceText}`;
  return percentText;
}

export function isDiscountBadgeMode(value: unknown): value is DiscountBadgeMode {
  return (DISCOUNT_BADGE_MODES as readonly unknown[]).includes(value);
}

export type DiscountBadgeModes = { normal: DiscountBadgeMode; focused: DiscountBadgeMode };

const modeOrUndefined = (value: unknown): DiscountBadgeMode | undefined => (isDiscountBadgeMode(value) ? value : undefined);

// A global value wins and null there leaves it to the shelf; the selected card follows the normal one unless set.
export function resolveDiscountBadgeModes(settings: any, shelf: any): DiscountBadgeModes {
  const normal = modeOrUndefined(settings?.discountBadgeMode) ?? modeOrUndefined(shelf?.discountBadgeMode) ?? "percent";
  const focused = modeOrUndefined(settings?.discountBadgeFocusMode) ?? modeOrUndefined(shelf?.discountBadgeFocusMode) ?? normal;
  return { normal, focused };
}
