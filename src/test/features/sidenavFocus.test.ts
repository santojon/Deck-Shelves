// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../core/focusRestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/focusRestore")>();
  return { ...actual, focusElement: vi.fn(() => true), focusElementAuto: vi.fn(() => false) };
});

import { focusNativeRecentsFirstCard } from "../../features/sidenav/ShelfSideNav";
import { focusElement, focusElementAuto } from "../../core/focusRestore";

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
