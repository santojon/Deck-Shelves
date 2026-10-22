// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { focusElement, focusElementAuto, startFocusFirstPoll } from "../../core/focusRestore";
import { installPowerGate, getPowerGateStats, __resetPowerGateForTest } from "../../runtime/powerGate";
import { installSessionState } from "../../runtime/sessionState";

/* A DS card whose React fiber carries Steam's nav node the way a mounted
   Focusable does: a ref hook whose `current` has `m_Tree`. */
function cardWithNavNode() {
  const card = document.createElement("div");
  card.className = "ds-card";
  document.body.appendChild(card);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const ctrl = { m_ActiveContext: null };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: ctrl, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  const hookRef = { memoizedState: { current: card }, next: hookWithNode };
  (card as any)["__reactFiber$test"] = { memoizedState: hookRef, return: null };
  return { card, ctx, node };
}

const steam = { lifetime: null as null | ((n: any) => void), suspend: null as null | (() => void), resume: null as null | (() => void), running: [] as number[], route: "/library/home" };
function installSteamGlobals(): void {
  (globalThis as any).SteamClient = {
    GameSessions: { RegisterForAppLifetimeNotifications: (cb: any) => { steam.lifetime = cb; return { unregister() {} }; } },
    System: {
      RegisterForOnSuspendRequest: (cb: any) => { steam.suspend = cb; return { unregister() {} }; },
      RegisterForOnResumeFromSuspend: (cb: any) => { steam.resume = cb; return { unregister() {} }; },
    },
  };
  (globalThis as any).SteamUIStore = {
    get RunningApps() { return steam.running; },
    WindowStore: { GamepadUIMainWindowInstance: { BrowserWindow: window, m_history: { get location() { return { pathname: steam.route }; } } } },
  };
}
// Both signals: the lifetime event and the running-apps store.
function startGame(): void { steam.running = [620]; steam.lifetime?.({ unAppID: 620, bRunning: true }); }
function stopGame(): void { steam.running = []; steam.lifetime?.({ unAppID: 620, bRunning: false }); }

let uninstallSession: (() => void) | null = null;

describe("focusElementAuto — the automatic focus paths never grab focus outside the active Home", () => {
  beforeEach(() => {
    steam.running = []; steam.route = "/library/home";
    installSteamGlobals();
    __resetPowerGateForTest();
    installPowerGate();
    uninstallSession = installSessionState();
  });
  afterEach(() => {
    if (steam.running.length) stopGame();
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    delete (globalThis as any).SteamClient; delete (globalThis as any).SteamUIStore;
    document.body.innerHTML = "";
  });

  it("takes focus on the active Home", () => {
    const { card, node } = cardWithNavNode();
    expect(focusElementAuto(card)).toBe(true);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("is a no-op while a game runs (both signals): no BTakeFocus, no SetActive", () => {
    startGame();
    const { card, ctx, node } = cardWithNavNode();
    expect(focusElementAuto(card)).toBe(false);
    expect(node.BTakeFocus).not.toHaveBeenCalled();
    expect(ctx.SetActive).not.toHaveBeenCalled();
    // The user's own moves still work (Home opened over the game).
    expect(focusElement(card)).toBe(true);
  });

  it("is a no-op while another page covers the Home", () => {
    steam.route = "/library/app/620";
    const { card, node } = cardWithNavNode();
    expect(focusElementAuto(card)).toBe(false);
    expect(node.BTakeFocus).not.toHaveBeenCalled();
  });

  it("is a no-op while the device is suspended", () => {
    steam.suspend!();
    const { card, node } = cardWithNavNode();
    expect(focusElementAuto(card)).toBe(false);
    expect(node.BTakeFocus).not.toHaveBeenCalled();
    steam.resume!();
    expect(focusElementAuto(card)).toBe(true);
  });
});

describe("startFocusFirstPoll — the Home's first-shelf landing as a gate task", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    steam.running = []; steam.route = "/library/home";
    installSteamGlobals();
    __resetPowerGateForTest();
    installPowerGate();
    uninstallSession = installSessionState();
  });
  afterEach(() => {
    if (steam.running.length) stopGame();
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    vi.useRealTimers();
    delete (globalThis as any).SteamClient; delete (globalThis as any).SteamUIStore;
    document.body.innerHTML = "";
  });

  it("with a game running the effect path issues zero focus calls; the next resume focuses once", () => {
    startGame();
    const { card, node } = cardWithNavNode();
    const tryFocus = vi.fn(() => focusElementAuto(card));
    const stop = startFocusFirstPoll(tryFocus, () => false);
    vi.advanceTimersByTime(120_000);
    expect(tryFocus).not.toHaveBeenCalled();
    expect(node.BTakeFocus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    stopGame();
    expect(tryFocus).toHaveBeenCalledTimes(1);
    expect(node.BTakeFocus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(tryFocus).toHaveBeenCalledTimes(1);
    stop();
  });

  it("polls every 600 ms on the active Home until the landing is confirmed, then stops", () => {
    let landed = false;
    const tryFocus = vi.fn(() => landed);
    const stop = startFocusFirstPoll(tryFocus, () => landed);
    vi.advanceTimersByTime(1800);
    expect(tryFocus).toHaveBeenCalledTimes(3);
    landed = true;
    vi.advanceTimersByTime(600);
    expect(tryFocus).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
    stop();
    expect(getPowerGateStats().tasks.homeFocusFirst).toBeUndefined();
  });

  it("holds the poll while a game starts mid-window and retries once on return", () => {
    const tryFocus = vi.fn(() => false);
    const stop = startFocusFirstPoll(tryFocus, () => false);
    vi.advanceTimersByTime(1200);
    expect(tryFocus).toHaveBeenCalledTimes(2);
    startGame();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(tryFocus).toHaveBeenCalledTimes(2);
    stopGame();
    expect(tryFocus).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(600);
    expect(tryFocus).toHaveBeenCalledTimes(4);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry on return when a real card already holds focus", () => {
    startGame();
    const tryFocus = vi.fn(() => true);
    const stop = startFocusFirstPoll(tryFocus, () => true);
    stopGame();
    expect(tryFocus).not.toHaveBeenCalled();
    stop();
  });

  it("the cleanup unregisters the task so a later return does nothing", () => {
    const tryFocus = vi.fn(() => false);
    const stop = startFocusFirstPoll(tryFocus, () => false);
    stop();
    startGame(); stopGame();
    expect(tryFocus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
