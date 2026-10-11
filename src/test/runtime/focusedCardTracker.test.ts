// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  subscribeFocusedCard,
  getFocusedCard,
  __resetFocusedCardTrackerForTest,
} from "../../runtime/focusedCardTracker";
import * as focusRestore from "../../core/focusRestore";
import * as sessionState from "../../runtime/sessionState";

// Captures the callbacks the tracker registers with the session state so a test
// can fire a game start/stop without Steam's app-lifetime notifications.
const captured = new Set<() => void>();
function sessionListeners(): (() => void)[] { return Array.from(captured); }
function mockSessionSubscribe(): void {
  captured.clear();
  vi.spyOn(sessionState, "subscribeSessionState").mockImplementation((cb: () => void) => {
    captured.add(cb);
    return () => { captured.delete(cb); };
  });
  // A game counts as running only when the lifetime event was seen AND the store agrees.
  vi.spyOn(sessionState, "isGameRunningByEvent").mockImplementation(() => ((globalThis as any).__testGameEvent === true));
}

function cardEl(): HTMLElement {
  const card = document.createElement("div");
  card.className = "ds-card";
  const child = document.createElement("span");
  card.appendChild(child);
  document.body.appendChild(card);
  return child; // the "focused" element is a descendant, like a real card's inner focus target
}

describe("focusedCardTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetFocusedCardTrackerForTest();
    mockSessionSubscribe();
  });

  afterEach(() => {
    __resetFocusedCardTrackerForTest();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("starts the shared poll on first subscriber and notifies on a focus change", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard((card) => seen.push(card));
    vi.advanceTimersByTime(150);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.classList.contains("ds-card")).toBe(true);
  });

  it("does not notify again while focus stays on the same card", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard((card) => seen.push(card));
    vi.advanceTimersByTime(150 * 5);
    expect(seen).toHaveLength(1);
  });

  it("stops the poll once the last subscriber unsubscribes", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const unsub = subscribeFocusedCard(() => {});
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unsub();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the poll alive while at least one subscriber remains", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const unsubA = subscribeFocusedCard(() => {});
    subscribeFocusedCard(() => {});
    unsubA();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it("getFocusedCard() reflects the last resolved card between ticks", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    subscribeFocusedCard(() => {});
    vi.advanceTimersByTime(150);
    expect(getFocusedCard()).not.toBeNull();
  });

  it("resolves null when focus is outside any .ds-card", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(outside);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard((card) => seen.push(card));
    vi.advanceTimersByTime(150);
    expect(seen).toEqual([]);
    expect(getFocusedCard()).toBeNull();
  });

  it("suspends the poll while a game runs and resumes when it stops", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const g = globalThis as any;
    g.SteamUIStore = { RunningApps: [{ appid: 1 }] };
    g.__testGameEvent = true;
    try {
      subscribeFocusedCard(() => {});
      expect(vi.getTimerCount()).toBe(0);
      g.SteamUIStore.RunningApps = []; g.__testGameEvent = false;
      for (const l of sessionListeners()) l();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      g.SteamUIStore.RunningApps = [{ appid: 1 }]; g.__testGameEvent = true;
      for (const l of sessionListeners()) l();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      delete g.SteamUIStore; delete g.__testGameEvent;
    }
  });

  it("stops itself on the next tick once a game is really running (event + store)", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const g = globalThis as any;
    try {
      subscribeFocusedCard(() => {});
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      g.SteamUIStore = { RunningApps: [{ appid: 1 }] }; g.__testGameEvent = true;
      vi.advanceTimersByTime(150);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      delete g.SteamUIStore; delete g.__testGameEvent;
    }
  });

  it("ignores a running-apps entry that never produced a lifetime event (failed launch)", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const g = globalThis as any;
    try {
      g.SteamUIStore = { RunningApps: [{ appid: 1 }] }; g.__testGameEvent = false;
      subscribeFocusedCard(() => {});
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      vi.advanceTimersByTime(300);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    } finally {
      delete g.SteamUIStore; delete g.__testGameEvent;
    }
  });

  it("isolates a throwing listener — other listeners still get notified", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard(() => { throw new Error("boom"); });
    subscribeFocusedCard((card) => seen.push(card));
    expect(() => vi.advanceTimersByTime(150)).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});
