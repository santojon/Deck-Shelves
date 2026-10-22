// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { installFallbackPoll, FALLBACK_FAST_MS, FALLBACK_IDLE_MS, FALLBACK_BACKOFF_MS } from "../../runtime/homePatchFallback";
import { installPowerGate, getPowerGateStats, __resetPowerGateForTest } from "../../runtime/powerGate";
import { installSessionState } from "../../runtime/sessionState";

const steam = { lifetime: null as null | ((n: any) => void), running: [] as number[] };
function installSteamGlobals(): void {
  (globalThis as any).SteamClient = {
    GameSessions: { RegisterForAppLifetimeNotifications: (cb: any) => { steam.lifetime = cb; return { unregister() {} }; } },
    System: {},
  };
  (globalThis as any).SteamUIStore = { get RunningApps() { return steam.running; } };
}
function startGame(): void { steam.running = [1]; steam.lifetime?.({ unAppID: 1, bRunning: true }); }
function stopGame(): void { steam.running = []; steam.lifetime?.({ unAppID: 1, bRunning: false }); }

describe("homePatch fallback poll under the power gate", () => {
  let uninstallSession: (() => void) | null = null;
  let mounted = false;
  let tryRender: Mock<() => void>;
  beforeEach(() => {
    vi.useFakeTimers();
    steam.running = []; mounted = false;
    installSteamGlobals();
    __resetPowerGateForTest();
    installPowerGate();
    uninstallSession = installSessionState();
    tryRender = vi.fn<() => void>();
  });
  afterEach(() => {
    if (steam.running.length) stopGame();
    uninstallSession?.(); uninstallSession = null;
    __resetPowerGateForTest();
    vi.useRealTimers();
    delete (globalThis as any).SteamClient; delete (globalThis as any).SteamUIStore;
  });

  it("renders once at registration, polls fast then idle, and stops for good once the fallback is mounted", () => {
    const poll = installFallbackPoll(tryRender, () => mounted);
    expect(tryRender).toHaveBeenCalledTimes(1);
    expect(poll.running()).toBe(true);
    vi.advanceTimersByTime(FALLBACK_FAST_MS * 30);
    expect(tryRender).toHaveBeenCalledTimes(31);
    vi.advanceTimersByTime(FALLBACK_IDLE_MS * 2);
    expect(tryRender).toHaveBeenCalledTimes(33);
    mounted = true;
    vi.advanceTimersByTime(FALLBACK_IDLE_MS);
    expect(tryRender).toHaveBeenCalledTimes(34);
    expect(poll.running()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(tryRender).toHaveBeenCalledTimes(34);
    poll.dispose();
  });

  it("does not run while a game runs; the return renders once and restarts the poll when not mounted", () => {
    startGame();
    const poll = installFallbackPoll(tryRender, () => mounted);
    vi.advanceTimersByTime(30_000);
    expect(tryRender).not.toHaveBeenCalled();
    expect(poll.running()).toBe(false);
    stopGame();
    expect(tryRender).toHaveBeenCalledTimes(1);
    expect(poll.running()).toBe(true);
    vi.advanceTimersByTime(FALLBACK_FAST_MS);
    expect(tryRender).toHaveBeenCalledTimes(2);
    poll.dispose();
  });

  it("a game started mid-poll stops it; the return with the fallback mounted renders once and stays idle", () => {
    const poll = installFallbackPoll(tryRender, () => mounted);
    vi.advanceTimersByTime(FALLBACK_FAST_MS * 2);
    expect(tryRender).toHaveBeenCalledTimes(3);
    startGame();
    expect(poll.running()).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(tryRender).toHaveBeenCalledTimes(3);
    mounted = true;
    stopGame();
    expect(tryRender).toHaveBeenCalledTimes(4);
    expect(poll.running()).toBe(false);
    poll.dispose();
  });

  it("a return to the Home after the first start resumes at the idle cadence, not the fast one", () => {
    const poll = installFallbackPoll(tryRender, () => mounted);
    vi.advanceTimersByTime(FALLBACK_FAST_MS * 30);
    const before = tryRender.mock.calls.length;
    startGame();
    expect(poll.running()).toBe(false);
    stopGame();
    expect(tryRender).toHaveBeenCalledTimes(before + 1);
    expect(poll.running()).toBe(true);
    vi.advanceTimersByTime(FALLBACK_IDLE_MS - 1);
    expect(tryRender).toHaveBeenCalledTimes(before + 1);
    vi.advanceTimersByTime(1);
    expect(tryRender).toHaveBeenCalledTimes(before + 2);
    // A game that interrupts the fast phase: the return is idle too.
    poll.wake();
    vi.advanceTimersByTime(FALLBACK_FAST_MS * 2);
    const mid = tryRender.mock.calls.length;
    startGame(); stopGame();
    vi.advanceTimersByTime(FALLBACK_IDLE_MS - 1);
    expect(tryRender).toHaveBeenCalledTimes(mid + 1);
    poll.dispose();
  });

  it("wake() restarts a stopped poll (host document going away) and it stops again once mounted", () => {
    mounted = true;
    const poll = installFallbackPoll(tryRender, () => mounted);
    expect(poll.running()).toBe(false);
    poll.wake();
    expect(poll.running()).toBe(true);
    vi.advanceTimersByTime(FALLBACK_FAST_MS);
    expect(tryRender).toHaveBeenCalledTimes(2);
    expect(poll.running()).toBe(false);
    startGame();
    poll.wake();
    expect(poll.running()).toBe(false);
    poll.dispose();
  });

  it("backoff() slows the poll to 15 s after repeated anchor misses", () => {
    const poll = installFallbackPoll(tryRender, () => mounted);
    poll.backoff();
    vi.advanceTimersByTime(FALLBACK_BACKOFF_MS - 1);
    expect(tryRender).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(tryRender).toHaveBeenCalledTimes(2);
    poll.dispose();
  });

  it("dispose() stops the timer and unregisters the task", () => {
    const poll = installFallbackPoll(tryRender, () => mounted);
    poll.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(getPowerGateStats().tasks.homePatchFallback).toBeUndefined();
    startGame(); stopGame();
    expect(tryRender).toHaveBeenCalledTimes(1);
  });
});
