import { describe, it, expect } from "vitest";
import { discountBadgeModeOf, discountBadgeText } from "../../../components/shelf/discountBadge";

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
});
