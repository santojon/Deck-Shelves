import { describe, it, expect, beforeEach } from "vitest";
import { registerDisposer, disposeAll, getDisposerCount } from "../../runtime/runtimeDisposer";

describe("runtimeDisposer", () => {
  beforeEach(() => {
    disposeAll();
  });

  it("starts empty", () => {
    expect(getDisposerCount()).toBe(0);
  });

  it("runs every registered disposer on disposeAll", () => {
    const calls: string[] = [];
    registerDisposer(() => calls.push("a"));
    registerDisposer(() => calls.push("b"));
    disposeAll();
    expect(calls).toEqual(["b", "a"]);
  });

  it("clears the registry after disposeAll (a second call is a no-op)", () => {
    registerDisposer(() => {});
    disposeAll();
    expect(getDisposerCount()).toBe(0);
    const calls: string[] = [];
    disposeAll();
    expect(calls).toEqual([]);
  });

  it("lets a subsystem unregister its own disposer without it firing", () => {
    const calls: string[] = [];
    const unregister = registerDisposer(() => calls.push("should not run"));
    unregister();
    expect(getDisposerCount()).toBe(0);
    disposeAll();
    expect(calls).toEqual([]);
  });

  it("isolates a throwing disposer — the rest still run", () => {
    const calls: string[] = [];
    registerDisposer(() => calls.push("first"));
    registerDisposer(() => { throw new Error("boom"); });
    registerDisposer(() => calls.push("third"));
    expect(() => disposeAll()).not.toThrow();
    expect(calls).toEqual(["third", "first"]);
  });

  it("reflects registered count before disposal", () => {
    registerDisposer(() => {});
    registerDisposer(() => {});
    expect(getDisposerCount()).toBe(2);
  });
});
