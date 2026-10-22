// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installPowerGate, getPowerState, subscribePowerState, registerPeriodic, getPowerGateStats,
  isHomeBehindGame, homeRouteCovered, __resetPowerGateForTest, type PowerState,
} from "../../runtime/powerGate";
import { installSessionState } from "../../runtime/sessionState";

/* A Steam client reduced to the signals the gate wires: app lifetime (with the
   running-apps store the session state reads), suspend / resume, the
   compositor's focus events, and the Big Picture window with its router. The
   Big Picture document is its own object: the plugin realm's `document` is
   the shared context, whose visibility means the screen. */
const steam = {
  lifetime: null as null | ((n: any) => void),
  suspend: null as null | (() => void),
  resume: null as null | (() => void),
  focusChange: null as null | ((e: any) => void),
  overlayFocus: null as null | ((appid: number, focused: boolean) => void),
  running: [] as number[],
  route: "/library/home",
  routeListeners: new Set<() => void>(),
  suspendRegistrations: 0,
};
const bp = { win: null as any, doc: null as unknown as Document };

function newBpDocument(): Document { return document.implementation.createHTMLDocument("bp"); }
function setHidden(doc: Document, hidden: boolean): void {
  Object.defineProperty(doc, "hidden", { configurable: true, get: () => hidden });
}

function installSteamGlobals(): void {
  bp.doc = newBpDocument();
  bp.win = new EventTarget();
  bp.win.document = bp.doc;
  (globalThis as any).SteamClient = {
    GameSessions: {
      RegisterForAppLifetimeNotifications: (cb: any) => { steam.lifetime = cb; return { unregister() { steam.lifetime = null; } }; },
    },
    System: {
      RegisterForOnSuspendRequest: (cb: any) => { steam.suspendRegistrations++; steam.suspend = cb; return { unregister() {} }; },
      RegisterForOnResumeFromSuspend: (cb: any) => { steam.resume = cb; return { unregister() {} }; },
      UI: {
        RegisterForFocusChangeEvents: (cb: any) => { steam.focusChange = cb; return { unregister() { steam.focusChange = null; } }; },
        RegisterForOverlayGameWindowFocusChanged: (cb: any) => { steam.overlayFocus = cb; return { unregister() { steam.overlayFocus = null; } }; },
      },
    },
  };
  (globalThis as any).SteamUIStore = {
    get RunningApps() { return steam.running; },
    WindowStore: {
      GamepadUIMainWindowInstance: {
        get BrowserWindow() { return bp.win; },
        m_history: {
          get location() { return { pathname: steam.route }; },
          listen: (cb: () => void) => { steam.routeListeners.add(cb); return () => steam.routeListeners.delete(cb); },
        },
      },
    },
  };
}

function startGame(appid = 1): void {
  steam.running = [appid];
  steam.lifetime?.({ unAppID: appid, bRunning: true });
}
function stopGame(appid = 1): void {
  steam.running = [];
  steam.lifetime?.({ unAppID: appid, bRunning: false });
}
function navigate(path: string): void {
  steam.route = path;
  for (const cb of steam.routeListeners) cb();
}

// Windows as the compositor lists them: Steam's own and a non-Steam game's.
const steamWindow = { appid: 769, pid: 100, windowid: 1, strExeName: "steamwebhelper" };
const gameWindow = { appid: 2147841299, pid: 200, windowid: 2, strExeName: "game.exe" };

let uninstallSession: (() => void) | null = null;

describe("powerGate", () => {
  beforeEach(() => {
    steam.running = []; steam.route = "/library/home"; steam.routeListeners.clear(); steam.suspendRegistrations = 0;
    installSteamGlobals();
    __resetPowerGateForTest();
    uninstallSession = installSessionState();
  });
  afterEach(() => {
    if (steam.running.length) stopGame(steam.running[0]);
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    delete (globalThis as any).SteamClient;
    delete (globalThis as any).SteamUIStore;
    delete (document as any).hidden;
  });

  it("orders the states suspended > in-game > home-hidden > active and notifies each transition", () => {
    installPowerGate();
    const seen: PowerState[] = [];
    subscribePowerState((s) => seen.push(s));
    expect(getPowerState()).toBe("active");
    navigate("/library/app/620");
    expect(getPowerState()).toBe("home-hidden");
    startGame();
    expect(getPowerState()).toBe("in-game");
    steam.suspend!();
    expect(getPowerState()).toBe("suspended");
    steam.resume!();
    expect(getPowerState()).toBe("in-game");
    stopGame();
    expect(getPowerState()).toBe("home-hidden");
    navigate("/library/home");
    expect(getPowerState()).toBe("active");
    expect(seen).toEqual(["home-hidden", "in-game", "suspended", "in-game", "home-hidden", "active"]);
    expect(seen).not.toContain("screen-off");
  });

  it("needs both game signals: the store alone (a failed launch) is not a game", () => {
    installPowerGate();
    steam.running = [7];
    expect(getPowerState()).toBe("active");
    steam.lifetime!({ unAppID: 7, bRunning: true });
    expect(getPowerState()).toBe("in-game");
  });

  it("re-reads the signals on every read: a store that updates after its notification is seen without an event", () => {
    installPowerGate();
    const task = { start: vi.fn(), stop: vi.fn() };
    registerPeriodic("t", { runIn: ["active"], ...task });
    steam.lifetime!({ unAppID: 1, bRunning: true }); // the store has not caught up yet
    expect(getPowerState()).toBe("active");
    steam.running = [1];
    expect(getPowerState()).toBe("in-game");
    expect(task.stop).toHaveBeenCalledTimes(1);
  });

  it("starts a task at registration only when allowed, stops it on leave, resumes it on re-entry", () => {
    installPowerGate();
    const calls: string[] = [];
    const unregister = registerPeriodic("refresh", {
      runIn: ["active"],
      start: () => calls.push("start"), stop: () => calls.push("stop"), onResume: () => calls.push("resume"),
    });
    expect(calls).toEqual(["start"]);
    startGame();
    expect(calls).toEqual(["start", "stop"]);
    stopGame();
    expect(calls).toEqual(["start", "stop", "start", "resume"]);
    unregister();
    expect(calls).toEqual(["start", "stop", "start", "resume", "stop"]);
    startGame(); stopGame();
    expect(calls).toHaveLength(5);
  });

  it("a task registered while held starts (with onResume) once its state arrives", () => {
    installPowerGate();
    startGame();
    const calls: string[] = [];
    registerPeriodic("focus", { runIn: ["active"], start: () => calls.push("start"), stop: () => calls.push("stop"), onResume: () => calls.push("resume") });
    expect(calls).toEqual([]);
    stopGame();
    expect(calls).toEqual(["start", "resume"]);
  });

  it("a task that also runs in home-hidden keeps running across a route change and stops for a game", () => {
    installPowerGate();
    const task = { start: vi.fn(), stop: vi.fn() };
    registerPeriodic("tracker", { runIn: ["active", "home-hidden"], ...task });
    navigate("/library/app/1");
    expect(task.stop).not.toHaveBeenCalled();
    startGame();
    expect(task.stop).toHaveBeenCalledTimes(1);
  });

  it("reads the Home's visibility from the Big Picture document's events only", () => {
    setHidden(bp.doc, true);
    installPowerGate();
    // Hidden from the start is not trusted (an offscreen document reports that).
    expect(getPowerState()).toBe("active");
    bp.doc.dispatchEvent(new Event("visibilitychange"));
    expect(getPowerState()).toBe("home-hidden");
    setHidden(bp.doc, false);
    bp.doc.dispatchEvent(new Event("visibilitychange"));
    expect(getPowerState()).toBe("active");
  });

  it("ignores the hidden a document reports while it unloads and wires the document that replaces it", () => {
    installPowerGate();
    const task = { start: vi.fn(), stop: vi.fn() };
    registerPeriodic("fallback", { runIn: ["active"], ...task });
    setHidden(bp.doc, true);
    bp.win.dispatchEvent(new Event("pagehide"));
    bp.doc.dispatchEvent(new Event("visibilitychange"));
    expect(getPowerState()).toBe("active");
    expect(task.stop).not.toHaveBeenCalled();
    // The renderer came back with a new document: its events count again.
    const fresh = newBpDocument();
    bp.win.document = fresh;
    expect(getPowerState()).toBe("active");
    setHidden(fresh, true);
    fresh.dispatchEvent(new Event("visibilitychange"));
    expect(getPowerState()).toBe("home-hidden");
    expect(task.stop).toHaveBeenCalledTimes(1);
  });

  it("follows popstate on the Big Picture window", () => {
    installPowerGate();
    steam.route = "/library/app/9";
    bp.win.dispatchEvent(new Event("popstate"));
    expect(getPowerGateStats().state).toBe("home-hidden");
  });

  it("counts starts and stops per task name and the transitions", () => {
    installPowerGate();
    registerPeriodic("a", { runIn: ["active"], start: () => {}, stop: () => {} });
    registerPeriodic("a", { runIn: ["active"], start: () => {}, stop: () => {} });
    registerPeriodic("b", { runIn: ["in-game"], start: () => {}, stop: () => {} });
    startGame();
    const stats = getPowerGateStats();
    expect(stats.state).toBe("in-game");
    expect(stats.transitions).toBe(1);
    expect(stats.tasks.a).toEqual({ running: false, starts: 2, stops: 2 });
    expect(stats.tasks.b).toEqual({ running: true, starts: 1, stops: 0 });
    expect(stats.since).toBeGreaterThan(0);
    expect(stats.signals).toMatchObject({ gameByEvent: true, gameByStore: true, focusedGame: false, routeCovered: false, screenOff: false });
  });

  it("install is idempotent and dispose drops the signals", () => {
    const dispose = installPowerGate();
    expect(installPowerGate()).toBe(dispose);
    expect(steam.suspendRegistrations).toBe(1);
    const seen: PowerState[] = [];
    subscribePowerState((s) => seen.push(s));
    dispose();
    navigate("/library/app/1");
    expect(seen).toEqual([]);
    expect(steam.focusChange).toBeNull();
  });

  it("isHomeBehindGame reads the route from the router, not the window URL", () => {
    installPowerGate();
    startGame();
    expect(homeRouteCovered()).toBe(false);
    expect(isHomeBehindGame()).toBe(false);
    navigate("/library/app/1");
    expect(isHomeBehindGame()).toBe(true);
  });
});

describe("powerGate — a game window in the foreground (shortcut, third-party launcher)", () => {
  beforeEach(() => {
    steam.running = []; steam.route = "/library/home"; steam.routeListeners.clear();
    installSteamGlobals();
    __resetPowerGateForTest();
    uninstallSession = installSessionState();
    installPowerGate();
  });
  afterEach(() => {
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    delete (globalThis as any).SteamClient;
    delete (globalThis as any).SteamUIStore;
  });

  it("a focus-change event naming a game window is in-game with the running-apps store empty and no lifetime event", () => {
    const task = { start: vi.fn(), stop: vi.fn() };
    registerPeriodic("refresh", { runIn: ["active"], ...task });
    steam.focusChange!({ focusedApp: gameWindow, rgFocusable: [steamWindow, gameWindow] });
    expect(getPowerState()).toBe("in-game");
    expect(task.stop).toHaveBeenCalledTimes(1);
    expect(getPowerGateStats().signals).toMatchObject({ gameByStore: false, gameByEvent: false, focusedGame: true, gameWindowListed: true });
    // The Steam menu opens over the game: Steam has the focus, the game window is still there.
    steam.focusChange!({ focusedApp: steamWindow, rgFocusable: [steamWindow, gameWindow] });
    expect(getPowerState()).toBe("in-game");
    // The game closes: only Steam's window is left.
    steam.focusChange!({ focusedApp: steamWindow, rgFocusable: [steamWindow] });
    expect(getPowerState()).toBe("active");
    expect(task.start).toHaveBeenCalledTimes(2);
  });

  it("Steam's own window never counts as a game, by appid or by executable", () => {
    steam.focusChange!({ focusedApp: steamWindow, rgFocusable: [steamWindow] });
    expect(getPowerState()).toBe("active");
    steam.focusChange!({ focusedApp: { appid: 0, pid: 1, windowid: 3, strExeName: "steam" }, rgFocusable: [] });
    expect(getPowerState()).toBe("active");
    steam.focusChange!({ focusedApp: { appid: 12345, pid: 1, windowid: 3, strExeName: "steamwebhelper" }, rgFocusable: [] });
    expect(getPowerState()).toBe("active");
  });

  it("without a focusable list, Steam taking the focus back ends the game", () => {
    steam.focusChange!({ focusedApp: gameWindow });
    expect(getPowerState()).toBe("in-game");
    steam.focusChange!({ focusedApp: steamWindow });
    expect(getPowerState()).toBe("active");
  });

  it("the overlay's game-window focus is a signal of its own: focused holds, unfocused releases", () => {
    steam.overlayFocus!(gameWindow.appid, true);
    expect(getPowerState()).toBe("in-game");
    steam.overlayFocus!(gameWindow.appid, false);
    expect(getPowerState()).toBe("active");
    steam.overlayFocus!(769, true);
    expect(getPowerState()).toBe("active");
  });

  it("the automatic focus paths see the foreground game through the gate", async () => {
    const { focusElementAuto } = await import("../../core/focusRestore");
    // A native element: outside the gate's hold, focusElement falls back to DOM focus.
    const button = document.createElement("button");
    document.body.appendChild(button);
    const focus = vi.spyOn(button, "focus");
    expect(focusElementAuto(button)).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
    steam.focusChange!({ focusedApp: gameWindow, rgFocusable: [steamWindow, gameWindow] });
    expect(focusElementAuto(button)).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
    button.remove();
  });
});

describe("powerGate — the screen", () => {
  beforeEach(() => {
    steam.running = []; steam.route = "/library/home"; steam.routeListeners.clear();
    installSteamGlobals();
    __resetPowerGateForTest();
    uninstallSession = installSessionState();
  });
  afterEach(() => {
    if (steam.running.length) stopGame(steam.running[0]);
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    delete (globalThis as any).SteamClient;
    delete (globalThis as any).SteamUIStore;
    delete (document as any).hidden;
  });

  it("the plugin document's visibility is the screen: off ranks above in-game and below suspended, from events only", () => {
    setHidden(document, true);
    installPowerGate();
    const seen: PowerState[] = [];
    subscribePowerState((s) => seen.push(s));
    expect(getPowerState()).toBe("active");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getPowerState()).toBe("screen-off");
    startGame();
    expect(getPowerState()).toBe("screen-off");
    steam.suspend!();
    expect(getPowerState()).toBe("suspended");
    steam.resume!();
    expect(getPowerState()).toBe("screen-off");
    setHidden(document, false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getPowerState()).toBe("in-game");
    stopGame();
    expect(getPowerState()).toBe("active");
    expect(seen).toEqual(["screen-off", "suspended", "screen-off", "in-game", "active"]);
  });

  it("the screen going dark stops an active-only task and the return runs it once more", () => {
    installPowerGate();
    const calls: string[] = [];
    registerPeriodic("poll", { runIn: ["active"], start: () => calls.push("start"), stop: () => calls.push("stop"), onResume: () => calls.push("resume") });
    setHidden(document, true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toEqual(["start", "stop"]);
    setHidden(document, false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toEqual(["start", "stop", "start", "resume"]);
  });
});
