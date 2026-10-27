import { describe, expect, it } from "vitest";
import { snapshotAge } from "../../components/settings/details/LastSnapshotLine";

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

describe("how long ago the last snapshot was made", () => {
  it("in the largest whole unit, in the UI language", () => {
    expect(snapshotAge(NOW / 1000 - 3 * 3600, NOW, "en")).toBe("3 hours ago");
    expect(snapshotAge(NOW / 1000 - 2 * 86400, NOW, "en")).toBe("2 days ago");
    expect(snapshotAge(NOW / 1000 - 5 * 60, NOW, "pt-BR")).toBe("há 5 minutos");
  });

  it("a snapshot from the last minute (or a clock ahead) reads as now", () => {
    expect(snapshotAge(NOW / 1000 - 10, NOW, "en")).toBe("this minute");
    expect(snapshotAge(NOW / 1000 + 60, NOW, "en")).toBe("this minute");
  });
});
