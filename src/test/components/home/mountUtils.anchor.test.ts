// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../runtime/steamHost", () => ({
  getPreferredSteamDocument: () => document,
  getPreferredSteamWindow: () => window,
  getAllSteamDocuments: () => [document],
}));
vi.mock("../../../core/webpackCompat", () => ({ getRuntimeClassMap: () => null }));
vi.mock("../../../runtime/logger", () => ({ logInfo: vi.fn() }));

import { resolveAnchor, findOrCreateMount, ROOT_ID } from "../../../components/home/mountUtils";
import { STEAM_PT_BR, clearSteamLocalizer, stubSteamLocalizer } from "../../fixtures/steamLocalizer";

/* Native Home as it looks right after boot: a scroll panel (overflow-y auto,
   nothing to scroll yet) holding only the recents block — title + a wrapper
   around the virtualized recents grid. */
function buildEarlyHome(label = "Jogos recentes") {
  document.body.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "home-panel";
  panel.style.overflowY = "auto";
  const recents = document.createElement("div");
  recents.className = "recents-block";
  const title = document.createElement("h2");
  title.textContent = label;
  const wrapper = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "ReactVirtualized__Grid";
  grid.setAttribute("aria-label", label);
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
  beforeEach(() => { document.body.innerHTML = ""; stubSteamLocalizer(STEAM_PT_BR); });
  afterEach(clearSteamLocalizer);

  it("anchors after the recents block in the scroll panel even before the panel overflows", () => {
    const { panel, recents } = buildEarlyHome();
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(recents.nextSibling);
  });

  it("never anchors inside a recents block a previous instance left hidden", () => {
    const { panel, recents } = buildEarlyHome();
    // The outgoing instance hid the native rows (hideHomeTabs) and the inner grid
    // is the first overflow:auto panel the lenient walk would otherwise pick.
    recents.style.display = "none";
    (recents.querySelector(".ReactVirtualized__Grid") as HTMLElement).style.overflowY = "auto";
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(recents.nextSibling);
  });

  it("ignores the chip row when the block holding it is hidden", () => {
    document.body.innerHTML = "";
    const panel = document.createElement("div");
    panel.style.overflowY = "auto";
    const hidden = document.createElement("div");
    hidden.style.display = "none";
    const row = document.createElement("div");
    for (const label of ["Novidades", "Amigos", "Recomendados"]) { const b = document.createElement("button"); b.textContent = label; row.appendChild(b); }
    hidden.appendChild(row);
    panel.appendChild(hidden);
    document.body.appendChild(panel);
    const anchor = resolveAnchor(document);
    expect(anchor === null || !hidden.contains(anchor.parent)).toBe(true);
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

describe("mountUtils — Steam's own labels, in any Steam language", () => {
  const GERMAN: Record<string, string> = {
    "#LibraryHome_RecentGames": "Kürzlich gespielt",
    "#HomeTab_WhatsNew": "Neuigkeiten", "#HomeTab_Friends": "Freunde", "#HomeTab_Recommended": "Empfohlen",
  };
  beforeEach(() => { document.body.innerHTML = ""; clearSteamLocalizer(); });
  afterEach(clearSteamLocalizer);
  const steamInGerman = () => stubSteamLocalizer(GERMAN, {});

  it("finds the recents block by the label Steam shows in the user's language", () => {
    const { panel, recents } = buildEarlyHome("Kürzlich gespielt");
    expect(resolveAnchor(document)?.before).not.toBe(recents.nextSibling);
    steamInGerman();
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(recents.nextSibling);
  });

  it("finds the Home tabs row by the labels Steam shows in the user's language", () => {
    const panel = document.createElement("div");
    const row = document.createElement("div");
    for (const label of ["Neuigkeiten", "Freunde", "Empfohlen"]) { const b = document.createElement("button"); b.textContent = label; row.appendChild(b); }
    panel.appendChild(row);
    document.body.appendChild(panel);
    steamInGerman();
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(row);
  });
});
