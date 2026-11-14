export type DiscountBadgeMode = "percent" | "price" | "both";

export function discountBadgeModeOf(value: unknown): DiscountBadgeMode {
  return value === "price" || value === "both" ? value : "percent";
}

// What the badge says: the percentage, the sale price when the store gave one, or both.
export function discountBadgeText(mode: DiscountBadgeMode, priceText: string | undefined, percentText: string): string {
  if (mode === "price" && priceText) return priceText;
  if (mode === "both" && priceText) return `${priceText} · ${percentText}`;
  return percentText;
}
