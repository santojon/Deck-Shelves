import { describe, expect, it } from "vitest";
import { ShelfSchema } from "../../types";

// synthetic card schema rules. The Zod superRefine on
// `ShelfSchema.syntheticCards` encodes the user-facing rules:
//   - text and image are mutually exclusive
//   - link requires text OR image (no link on pure-gap cards)
//   - both unset is fine (renders as a non-focusable gap)
//   - placeholder + alpha + size are all independent

const base = {
  id: "shelf_a",
  title: "Demo",
  source: { type: "tab", tab: "all" } as any,
};

describe("ShelfSchema.syntheticCards", () => {
  it("accepts a pure gap (no text, no image, no link)", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 0, size: "normal" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts text-only with no link", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 1, text: "Section A", size: "normal" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts image-only with no link", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 2, image: "/tmp/banner.png", size: "featured" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts image + url link (focusable card)", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{
        position: 0, image: "/tmp/b.png", size: "normal",
        link: { type: "url", value: "https://example.com" },
      }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects text AND image together", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 0, text: "X", image: "/y.png", size: "normal" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects link without text or image (would be a non-focusable card with a link)", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{
        position: 0, size: "normal",
        link: { type: "url", value: "https://example.com" },
      }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects sizes other than normal / featured (reduced / stack land later)", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 0, size: "stack" as any }],
    });
    expect(parsed.success).toBe(false);
  });

  it("placeholder + alpha + size are independent of content", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 0, size: "normal", placeholder: true, alpha: 0.6 }],
    });
    expect(parsed.success).toBe(true);
  });
});
