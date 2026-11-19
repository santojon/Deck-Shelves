import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type InputCallback = (slot: number, button: number, pressed: boolean) => void;

function fakeInput() {
  const callbacks: InputCallback[] = [];
  const unregister = vi.fn();
  return {
    callbacks,
    unregister,
    RegisterForControllerInputMessages: (cb: InputCallback) => {
      callbacks.push(cb);
      return { unregister };
    },
  };
}

function fakeBigPictureWindow() {
  const input = fakeInput();
  const keydown: Array<(e: any) => void> = [];
  const doc = {
    addEventListener(type: string, fn: (e: any) => void) {
      if (type === "keydown") keydown.push(fn);
    },
  };
  const view: any = {
    Function,
    SteamClient: { Input: input },
    document: doc,
  };
  return {
    view,
    input,
    logPress: (slot: number, button: number, pressed: boolean) => input.callbacks[0](slot, button, pressed),
    directPress: (slot: number, button: number, pressed: boolean) => input.callbacks[1](slot, button, pressed),
    typeKey: (key: string, code: string) => {
      for (const fn of keydown) fn({ key, code, ctrlKey: false, shiftKey: false, metaKey: false, altKey: false, target: { tagName: "BODY" } });
    },
  };
}

let runningApps: unknown[] = [];

function installSteam(view: any): void {
  (globalThis as any).SteamUIStore = {
    WindowStore: { GamepadUIMainWindowInstance: { BrowserWindow: view } },
    get RunningApps() { return runningApps; },
  };
}

function clearGlobals(): void {
  const g = globalThis as any;
  delete g.SteamUIStore;
  delete g.SteamClient;
  for (const key of Object.keys(g)) if (key.startsWith("__ds_")) delete g[key];
}

async function loadModules() {
  const input = await import("../../runtime/controllerInput");
  const bus = await import("../../runtime/homeInputBus");
  return { ...input, ...bus };
}

describe("controller input from the Big Picture window", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    runningApps = [];
    clearGlobals();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    clearGlobals();
  });

  it("delivers a press logged in the Big Picture window on the next drain tick", async () => {
    const bp = fakeBigPictureWindow();
    installSteam(bp.view);
    const { subscribeControllerInput, Button } = await loadModules();
    const seen = vi.fn();
    subscribeControllerInput(seen);

    bp.logPress(0, Button.X, true);
    expect(seen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith({ slot: 0, button: Button.X, pressed: true });
  });

  it("delivers the same press from several registrations only once", async () => {
    const bp = fakeBigPictureWindow();
    installSteam(bp.view);
    const shared = fakeInput();
    (globalThis as any).SteamClient = { Input: shared };
    const { subscribeControllerInput, Button } = await loadModules();
    const seen = vi.fn();
    subscribeControllerInput(seen);

    expect(shared.callbacks).toHaveLength(1);
    shared.callbacks[0](0, Button.A, true);
    bp.directPress(0, Button.A, true);
    bp.logPress(0, Button.A, true);
    vi.advanceTimersByTime(30);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith({ slot: 0, button: Button.A, pressed: true });
  });

  it("drops logged presses once a direct registration has delivered one", async () => {
    const bp = fakeBigPictureWindow();
    installSteam(bp.view);
    const { subscribeControllerInput, Button } = await loadModules();
    const seen = vi.fn();
    subscribeControllerInput(seen);

    bp.directPress(0, Button.A, true);
    expect(seen).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    bp.logPress(0, Button.Y, true);
    vi.advanceTimersByTime(30);

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).not.toHaveBeenCalledWith(expect.objectContaining({ button: Button.Y }));
  });

  it("discards presses and keys logged while a game runs, also after the game ends", async () => {
    const bp = fakeBigPictureWindow();
    installSteam(bp.view);
    const { subscribeControllerInput, subscribeHomeKey, Button } = await loadModules();
    const pressed = vi.fn();
    const typed = vi.fn();
    subscribeControllerInput(pressed);
    subscribeHomeKey(typed);

    runningApps = [{ appid: 10 }];
    bp.logPress(0, Button.B, true);
    bp.typeKey("a", "KeyA");
    vi.advanceTimersByTime(30);

    runningApps = [];
    vi.advanceTimersByTime(30);

    expect(pressed).not.toHaveBeenCalled();
    expect(typed).not.toHaveBeenCalled();
  });

  it("delivers a key typed in the Big Picture window to home key subscribers", async () => {
    const bp = fakeBigPictureWindow();
    installSteam(bp.view);
    const { subscribeHomeKey } = await loadModules();
    const typed = vi.fn();
    subscribeHomeKey(typed);

    bp.typeKey("a", "KeyA");
    vi.advanceTimersByTime(30);

    expect(typed).toHaveBeenCalledTimes(1);
    expect(typed).toHaveBeenCalledWith(expect.objectContaining({ key: "a", code: "KeyA", ctrl: false, tag: "BODY" }));
  });

  it("stops the drain timer and the direct registration when the last subscriber leaves", async () => {
    const bp = fakeBigPictureWindow();
    installSteam(bp.view);
    const { subscribeControllerInput } = await loadModules();
    const offA = subscribeControllerInput(vi.fn());
    const offB = subscribeControllerInput(vi.fn());
    expect(vi.getTimerCount()).toBe(1);

    offA();
    expect(vi.getTimerCount()).toBe(1);
    expect(bp.input.unregister).not.toHaveBeenCalled();

    offB();
    expect(vi.getTimerCount()).toBe(0);
    expect(bp.input.unregister).toHaveBeenCalledTimes(1);
  });
});
