// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const rawListeners = new Set<(e: any) => void>();
const keyListeners = new Set<(e: any) => void>();
vi.mock("../../runtime/controllerInput", () => ({
  subscribeControllerInput: (cb: (e: any) => void) => { rawListeners.add(cb); return () => { rawListeners.delete(cb); }; },
}));
vi.mock("../../runtime/homeInputBus", () => ({
  subscribeHomeKey: (cb: (e: any) => void) => { keyListeners.add(cb); return () => { keyListeners.delete(cb); }; },
}));
let focused: HTMLElement | null = null;
vi.mock("../../core/focusRestore", () => ({ getLastFocusedElement: () => focused }));

import { registerCardInput, registeredCardCount, __resetCardInputRegistryForTest } from "../../runtime/cardInputRegistry";
import { getPerfSnapshot, __resetPerfMetricsForTest } from "../../core/perfMetrics";

function card(): HTMLElement {
  const el = document.createElement("div");
  el.className = "ds-card";
  document.body.appendChild(el);
  return el;
}

describe("cardInputRegistry — one Home-wide subscription pair, dispatched to the focused card", () => {
  beforeEach(() => { __resetCardInputRegistryForTest(); __resetPerfMetricsForTest(); document.body.innerHTML = ""; focused = null; });

  it("holds exactly one raw and one key subscription however many cards register", () => {
    const a = card(), b = card(), c = card();
    const offA = registerCardInput(a, {}), offB = registerCardInput(b, {}), offC = registerCardInput(c, {});
    expect(registeredCardCount()).toBe(3);
    expect(rawListeners.size).toBe(1);
    expect(keyListeners.size).toBe(1);
    expect(getPerfSnapshot().activeSubscriptions).toBe(2);
    offA(); offB();
    expect(rawListeners.size).toBe(1);
    offC();
    expect(registeredCardCount()).toBe(0);
    expect(rawListeners.size).toBe(0);
    expect(keyListeners.size).toBe(0);
    expect(getPerfSnapshot().activeSubscriptions).toBe(0);
  });

  it("routes a press to the focused card's handlers only, ignoring releases", () => {
    const a = card(), b = card();
    const rawA = vi.fn(), rawB = vi.fn(), keyA = vi.fn(), keyB = vi.fn();
    registerCardInput(a, { raw: rawA, key: keyA });
    registerCardInput(b, { raw: rawB, key: keyB });
    focused = b;
    for (const l of rawListeners) l({ button: 11, pressed: true });
    for (const l of rawListeners) l({ button: 11, pressed: false });
    for (const l of keyListeners) l({ key: "x", code: "KeyX" });
    expect(rawB).toHaveBeenCalledTimes(1);
    expect(keyB).toHaveBeenCalledTimes(1);
    expect(rawA).not.toHaveBeenCalled();
    expect(keyA).not.toHaveBeenCalled();
  });

  it("falls back to the gpfocus class when the tracked element is stale, and stays quiet with no focus", () => {
    const a = card(), b = card();
    const rawA = vi.fn(), rawB = vi.fn();
    registerCardInput(a, { raw: rawA });
    registerCardInput(b, { raw: rawB });
    focused = document.createElement("span");
    b.classList.add("gpfocus");
    for (const l of rawListeners) l({ button: 1, pressed: true });
    expect(rawB).toHaveBeenCalledTimes(1);
    b.classList.remove("gpfocus");
    for (const l of rawListeners) l({ button: 1, pressed: true });
    expect(rawA).not.toHaveBeenCalled();
    expect(rawB).toHaveBeenCalledTimes(1);
  });

  it("a stale unregister never removes a newer registration for the same element", () => {
    const a = card();
    const first = registerCardInput(a, { raw: vi.fn() });
    const second = vi.fn();
    registerCardInput(a, { raw: second });
    first();
    expect(registeredCardCount()).toBe(1);
    focused = a;
    for (const l of rawListeners) l({ button: 2, pressed: true });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
