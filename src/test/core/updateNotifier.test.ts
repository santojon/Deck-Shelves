import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../core/connectivity", () => ({ isOnline: async () => true }));
vi.mock("../../components/ui/offlineMode", () => ({ isOfflineModeOn: () => false }));
vi.mock("../../runtime/logger", () => ({ logInfo: () => {}, logWarn: () => {}, logError: () => {} }));

import { checkForUpdate, __resetUpdateCheckCache } from "../../core/updateNotifier";

const ZIP_URL = "https://github.com/santojon/Deck-Shelves/releases/download/v99.0.0/deck-shelves-v99.0.0.zip";
const ZIP_DIGEST = `sha256:${"b".repeat(64)}`;

function serveRelease(assets: unknown[]): void {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ tag_name: "v99.0.0", html_url: "https://example.test/release", assets }),
  }));
}

describe("checkForUpdate release digest", () => {
  beforeEach(() => { __resetUpdateCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("takes the digest of the zip asset it picked, not of another asset", async () => {
    serveRelease([
      { name: "checksums.txt", browser_download_url: "https://example.test/checksums.txt", digest: `sha256:${"a".repeat(64)}` },
      { name: "deck-shelves-v99.0.0.zip", browser_download_url: ZIP_URL, digest: ZIP_DIGEST },
    ]);
    const r = await checkForUpdate();
    expect(r.hasUpdate).toBe(true);
    expect(r.assetName).toBe("deck-shelves-v99.0.0.zip");
    expect(r.assetUrl).toBe(ZIP_URL);
    expect(r.assetDigest).toBe(ZIP_DIGEST);
  });

  it("leaves the digest empty when the asset has none, so the download is refused", async () => {
    serveRelease([{ name: "deck-shelves-v99.0.0.zip", browser_download_url: ZIP_URL, digest: null }]);
    const r = await checkForUpdate();
    expect(r.assetUrl).toBe(ZIP_URL);
    expect(r.assetDigest).toBeNull();
  });

  it("ignores a digest that is not a string", async () => {
    serveRelease([{ name: "deck-shelves-v99.0.0.zip", browser_download_url: ZIP_URL, digest: { sha256: "b" } }]);
    expect((await checkForUpdate()).assetDigest).toBeNull();
  });
});
