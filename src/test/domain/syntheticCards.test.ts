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

  it("sanitises text AND image together (image wins, text dropped)", () => {
    // The schema used to reject; now it sanitises silently so old
    // persisted state can boot the plugin. Image wins (last write).
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 0, text: "X", image: "/y.png", size: "normal" }],
    });
    expect(parsed.success).toBe(true);
    const card = parsed.success ? (parsed.data.syntheticCards ?? [])[0] : null;
    expect(card?.image).toBe("/y.png");
    expect(card?.text).toBeUndefined();
  });

  it("sanitises link without text or image (link dropped, card becomes a gap)", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{
        position: 0, size: "normal",
        link: { type: "url", value: "https://example.com" },
      }],
    });
    expect(parsed.success).toBe(true);
    const card = parsed.success ? (parsed.data.syntheticCards ?? [])[0] : null;
    expect(card?.link).toBeUndefined();
  });

  it("sanitises link with invalid URL (link dropped)", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{
        position: 0, size: "normal", text: "Open",
        link: { type: "url", value: "not a url at all" },
      }],
    });
    expect(parsed.success).toBe(true);
    const card = parsed.success ? (parsed.data.syntheticCards ?? [])[0] : null;
    expect(card?.text).toBe("Open");
    expect(card?.link).toBeUndefined();
  });

  it("coerces bare hostnames in URL links to https://", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{
        position: 0, size: "normal", text: "Open",
        link: { type: "url", value: "example.com" },
      }],
    });
    expect(parsed.success).toBe(true);
    const card = parsed.success ? (parsed.data.syntheticCards ?? [])[0] : null;
    // Schema preserves the raw value (so the editor shows what the user
    // typed); the URL coercion + validation only gates whether the link
    // is kept. A bare hostname is treated as https://example.com for
    // validation purposes — link kept.
    expect(card?.link?.value).toBe("example.com");
  });

  it("collapses empty-string text/image to undefined", () => {
    const parsed = ShelfSchema.safeParse({
      ...base,
      syntheticCards: [{ position: 0, size: "normal", text: "", image: "" }],
    });
    expect(parsed.success).toBe(true);
    const card = parsed.success ? (parsed.data.syntheticCards ?? [])[0] : null;
    expect(card?.text).toBeUndefined();
    expect(card?.image).toBeUndefined();
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
