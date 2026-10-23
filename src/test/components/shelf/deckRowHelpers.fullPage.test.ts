import { describe, it, expect } from "vitest";
import { computeShelfRootStyle } from "../../../components/shelf/deckRowHelpers";

const base = { heroEnabled: true, enableLogo: false, enableDescription: false, hideStatusLine: false, infoAbove: false, logoBelowShelf: false, logoBandPx: 0 };

describe("full-page shelf box", () => {
  it("keeps the hero band inside the 100vh box so the first shelf is as tall as the others", () => {
    const full = computeShelfRootStyle({ ...base, fullPageLayoutActive: true } as any);
    expect(full.minHeight).toBe("100vh");
    expect(full.boxSizing).toBe("border-box");
    expect(full.justifyContent).toBe("flex-end");
    const compact = computeShelfRootStyle({ ...base, fullPageLayoutActive: false } as any);
    expect(compact.minHeight).toBeUndefined();
    expect(compact.boxSizing).toBeUndefined();
  });
});
