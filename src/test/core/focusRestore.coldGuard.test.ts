// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ state: "active" as string }));
vi.mock("../../runtime/powerGate", () => ({
  getPowerState: () => gate.state,
  homeRouteCovered: () => false,
  registerPeriodic: () => () => {},
}));

import { beginColdBootFocusGuard, clearFocusTarget } from "../../core/focusRestore";

describe("cold-boot focus guard", () => {
  beforeEach(() => { vi.useFakeTimers(); gate.state = "active"; });
  afterEach(() => { clearFocusTarget(); vi.useRealTimers(); document.body.innerHTML = ""; });

  it("keeps polling while the Home is active", async () => {
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stands down, with no timer left, once a game holds the Home", async () => {
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(400);
    gate.state = "in-game";
    await vi.advanceTimersByTimeAsync(400);
    expect(vi.getTimerCount()).toBe(0);
  });
});
