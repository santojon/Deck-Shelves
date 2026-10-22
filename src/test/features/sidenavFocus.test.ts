// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const tracker = vi.hoisted(() => ({ cb: null as null | ((card: HTMLElement | null) => void), unsubscribed: 0 }));
vi.mock("../../runtime/focusedCardTracker", () => ({
  subscribeFocusedCard: (cb: (card: HTMLElement | null) => void) => {
    tracker.cb = cb;
    return () => { tracker.unsubscribed++; tracker.cb = null; };
  },
}));
vi.mock("../../core/focusRestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/focusRestore")>();
  return { ...actual, focusElement: vi.fn(() => true), focusElementAuto: vi.fn(() => false) };
});

import { watchLastFocusedCard, focusNativeRecentsFirstCard, type LastFocusedCard } from "../../features/sidenav/ShelfSideNav";
import { focusElement, focusElementAuto } from "../../core/focusRestore";

function shelf(shelfId: string, appid: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "ds-shelf";
  el.setAttribute("data-shelfid", shelfId);
  const card = document.createElement("div");
  card.className = "ds-card";
  card.setAttribute("data-appid", String(appid));
  el.appendChild(card);
  document.body.appendChild(el);
  return card;
}

describe("side nav — last focused card comes from the shared focus poll", () => {
  let observers: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    tracker.cb = null; tracker.unsubscribed = 0;
    observers = vi.spyOn(globalThis as any, "MutationObserver").mockImplementation(() => { throw new Error("no observer expected"); });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("creates no MutationObserver and updates the anchor when the focused card changes", () => {
    const seen: LastFocusedCard[] = [];
    const stop = watchLastFocusedCard(document, (c) => seen.push(c));
    expect(observers).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    const a = shelf("s1", 10);
    const b = shelf("s2", 20);
    tracker.cb!(a);
    tracker.cb!(b);
    expect(seen).toEqual([{ shelfId: "s1", appid: 10 }, { shelfId: "s2", appid: 20 }]);
    stop();
    expect(tracker.unsubscribed).toBe(1);
  });

  it("falls back to the gpfocus class when the poll reports no card (mouse / hover focus)", () => {
    const seen: LastFocusedCard[] = [];
    const card = shelf("s1", 10);
    card.classList.add("gpfocus");
    watchLastFocusedCard(document, (c) => seen.push(c));
    expect(seen).toEqual([{ shelfId: "s1", appid: 10 }]);
    card.classList.remove("gpfocus");
    tracker.cb!(null);
    expect(seen).toHaveLength(1);
  });

  it("ignores a focused card that sits outside any shelf", () => {
    const seen: LastFocusedCard[] = [];
    const stray = document.createElement("div");
    stray.className = "ds-card";
    stray.setAttribute("data-appid", "5");
    document.body.appendChild(stray);
    watchLastFocusedCard(document, (c) => seen.push(c));
    tracker.cb!(stray);
    expect(seen).toEqual([]);
  });
});

/* The native recents row as the side nav finds it: a container carrying the
   class the class map names, big enough on screen, holding a native card. */
function nativeRecentsRow(): HTMLElement {
  (globalThis as any).__DS_CLASS_MAP = { nativeShelfContainer: "native-shelf" };
  const row = document.createElement("div");
  row.className = "native-shelf";
  row.getBoundingClientRect = () => ({ top: 0, left: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON() {} });
  const card = document.createElement("a");
  card.setAttribute("href", "/library/app/620");
  row.appendChild(card);
  document.body.appendChild(row);
  return card;
}

describe("side nav — the native recents landing", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    delete (globalThis as any).__DS_CLASS_MAP;
  });

  it("the user's pick from the menu moves the focus even while the gate holds the Home", () => {
    const card = nativeRecentsRow();
    focusNativeRecentsFirstCard(document, false);
    expect(focusElement).toHaveBeenCalledWith(card);
    expect(focusElementAuto).not.toHaveBeenCalled();
  });

  it("the automatic landing goes through the gate", () => {
    const card = nativeRecentsRow();
    focusNativeRecentsFirstCard(document);
    expect(focusElementAuto).toHaveBeenCalledWith(card);
    expect(focusElement).not.toHaveBeenCalled();
  });
});
