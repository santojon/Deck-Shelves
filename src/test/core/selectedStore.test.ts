import { describe, it, expect, vi } from "vitest";
import { createSelectedStore } from "../../core/selectedStore";

function makeStore(values: Map<number, string>) {
  let recompute: (() => void) | null = null;
  const detach = vi.fn();
  const attach = vi.fn((r: () => void) => { recompute = r; return detach; });
  const compute = vi.fn((key: number) => values.get(key) ?? "none");
  const store = createSelectedStore<string>({ compute, equal: (a, b) => a === b, attach });
  return { store, attach, detach, compute, signal: () => recompute?.() };
}

describe("selectedStore — one upstream subscription, per-key change notifications", () => {
  it("attaches upstream once for any number of keys and detaches when the last leaves", () => {
    const { store, attach, detach } = makeStore(new Map());
    const offA = store.subscribe(1, () => {});
    const offB = store.subscribe(2, () => {});
    const offA2 = store.subscribe(1, () => {});
    expect(attach).toHaveBeenCalledTimes(1);
    offA(); offB();
    expect(detach).not.toHaveBeenCalled();
    offA2();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("notifies only the keys whose computed value changed", () => {
    const values = new Map<number, string>([[1, "a"], [2, "b"], [3, "c"]]);
    const { store, signal } = makeStore(values);
    const cb1 = vi.fn(), cb2 = vi.fn(), cb3 = vi.fn();
    store.subscribe(1, cb1); store.subscribe(2, cb2); store.subscribe(3, cb3);
    expect(store.get(1)).toBe("a");
    expect(store.get(2)).toBe("b");
    values.set(2, "B");
    signal();
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb3).not.toHaveBeenCalled();
    expect(store.get(2)).toBe("B");
  });

  it("caches a value until it changes, and recomputes after an invalidate", () => {
    const values = new Map<number, string>([[7, "x"]]);
    const { store, compute } = makeStore(values);
    store.subscribe(7, () => {});
    store.get(7); store.get(7);
    expect(compute).toHaveBeenCalledTimes(1);
    store.invalidate(7);
    values.set(7, "y");
    expect(store.get(7)).toBe("y");
  });

  it("a key subscribed after a signal still sees the current value", () => {
    const values = new Map<number, string>([[4, "old"]]);
    const { store, signal } = makeStore(values);
    store.subscribe(9, () => {});
    values.set(4, "new");
    signal();
    const cb = vi.fn();
    store.subscribe(4, cb);
    expect(store.get(4)).toBe("new");
    expect(cb).not.toHaveBeenCalled();
  });
});
