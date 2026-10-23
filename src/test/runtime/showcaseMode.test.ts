// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const edge = vi.hoisted(() => ({
  preferred: null as Document | null,
  settings: null as Record<string, unknown> | null,
  focus: vi.fn((_el: unknown) => true),
}));

vi.mock("../../runtime/steamHost", () => ({ getPreferredSteamDocument: () => edge.preferred }));
vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => edge.settings,
  subscribeSettings: () => () => {},
}));
vi.mock("../../core/focusRestore", () => ({ focusElement: (el: unknown) => edge.focus(el) }));
vi.mock("../../runtime/controllerInput", () => ({ subscribeControllerInput: () => () => {} }));
vi.mock("../../steam/smartShelves", () => ({ evalVisibility: () => true }));

import { installShowcaseMode } from "../../runtime/showcaseMode";

const START_AFTER_S = 60;

// A Home window of its own (as Big Picture's), visible and focused, with one shelf of two cards.
function homeDocument(): Document {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = `<div data-shelfid="s1"><div data-ds-card-index="0"></div><div data-ds-card-index="1"></div></div>`;
  Object.defineProperty(doc, "hidden", { value: false });
  doc.hasFocus = () => true;
  return doc;
}

const fire = (doc: Document, type: string) => doc.dispatchEvent(new (doc.defaultView as any).Event(type));
const press = (doc: Document) => doc.dispatchEvent(new (doc.defaultView as any).KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

describe("showcase mode: what counts as interaction", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    edge.focus.mockClear();
    edge.settings = {
      showcaseModeEnabled: true,
      showcaseStartAfterSeconds: START_AFTER_S,
      showcaseDwellSeconds: 5,
      showcaseStopOnInteraction: true,
      shelves: [{ id: "s1", enabled: true, hidden: false }],
    };
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("input on the Home's document stops it, also when that document was found after install", async () => {
    edge.preferred = document; // the plugin's own context: the Home is not found yet
    dispose = installShowcaseMode();
    const home = homeDocument();
    edge.preferred = home;
    // The first wait watched another document, so it does not count: a full wait on the Home's follows.
    await vi.advanceTimersByTimeAsync(START_AFTER_S * 1000);
    expect(edge.focus).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(START_AFTER_S * 1000);
    expect(edge.focus).toHaveBeenCalledTimes(1);
    press(home);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(edge.focus).toHaveBeenCalledTimes(1);
  });

  it("keys stop it although Big Picture handles them on its window and stops them there", async () => {
    const home = homeDocument();
    // Like Big Picture's own key handling: on the window, capture phase, the key goes no further.
    home.defaultView!.addEventListener("keydown", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    edge.preferred = home;
    dispose = installShowcaseMode();
    await vi.advanceTimersByTimeAsync(START_AFTER_S * 1000);
    expect(edge.focus).toHaveBeenCalledTimes(1);
    press(home);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(edge.focus).toHaveBeenCalledTimes(1);
  });

  it("input on the Home's document resets the wait: it starts one full wait after the last input", async () => {
    const home = homeDocument();
    edge.preferred = home;
    dispose = installShowcaseMode();
    for (const type of ["wheel", "pointerdown", "keydown"]) {
      await vi.advanceTimersByTimeAsync((START_AFTER_S - 10) * 1000);
      fire(home, type);
    }
    await vi.advanceTimersByTimeAsync(START_AFTER_S * 1000 - 1);
    expect(edge.focus).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(edge.focus).toHaveBeenCalledTimes(1);
  });

  it("while it runs, it follows the document it acts in", async () => {
    const first = homeDocument();
    edge.preferred = first;
    dispose = installShowcaseMode();
    await vi.advanceTimersByTimeAsync(START_AFTER_S * 1000);
    expect(edge.focus).toHaveBeenCalledTimes(1);
    const second = homeDocument();
    edge.preferred = second;
    await vi.advanceTimersByTimeAsync(5_000); // the next card, now in the new document
    expect(edge.focus).toHaveBeenCalledTimes(2);
    press(second);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(edge.focus).toHaveBeenCalledTimes(2);
  });

  it("input on a document it no longer acts in does not count, and stopping removes its listeners", async () => {
    const first = homeDocument();
    edge.preferred = first;
    dispose = installShowcaseMode();
    const second = homeDocument(); // the Home drawn again in a new window
    edge.preferred = second;
    await vi.advanceTimersByTimeAsync(2 * START_AFTER_S * 1000);
    expect(edge.focus).toHaveBeenCalled();
    const shown = edge.focus.mock.calls.length;
    press(first);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(edge.focus.mock.calls.length).toBeGreaterThan(shown);
    const removed = vi.spyOn(second.defaultView!, "removeEventListener");
    dispose();
    dispose = null;
    expect(removed.mock.calls.map((c) => c[0]).sort()).toEqual(["keydown", "pointerdown", "wheel"]);
  });
});
