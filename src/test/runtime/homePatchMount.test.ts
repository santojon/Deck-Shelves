// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stubSteamLocalizer, clearSteamLocalizer } from "../fixtures/steamLocalizer";

function buildHome(): { panel: HTMLElement; recents: HTMLElement } {
  document.body.innerHTML = "";
  const panel = document.createElement("div");
  panel.style.overflowY = "auto";
  const recents = document.createElement("div");
  recents.setAttribute("aria-label", "Recent Games");
  const nextRow = document.createElement("div");
  panel.append(recents, nextRow);
  document.body.appendChild(panel);
  return { panel, recents };
}

function mountMutations(panel: HTMLElement, mount: HTMLElement, run: () => void): number {
  const observer = new MutationObserver(() => {});
  observer.observe(panel, { childList: true });
  run();
  const records = observer.takeRecords();
  observer.disconnect();
  return records.filter((r) => [...Array.from(r.removedNodes), ...Array.from(r.addedNodes)].includes(mount)).length;
}

describe("fallback mount placement", () => {
  beforeEach(() => { vi.resetModules(); stubSteamLocalizer(); });
  afterEach(() => { clearSteamLocalizer(); document.body.innerHTML = ""; });

  it("a mount already right after the recents row is not removed and re-added on the next pass", async () => {
    const { ensureMount } = await import("../../runtime/homePatchMount");
    const { panel, recents } = buildHome();
    const mount = ensureMount()!;
    expect(mount.previousElementSibling).toBe(recents);
    expect(mountMutations(panel, mount, () => { expect(ensureMount()).toBe(mount); })).toBe(0);
    expect(mount.previousElementSibling).toBe(recents);
  });

  it("a mount that sits elsewhere still moves next to the recents row", async () => {
    const { ensureMount } = await import("../../runtime/homePatchMount");
    const { panel, recents } = buildHome();
    const mount = ensureMount()!;
    panel.appendChild(mount);
    expect(mount.previousElementSibling).not.toBe(recents);
    expect(mountMutations(panel, mount, () => { ensureMount(); })).toBeGreaterThan(0);
    expect(mount.previousElementSibling).toBe(recents);
  });
});
