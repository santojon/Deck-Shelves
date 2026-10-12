// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { observeShelfNear, __resetShelfViewportGateForTest } from "../../../components/shelf/shelfViewportGate";
import { getPerfSnapshot, __resetPerfMetricsForTest } from "../../../core/perfMetrics";

class FakeIO {
  static instances: FakeIO[] = [];
  observed = new Set<Element>();
  disconnected = false;
  constructor(public cb: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void, public opts: { root: Element | null }) {
    FakeIO.instances.push(this);
  }
  observe(el: Element): void { this.observed.add(el); }
  unobserve(el: Element): void { this.observed.delete(el); }
  disconnect(): void { this.disconnected = true; }
}

function scroller(): HTMLElement {
  const root = document.createElement("div");
  root.style.setProperty("overflow-y", "auto");
  document.body.appendChild(root);
  return root;
}

function shelfIn(root: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  root.appendChild(el);
  return el;
}

describe("shelfViewportGate — one observer per scroll root, counted and cleaned up", () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIO);
    document.body.innerHTML = "";
    __resetShelfViewportGateForTest();
    __resetPerfMetricsForTest();
  });

  it("shares one observer between the shelves of a scroll root and counts it once", () => {
    const root = scroller();
    observeShelfNear(shelfIn(root), () => {});
    observeShelfNear(shelfIn(root), () => {});
    expect(FakeIO.instances.length).toBe(1);
    expect(FakeIO.instances[0].opts.root).toBe(root);
    expect(FakeIO.instances[0].observed.size).toBe(2);
    expect(getPerfSnapshot().activeObservers).toBe(1);
  });

  it("fires a shelf's callback once when it comes near, then stops watching that shelf", () => {
    const a = shelfIn(scroller());
    const cb = vi.fn();
    observeShelfNear(a, cb);
    const io = FakeIO.instances[0];
    io.cb([{ target: a, isIntersecting: false }]);
    expect(cb).not.toHaveBeenCalled();
    io.cb([{ target: a, isIntersecting: true }]);
    io.cb([{ target: a, isIntersecting: true }]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(io.observed.has(a)).toBe(false);
  });

  it("drops the observer of a scroll root that left the document once a new root shows up", () => {
    const old = scroller();
    observeShelfNear(shelfIn(old), () => {});
    old.remove();
    observeShelfNear(shelfIn(scroller()), () => {});
    expect(FakeIO.instances.length).toBe(2);
    expect(FakeIO.instances[0].disconnected).toBe(true);
    expect(FakeIO.instances[1].disconnected).toBe(false);
    expect(getPerfSnapshot().activeObservers).toBe(1);
  });

  it("runs the callback at once when there is nothing to observe", () => {
    const cb = vi.fn();
    observeShelfNear(null, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(FakeIO.instances.length).toBe(0);
  });
});
