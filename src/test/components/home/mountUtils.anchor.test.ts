// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../runtime/steamHost", () => ({
  getPreferredSteamDocument: () => document,
  getPreferredSteamWindow: () => window,
  getAllSteamDocuments: () => [document],
}));
vi.mock("../../../core/webpackCompat", () => ({ getRuntimeClassMap: () => null }));
vi.mock("../../../runtime/logger", () => ({ logInfo: vi.fn() }));

import { resolveAnchor, findOrCreateMount, ROOT_ID } from "../../../components/home/mountUtils";

/* Native Home as it looks right after boot: a scroll panel (overflow-y auto,
   nothing to scroll yet) holding only the recents block — title + a wrapper
   around the virtualized recents grid. */
function buildEarlyHome() {
  document.body.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "home-panel";
  panel.style.overflowY = "auto";
  const recents = document.createElement("div");
  recents.className = "recents-block";
  const title = document.createElement("h2");
  title.textContent = "Jogos recentes";
  const wrapper = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "ReactVirtualized__Grid";
  grid.setAttribute("aria-label", "Jogos recentes");
  wrapper.appendChild(grid);
  recents.append(title, wrapper);
  panel.appendChild(recents);
  document.body.appendChild(panel);
  return { panel, recents, wrapper };
}

function mountEl(): HTMLElement {
  const el = document.createElement("div");
  el.id = ROOT_ID;
  return el;
}

describe("mountUtils — anchor next to recents, never inside it", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("anchors after the recents block in the scroll panel even before the panel overflows", () => {
    const { panel, recents } = buildEarlyHome();
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(recents.nextSibling);
  });

  it("moves a mount that landed inside the recents block out to the panel", () => {
    const { panel, recents, wrapper } = buildEarlyHome();
    const mount = mountEl();
    recents.insertBefore(mount, wrapper.nextSibling);
    const found = findOrCreateMount();
    expect(found).toBe(mount);
    expect(mount.parentElement).toBe(panel);
    expect(mount.previousElementSibling).toBe(recents);
  });

  it("leaves a correctly placed mount alone", () => {
    const { panel, recents } = buildEarlyHome();
    const mount = mountEl();
    panel.appendChild(mount);
    const found = findOrCreateMount();
    expect(found).toBe(mount);
    expect(mount.parentElement).toBe(panel);
    expect(mount.previousElementSibling).toBe(recents);
  });

  it("creates a fresh mount as a sibling of the recents block", () => {
    const { panel, recents } = buildEarlyHome();
    const created = findOrCreateMount();
    expect(created?.parentElement).toBe(panel);
    expect(created?.previousElementSibling).toBe(recents);
  });
});
