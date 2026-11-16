import { describe, it, expect } from "vitest";
import { discountBadgeModeOf, discountBadgeText, resolveDiscountBadgeModes } from "../../../components/shelf/discountBadge";

describe("discount badge", () => {
  it("reads the setting, falling back to the percentage", () => {
    expect(discountBadgeModeOf("price")).toBe("price");
    expect(discountBadgeModeOf("both")).toBe("both");
    expect(discountBadgeModeOf(undefined)).toBe("percent");
    expect(discountBadgeModeOf("nope")).toBe("percent");
  });

  it("shows the percentage, the store's own price text, or both; without a price text the percentage", () => {
    expect(discountBadgeText("percent", "R$ 4,99", "50% off")).toBe("50% off");
    expect(discountBadgeText("price", "R$ 4,99", "50% off")).toBe("R$ 4,99");
    expect(discountBadgeText("both", "$4.99", "50% off")).toBe("$4.99 · 50% off");
    expect(discountBadgeText("price", undefined, "50% off")).toBe("50% off");
    expect(discountBadgeText("both", "", "50% off")).toBe("50% off");
  });

  it("has both orders: price then discount, and discount then price", () => {
    expect(discountBadgeModeOf("percent_price")).toBe("percent_price");
    expect(discountBadgeText("percent_price", "$4.99", "50% off")).toBe("50% off · $4.99");
    expect(discountBadgeText("percent_price", undefined, "50% off")).toBe("50% off");
  });

  it("lets a global mode win, leaves null to the shelf, and has the selected card follow the normal mode unless set", () => {
    expect(resolveDiscountBadgeModes({ discountBadgeMode: null }, { discountBadgeMode: "price" })).toEqual({ normal: "price", focused: "price" });
    expect(resolveDiscountBadgeModes({ discountBadgeMode: "both" }, { discountBadgeMode: "price" })).toEqual({ normal: "both", focused: "both" });
    expect(resolveDiscountBadgeModes({}, { discountBadgeMode: "percent", discountBadgeFocusMode: "percent_price" })).toEqual({ normal: "percent", focused: "percent_price" });
    expect(resolveDiscountBadgeModes({ discountBadgeFocusMode: "price" }, { discountBadgeFocusMode: "both" })).toEqual({ normal: "percent", focused: "price" });
    expect(resolveDiscountBadgeModes(null, undefined)).toEqual({ normal: "percent", focused: "percent" });
  });
});
