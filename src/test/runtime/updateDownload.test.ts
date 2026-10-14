import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UpdateCheckResult } from "../../core/updateNotifier";

// Every collaborator is replaced by a recorder so each test can assert the exact
// order of modal, host and toast calls around a self-install.
const events: string[] = [];
let selfInstall = true;
let applyUpdateImpl: () => Promise<void> = async () => {};

vi.mock("../../shims/host-api", () => ({
  call: async (method: string) => {
    events.push(`call:${method}`);
    return { ok: true, path: "/tmp/update.zip" };
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
vi.mock("../../index", () => ({
  getHostApi: () => ({
    updates: {
      canSelfInstall: () => selfInstall,
      applyUpdate: () => {
        events.push("applyUpdate");
        return applyUpdateImpl();
      },
    },
  }),
}));
vi.mock("../../components/qam/common/openManagedModal", () => ({
  openManagedModal: (render: (close: () => void) => unknown) => {
    const close = () => { events.push("closeModal"); };
    render(close);
    events.push("openModal");
    return close;
  },
}));
vi.mock("../../components/update/UpdateInstallingModal", () => ({ UpdateInstallingModal: () => null }));

import { installOrDownloadUpdate, canSelfInstallUpdate } from "../../runtime/updateDownload";

const release: UpdateCheckResult = {
  hasUpdate: true,
  currentVersion: "3.3.4",
  latestVersion: "3.4.0",
  releaseUrl: "https://example.test/releases/3.4.0",
  assetUrl: "https://example.test/releases/deck-shelves.zip",
  assetName: "deck-shelves.zip",
  checkedAt: 0,
};

describe("installOrDownloadUpdate", () => {
  beforeEach(() => {
    events.length = 0;
    selfInstall = true;
    applyUpdateImpl = async () => {};
  });

  it("closes the progress modal after a successful self-install and keeps the success toast", async () => {
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "openModal",
      "toast:update:update_installing",
      "applyUpdate",
      "closeModal",
      "toast:success:update_installed",
    ]);
  });

  it("closes the modal once, reports the failure and falls back to the manual download", async () => {
    applyUpdateImpl = async () => { throw new Error("swap failed"); };
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "openModal",
      "toast:update:update_installing",
      "applyUpdate",
      "closeModal",
      "toast:error:update_install_failed",
      "toast:update:update_downloading",
      "call:download_release",
      "toast:success:update_downloaded",
    ]);
  });

  it("asks for a retry, without the download fallback, while the host runs its own update check", async () => {
    applyUpdateImpl = async () => { throw new Error("applyUpdate: busy: an update check is in flight, try again shortly"); };
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "openModal",
      "toast:update:update_installing",
      "applyUpdate",
      "closeModal",
      "toast:update:update_install_busy",
    ]);
  });

  it("asks for a retry on any busy: rejection", async () => {
    applyUpdateImpl = async () => { throw new Error("applyUpdate: busy: a rollback is running"); };
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "openModal",
      "toast:update:update_installing",
      "applyUpdate",
      "closeModal",
      "toast:update:update_install_busy",
    ]);
  });

  it("treats an I/O error that merely mentions busy as a failed install", async () => {
    applyUpdateImpl = async () => { throw new Error("applyUpdate: swap failed: Device or resource busy (os error 16)"); };
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "openModal",
      "toast:update:update_installing",
      "applyUpdate",
      "closeModal",
      "toast:error:update_install_failed",
      "toast:update:update_downloading",
      "call:download_release",
      "toast:success:update_downloaded",
    ]);
  });

  it("downloads without a modal when the host cannot self-install", async () => {
    selfInstall = false;
    expect(canSelfInstallUpdate()).toBe(false);
    await installOrDownloadUpdate(release);
    expect(events).toEqual([
      "toast:update:update_downloading",
      "call:download_release",
      "toast:success:update_downloaded",
    ]);
  });

  it("does nothing without a check result", async () => {
    await installOrDownloadUpdate(null);
    expect(events).toEqual([]);
  });
});
