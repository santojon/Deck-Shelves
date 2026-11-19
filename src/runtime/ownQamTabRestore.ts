import type { AnyFn, Fiber, Installation } from "./ownQamTabBase";
import { walkBelow } from "./ownQamTabDiscovery";
import { LIST_REF_LIMIT, removeOwnEntries } from "./ownQamTabEntry";

export function seeThrough<T>(inst: Installation, value: T): T {
  let v: unknown = value;
  for (let hops = 0; hops < LIST_REF_LIMIT; hops++) {
    let next: AnyFn | undefined;
    for (const b of inst.adopted) next ??= b.unwrap(v);
    if (!next) break;
    v = next;
  }
  return v as T;
}

// When only the element type goes back, Steam keeps the mounted instance on the replacement.
export function restoreRootFiber(fiber: Fiber | undefined, wrapped: AnyFn, prevType: AnyFn, prevElementType: unknown): void {
  for (const f of fiber ? [fiber, fiber.alternate] : []) {
    if (!f) continue;
    if (f.type === wrapped) f.type = prevType;
    if (f.elementType === wrapped) f.elementType = prevElementType;
  }
}

// A root that mounted again while installed took this installation's wrapper as its type.
function unwrapFiber(inst: Installation, fiber: Fiber): boolean {
  for (const f of [fiber, fiber.alternate]) {
    if (!f) continue;
    const type = inst.inner.get(f.type);
    if (type) f.type = seeThrough(inst, type);
    const elementType = inst.inner.get(f.elementType);
    if (elementType) f.elementType = seeThrough(inst, elementType);
  }
  return false;
}

export function restoreSteam(inst: Installation): void {
  removeOwnEntries(inst);
  for (const undo of inst.undo.splice(0)) {
    try { undo(); } catch {}
  }
  for (const ref of inst.hosts.splice(0)) {
    const host = ref.deref();
    try { if (host) walkBelow(host, (f) => unwrapFiber(inst, f)); } catch {}
  }
}
