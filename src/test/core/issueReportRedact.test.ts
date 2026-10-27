import { describe, expect, it, vi } from "vitest";

vi.mock("../../runtime/diagnosticsInfo", () => ({}));
vi.mock("../../runtime/diagnostics", () => ({ getDiagnostics: () => [] }));
vi.mock("../../runtime/deviceState", () => ({ getDeviceProfile: () => null }));
vi.mock("../../core/perfMetrics", () => ({ getPerfSnapshot: () => null }));
vi.mock("../../core/adaptiveTimeout", () => ({ getLearnedTimeoutsSummary: () => "" }));
vi.mock("../../steam/smartShelves", () => ({ getSmartShelfCacheStats: () => ({}) }));
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => null }));
vi.mock("../../core/updateNotifier", () => ({ openExternalUrl: () => {} }));
vi.mock("../../components/ui/clipboard", () => ({ copyToClipboard: async () => true }));
vi.mock("../../components/notify", () => ({ notify: () => {} }));

import { redactAccountIds } from "../../core/issueReport";

describe("what a bug report carries", () => {
  it("never a SteamID64, wherever it appears", () => {
    const text = "user 76561198000000001 failed; url /profiles/76561197960287930/ ok";
    const out = redactAccountIds(text);
    expect(out).not.toMatch(/7656119\d{10}/);
    expect(out).toBe("user [steamid] failed; url /profiles/[steamid]/ ok");
  });

  it("leaves other numbers alone", () => {
    expect(redactAccountIds("appid 1222680, build 1792626604")).toBe("appid 1222680, build 1792626604");
  });
});
