import { describe, expect, it, vi } from "vitest";

vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));

const { remoteCardState } = await import("../../components/shelf/gameCardHooks");

// Steam's own values: 20 UpdateRequired, 19 UpdateQueued, 18 UpdatePaused, 6 Updating, 11 ReadyToLaunch.
describe("the card hint for a copy installed only on another device", () => {
  it("follows that copy's update, as Steam's first menu item does", () => {
    expect(remoteCardState({ installed: true, display_status: 20 }).label).toBe("menu_update");
    expect(remoteCardState({ installed: true, display_status: 19 }).label).toBe("menu_update");
    expect(remoteCardState({ installed: true, display_status: 18 }).label).toBe("menu_update");
    expect(remoteCardState({ installed: true, display_status: 6, status_percentage: 58 }).label).toBe("menu_pause");
  });

  it("is Stream when that copy is ready", () => {
    expect(remoteCardState({ installed: true, display_status: 11 })).toEqual({ label: "menu_stream", action: "run" });
  });
});
