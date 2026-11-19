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

  it("anchors after the current-game row the beta client shows in Big Art mode", () => {
    const { panel, recents } = buildEarlyHome("Jogo atual");
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(recents.nextSibling);
    const created = findOrCreateMount();
    expect(created?.parentElement).toBe(panel);
    expect(created?.previousElementSibling).toBe(recents);
  });

  it("never anchors inside a recents block a previous instance left hidden", () => {
    const { panel, recents } = buildEarlyHome();
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

function buildHomeWithInnerLabelRow() {
  document.body.innerHTML = "";
  const panel = document.createElement("div");
  panel.style.overflowY = "auto";
  const row = document.createElement("div");
  const inner = document.createElement("div");
  inner.setAttribute("aria-label", "Jogos recentes");
  row.appendChild(inner);
  const other = document.createElement("div");
  panel.append(row, other);
  document.body.appendChild(panel);
  return { panel, row, other };
}

describe("mountUtils — a mount already in its slot", () => {
  beforeEach(() => { document.body.innerHTML = ""; stubSteamLocalizer(STEAM_PT_BR); });
  afterEach(clearSteamLocalizer);

  it("is not re-inserted when the recents row is known only by an inner label", () => {
    const { panel, row } = buildHomeWithInnerLabelRow();
    const mount = mountEl();
    panel.insertBefore(mount, row.nextSibling);
    const observer = new MutationObserver(() => {});
    observer.observe(panel, { childList: true });
    expect(findOrCreateMount()).toBe(mount);
    expect(findOrCreateMount()).toBe(mount);
    const records = observer.takeRecords();
    observer.disconnect();
    expect(records).toHaveLength(0);
    expect(mount.previousElementSibling).toBe(row);
  });

  it("still moves next to that row when it sits elsewhere", () => {
    const { panel, row, other } = buildHomeWithInnerLabelRow();
    const mount = mountEl();
    panel.appendChild(mount);
    expect(findOrCreateMount()).toBe(mount);
    expect(mount.previousElementSibling).toBe(row);
    expect(mount.nextElementSibling).toBe(other);
  });
});

function mountWithShelfNamedLikeRecents(): HTMLElement {
  const mount = mountEl();
  const shelf = document.createElement("div");
  shelf.setAttribute("aria-label", "Jogos recentes");
  mount.appendChild(shelf);
  return mount;
}

describe("mountUtils — our own shelves are never the recents row", () => {
  beforeEach(() => { document.body.innerHTML = ""; stubSteamLocalizer(STEAM_PT_BR); });
  afterEach(clearSteamLocalizer);

  it("does not take a shelf of ours named like the recents row for it", () => {
    const panel = document.createElement("div");
    panel.style.overflowY = "auto";
    const tabs = document.createElement("div");
    for (const label of ["Novidades", "Amigos", "Recomendados"]) { const b = document.createElement("button"); b.textContent = label; tabs.appendChild(b); }
    panel.append(tabs, mountWithShelfNamedLikeRecents());
    document.body.appendChild(panel);
    const anchor = resolveAnchor(document);
    expect(anchor?.parent).toBe(panel);
    expect(anchor?.before).toBe(tabs);
  });

  it("moves a mount next to the real recents row even when one of our shelves carries the same label", () => {
    const { panel, recents } = buildEarlyHome();
    const mount = mountWithShelfNamedLikeRecents();
    panel.insertBefore(mount, recents);
    expect(findOrCreateMount()).toBe(mount);
    expect(mount.parentElement).toBe(panel);
    expect(mount.previousElementSibling).toBe(recents);
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
