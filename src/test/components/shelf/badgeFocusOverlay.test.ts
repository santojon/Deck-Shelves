// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

const live = vi.hoisted(() => ({ settings: null as any }));
vi.mock("../../../store/settingsStore", async (orig) => ({ ...(await orig<any>()), getCurrentSettings: () => live.settings }));

import { overlayStateFor } from "../../../components/shelf/BadgeFocusOverlay";

const card = (attrs: Record<string, string>) => {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const rect = { left: 10, top: 20, width: 100 };

describe("focus badge", () => {
  it("keeps the selected card's price and shows its shelf's selected-card mode", () => {
    live.settings = { discountBadgeMode: null, shelves: [{ id: "w", discountBadgeMode: "percent", discountBadgeFocusMode: "percent_price" }] };
    const state = overlayStateFor(card({ "data-discount": "50", "data-price": "$4.99", "data-shelfid": "w" }), rect);
    expect(state).toMatchObject({ left: 10, top: 20, width: 100, discount: 50, priceText: "$4.99", mode: "percent_price" });
  });

  it("follows the shelf's normal mode when no selected-card mode is set, and a global one wins", () => {
    live.settings = { shelves: [{ id: "w", discountBadgeMode: "price" }] };
    expect(overlayStateFor(card({ "data-discount": "30", "data-shelfid": "w" }), rect)?.mode).toBe("price");
    live.settings = { discountBadgeFocusMode: "both", shelves: [{ id: "w", discountBadgeFocusMode: "price" }] };
    expect(overlayStateFor(card({ "data-discount": "30", "data-shelfid": "w" }), rect)?.mode).toBe("both");
  });

  it("uses the percentage for a card of no saved shelf, and shows nothing without a badge", () => {
    live.settings = null;
    expect(overlayStateFor(card({ "data-discount": "30" }), rect)?.mode).toBe("percent");
    expect(overlayStateFor(card({}), rect)).toBeNull();
  });
});
