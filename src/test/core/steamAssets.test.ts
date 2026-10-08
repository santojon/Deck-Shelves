import { describe, it, expect } from "vitest";
import { buildSteamstaticUrl, buildAkamaiUrl, buildLoopbackUrl } from "../../core/steamAssets";
import { bumpAssetRevision, getAssetRevision } from "../../core/assetRevision";

describe("steamAssets URL builders", () => {
  it("omits the revision buster on immutable remote CDN art", () => {
    expect(buildSteamstaticUrl(440, "library_hero.jpg")).not.toContain("r=");
    expect(buildAkamaiUrl(440, "library_hero.jpg")).not.toContain("r=");
  });

  it("keeps remote CDN URLs stable across a revision bump", () => {
    const before = buildSteamstaticUrl(440, "logo.png");
    const beforeAk = buildAkamaiUrl(440, "header.jpg");
    bumpAssetRevision();
    expect(buildSteamstaticUrl(440, "logo.png")).toBe(before);
    expect(buildAkamaiUrl(440, "header.jpg")).toBe(beforeAk);
  });

  it("still busts local loopback art so a custom-art write shows on return", () => {
    const rev = getAssetRevision();
    expect(buildLoopbackUrl(440, "library_hero.jpg", "7")).toContain(`r=${rev}`);
    expect(buildLoopbackUrl(440, "library_hero.jpg", "7")).toContain("c=7");
  });
});
