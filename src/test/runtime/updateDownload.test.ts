import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UpdateCheckResult } from "../../core/updateNotifier";

const events: string[] = [];
let downloadReply: { ok: boolean; path?: string; error?: string } = { ok: true, path: "/tmp/update.zip" };
const calls: unknown[] = [];

vi.mock("../../shims/host-api", () => ({
  call: async (method: string, arg: unknown) => {
    events.push(`call:${method}`);
    calls.push(arg);
    return downloadReply;
  },
}));
vi.mock("../../runtime/notify", () => ({
  notifyUser: (_title: string, body: string, type: string) => { events.push(`toast:${type}:${body}`); },
}));
vi.mock("../../core/updateNotifier", () => ({
  openReleaseUrl: () => { events.push("openRelease"); },
}));
vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../runtime/logger", () => ({ logInfo: () => {}, logWarn: () => {}, logError: () => {} }));

import { installOrDownloadUpdate } from "../../runtime/updateDownload";

const release: UpdateCheckResult = {
  hasUpdate: true,
  currentVersion: "3.3.4",
  latestVersion: "3.4.0",
  releaseUrl: "https://example.test/releases/3.4.0",
  assetUrl: "https://example.test/releases/deck-shelves.zip",
  assetName: "deck-shelves.zip",
  assetDigest: `sha256:${"a".repeat(64)}`,
  checkedAt: 0,
};

describe("installOrDownloadUpdate", () => {
  beforeEach(() => {
    events.length = 0;
    calls.length = 0;
    downloadReply = { ok: true, path: "/tmp/update.zip" };
  });

  it("downloads the release asset and reports where it went", async () => {
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "toast:update:update_downloading",
      "call:download_release",
      "toast:success:update_downloaded",
    ]);
  });

  it("sends the release digest with the download", async () => {
    await installOrDownloadUpdate(release);
    expect(calls).toEqual([{ url: release.assetUrl, filename: release.assetName, sha256: release.assetDigest }]);
  });

  it("refuses to download a release asset without a digest and offers nothing to install", async () => {
    await installOrDownloadUpdate({ ...release, assetDigest: null });
    expect(events).toEqual(["toast:error:update_verify_failed"]);
  });

  it("offers nothing to install when the backend rejects the digest", async () => {
    downloadReply = { ok: false, error: "digest_mismatch" };
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "toast:update:update_downloading",
      "call:download_release",
      "toast:error:update_verify_failed",
    ]);
  });

  it("keeps the release page fallback for an ordinary download error", async () => {
    downloadReply = { ok: false, error: "timed out" };
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "toast:update:update_downloading",
      "call:download_release",
      "toast:error:update_download_failed",
      "openRelease",
    ]);
  });

  it("does nothing without a check result", async () => {
    await installOrDownloadUpdate(null);
    expect(events).toEqual([]);
  });
});
