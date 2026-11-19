// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stubSteamLocalizer, clearSteamLocalizer } from "../fixtures/steamLocalizer";

const GRACE_MS = 2500;
const COLLAPSE_PROPS = ["display", "visibility", "height", "min-height", "max-height", "overflow"];

function buildHome(): HTMLElement {
  document.body.innerHTML = "";
  const panel = document.createElement("div");
  const recents = document.createElement("div");
  recents.setAttribute("aria-label", "Recent Games");
  const mount = document.createElement("div");
  mount.id = "deck-shelves-home-root";
  panel.append(recents, mount);
  document.body.appendChild(panel);
  return recents;
}

const loadRecents = () => import("../../runtime/homePatchRecents");

function expectReleased(row: HTMLElement): void {
  for (const p of COLLAPSE_PROPS) expect(row.style.getPropertyValue(p)).toBe("");
  expect(row.hasAttribute("data-ds-hidden-collapse")).toBe(false);
}

describe("recents collapse marker", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); stubSteamLocalizer(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); clearSteamLocalizer(); document.body.innerHTML = ""; });

  it("a row collapsed before the grace period is restored by a fresh instance", async () => {
    const recents = buildHome();
    (await loadRecents()).applyHideRecents(true);
    expect(recents.style.getPropertyValue("visibility")).toBe("hidden");
    vi.resetModules();
    (await loadRecents()).applyRecentsCollapse(false);
    expectReleased(recents);
  });

  it("a row that holds one of our shelves is restored by a fresh instance", async () => {
    const recents = buildHome();
    const first = await loadRecents();
    first.applyHideRecents(true);
    vi.advanceTimersByTime(GRACE_MS);
    const ours = document.createElement("div");
    ours.className = "ds-shelf";
    recents.appendChild(ours);
    first.applyHideRecents(true);
    expect(recents.style.getPropertyValue("display")).toBe("");
    expect(recents.style.getPropertyValue("height")).toBe("0px");
    vi.resetModules();
    (await loadRecents()).applyRecentsCollapse(false);
    expectReleased(recents);
  });

  it("the soft collapse is marked apart from the hard collapse the game menu looks for", async () => {
    const recents = buildHome();
    (await loadRecents()).applyHideRecents(true);
    expect(recents.getAttribute("data-ds-hidden-collapse")).toBe("0");
    expect(recents.matches('[data-ds-hidden-collapse="1"]')).toBe(false);
    vi.advanceTimersByTime(GRACE_MS);
    expect(recents.getAttribute("data-ds-hidden-collapse")).toBe("1");
    expect(recents.style.getPropertyValue("display")).toBe("none");
  });
});
