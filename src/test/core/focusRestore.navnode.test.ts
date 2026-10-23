// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { focusElement, saveFocusTarget, tryRestoreFocus, clearFocusTarget, hasPendingFocus } from "../../core/focusRestore";

/* Builds a DS card element whose React fiber carries Steam's nav node the way
   a mounted Focusable does: a ref hook whose `current` has `m_Tree`. */
function cardWithNavNode(opts: { activeCtx: any; homeInActive?: boolean }) {
  const card = document.createElement("div");
  card.className = "ds-card";
  document.body.appendChild(card);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const ctrl = { m_ActiveContext: opts.activeCtx };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: ctrl, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  const hookRef = { memoizedState: { current: card }, next: hookWithNode };
  (card as any)["__reactFiber$test"] = { memoizedState: hookRef, return: null };
  return { card, ctx, ctrl, node };
}

function contextWithHome(): any {
  const root = document.createElement("div");
  root.className = "deck-shelves-root";
  return { m_rgGamepadNavigationTrees: [{ m_Root: { m_element: root, m_rgChildren: [] } }] };
}

describe("focusRestore — nav node from the element's own fiber", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("takes focus through the fiber node and activates its context when none is active", () => {
    const { card, ctx, node } = cardWithNavNode({ activeCtx: null });
    expect(focusElement(card)).toBe(true);
    expect(ctx.SetActive).toHaveBeenCalledWith(true);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("activates its context when the active one is a copy that cannot reach the Home", () => {
    const copy = { m_rgGamepadNavigationTrees: [{ m_Root: { m_element: document.createElement("div"), m_rgChildren: [] } }] };
    const { card, ctx } = cardWithNavNode({ activeCtx: copy });
    focusElement(card);
    expect(ctx.SetActive).toHaveBeenCalledWith(true);
  });

  it("leaves a live context alone when it already reaches the Home (QAM / modal owns input)", () => {
    const { card, ctx, node } = cardWithNavNode({ activeCtx: contextWithHome() });
    focusElement(card);
    expect(ctx.SetActive).not.toHaveBeenCalled();
    expect(node.BTakeFocus).toHaveBeenCalled();
  });

  it("releases a native text field holding DOM focus before taking focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    const { card } = cardWithNavNode({ activeCtx: null });
    focusElement(card);
    expect(document.activeElement).not.toBe(input);
  });
});

describe("focusRestore — never takes Steam focus on its own while a game runs (#135)", () => {
  afterEach(() => { document.body.innerHTML = ""; delete (globalThis as any).SteamUIStore; clearFocusTarget(); });

  function pendingCard() {
    const made = cardWithNavNode({ activeCtx: null });
    made.card.setAttribute("data-appid", "620");
    made.card.setAttribute("data-shelfid", "s1");
    saveFocusTarget(620, "s1");
    return made;
  }

  it("keeps the pending restore but leaves the input context alone while a game runs", () => {
    (globalThis as any).SteamUIStore = { RunningApps: [{ appid: 620 }] };
    const { ctx, node } = pendingCard();
    expect(tryRestoreFocus()).toBe(false);
    expect(ctx.SetActive).not.toHaveBeenCalled();
    expect(node.BTakeFocus).not.toHaveBeenCalled();
    expect(hasPendingFocus()).toBe(true);
  });

  it("restores as before once no game is running", () => {
    (globalThis as any).SteamUIStore = { RunningApps: [] };
    const { ctx, node } = pendingCard();
    tryRestoreFocus();
    expect(ctx.SetActive).toHaveBeenCalledWith(true);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("user-driven focus moves still work while a game runs (Home opened over the game)", () => {
    (globalThis as any).SteamUIStore = { RunningApps: [{ appid: 620 }] };
    const { card, node } = cardWithNavNode({ activeCtx: null });
    expect(focusElement(card)).toBe(true);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });
});

describe("focusRestore — a pending restore stands down once the player navigates the Home", () => {
  afterEach(() => { document.body.innerHTML = ""; clearFocusTarget(); vi.restoreAllMocks(); });

  function homeWithCard() {
    const page = document.createElement("div");
    const root = document.createElement("div");
    root.id = "deck-shelves-home-root";
    const native = document.createElement("div");
    page.append(native, root);
    document.body.appendChild(page);
    return { root, native };
  }
  const press = (el: Element) => el.dispatchEvent(new Event("vgp_ondirection", { bubbles: true }));

  it("drops the target when a direction press lands on the Home after the grace window", () => {
    const { native } = homeWithCard();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    saveFocusTarget(620, "s1");
    vi.spyOn(Date, "now").mockReturnValue(now + 2000);
    press(native);
    expect(hasPendingFocus()).toBe(false);
  });

  it("keeps it for a press right after it was armed, or outside the Home (a game page)", () => {
    const { root } = homeWithCard();
    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    saveFocusTarget(620, "s1");
    press(root);
    expect(hasPendingFocus()).toBe(true);
    vi.spyOn(Date, "now").mockReturnValue(now + 5000);
    press(elsewhere);
    expect(hasPendingFocus()).toBe(true);
  });
});

describe("focusRestore — never takes focus while another page covers the Home", () => {
  afterEach(() => { document.body.innerHTML = ""; delete (globalThis as any).SteamUIStore; clearFocusTarget(); });

  function onRoute(pathname: string) {
    (globalThis as any).SteamUIStore = { RunningApps: [], WindowStore: { GamepadUIMainWindowInstance: { m_history: { location: { pathname } } } } };
  }

  it("leaves focus on a game page that is opening and keeps the target for the way back", () => {
    onRoute("/library/app/620");
    const made = cardWithNavNode({ activeCtx: null });
    made.card.setAttribute("data-appid", "620");
    made.card.setAttribute("data-shelfid", "s1");
    saveFocusTarget(620, "s1");
    expect(tryRestoreFocus()).toBe(false);
    expect(made.node.BTakeFocus).not.toHaveBeenCalled();
    expect(hasPendingFocus()).toBe(true);
    onRoute("/library/home");
    tryRestoreFocus();
    expect(made.node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("does not count a card that still holds focus while its game page opens as restored", () => {
    onRoute("/library/app/620");
    const made = cardWithNavNode({ activeCtx: null });
    made.card.setAttribute("data-appid", "620");
    made.card.setAttribute("data-shelfid", "s1");
    made.card.classList.add("gpfocus");
    saveFocusTarget(620, "s1");
    expect(tryRestoreFocus()).toBe(false);
    expect(hasPendingFocus()).toBe(true);
    onRoute("/library/home");
    expect(tryRestoreFocus()).toBe(true);
    expect(hasPendingFocus()).toBe(false);
  });
});
