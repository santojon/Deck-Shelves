import { reportError, reportOnce, type AnyFn, type Badge, type Fiber, type Installation } from "./ownQamTabBase";
import { listBelow, rootElementsIn, type Located } from "./ownQamTabDiscovery";
import { adaptRootOutput, badgeOf, clearBeforeRoot, LIST_REF_LIMIT, prepareElements } from "./ownQamTabEntry";
import { restoreRootFiber, restoreSteam, seeThrough } from "./ownQamTabRestore";

// The plugin loader's tab key, and the neutral host's, which only the host's own entry may use.
const LOADER_TAB_KEY = 999;
const HOST_TAB_KEY = 900;

function isPlainFunction(t: unknown): t is AnyFn {
  return typeof t === "function" && !(t.prototype && t.prototype.isReactComponent);
}

function adaptHostOutput(inst: Installation, out: unknown): void {
  try {
    for (const el of rootElementsIn(out)) {
      const t = el.type;
      if (!isPlainFunction(t) || Object.isFrozen(el)) continue;
      const wrapped = rootWrap(inst, t);
      if (wrapped !== t) el.type = wrapped;
    }
  } catch (err) {
    reportError(inst, "panel host", err);
  }
  try { clearBeforeRoot(inst); } catch (err) { reportError(inst, "tab list", err); }
}

function wrapperFor(
  inst: Installation,
  made: WeakMap<AnyFn, AnyFn>,
  found: AnyFn,
  adapt: (inst: Installation, out: unknown) => void,
): AnyFn {
  if (inst.inner.has(found)) return found;
  const known = madeFor(inst, made, found);
  if (known) return known;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const out = found.apply(this, args);
    if (inst.live) adapt(inst, out);
    return out;
  };
  made.set(found, wrapped);
  inst.inner.set(wrapped, found);
  return wrapped;
}

// Reuses the wrapper made for a function, so a hand-over doesn't change the types Steam renders.
function madeFor(inst: Installation, made: WeakMap<AnyFn, AnyFn>, found: AnyFn): AnyFn | undefined {
  let v: AnyFn | undefined = found;
  for (let hops = 0; v && hops < LIST_REF_LIMIT; hops++) {
    const known = made.get(v);
    if (known) return known;
    let next: AnyFn | undefined;
    for (const b of inst.adopted) next ??= b.wrapperOf(v);
    v = next;
  }
  return undefined;
}

function rootWrap(inst: Installation, found: AnyFn): AnyFn {
  return wrapperFor(inst, inst.rootWraps, found, adaptRootOutput);
}

function hostWrap(inst: Installation, found: AnyFn): AnyFn {
  return wrapperFor(inst, inst.hostWraps, found, adaptHostOutput);
}

function setFiberType(fiber: Fiber, type: AnyFn, elementType?: unknown): void {
  for (const f of [fiber, fiber.alternate]) {
    if (!f) continue;
    f.type = type;
    if (elementType !== undefined) f.elementType = elementType;
  }
}

function hookMemo(inst: Installation, memo: Record<string, any>): void {
  const inner = memo.type;
  if (!isPlainFunction(inner) || inst.inner.has(inner)) return;
  const wrapped = hostWrap(inst, inner);
  memo.type = wrapped;
  inst.undo.push(() => { if (memo.type === wrapped) memo.type = seeThrough(inst, inner); });
}

function hookHostFiber(inst: Installation, fiber: Fiber): boolean {
  const target = typeof fiber.type === "function" ? fiber : fiber.child;
  if (!target || !isPlainFunction(target.type)) return false;
  const prev = target.type;
  const wrapped = hostWrap(inst, prev);
  if (wrapped === prev) return true;
  setFiberType(target, wrapped);
  const ref = new WeakRef(target);
  inst.hosts.push(ref);
  inst.undo.push(() => {
    const f = ref.deref();
    if (f && f.type === wrapped) setFiberType(f, seeThrough(inst, prev));
  });
  return true;
}

function hookRootFiber(inst: Installation, fiber: Fiber): void {
  const prevType = fiber.type;
  const prevElementType = fiber.elementType;
  if (!isPlainFunction(prevType)) return;
  const wrapped = rootWrap(inst, prevType);
  if (isPlainFunction(prevElementType) && prevElementType !== wrapped) inst.rootWraps.set(prevElementType, wrapped);
  setFiberType(fiber, wrapped, wrapped);
  const ref = new WeakRef(fiber);
  inst.undo.push(() => restoreRootFiber(ref.deref(), wrapped, seeThrough(inst, prevType), seeThrough(inst, prevElementType)));
}

function otherCopies(inst: Installation, found: Located): Badge[] {
  const badges: Badge[] = [];
  for (const { root } of found.pairs) {
    for (const e of listBelow(root) ?? []) {
      const b = badgeOf(inst, e);
      if (b && b !== inst.badge && !badges.includes(b)) badges.push(b);
    }
  }
  return badges;
}

function takeOver(inst: Installation, found: Located): boolean {
  const others = otherCopies(inst, found);
  if (others.some((b) => b.since > inst.badge.since)) {
    inst.phase = "stopped";
    reportOnce(inst, "newer-copy", "info", "Quick Access tab: a newer copy shows the tab");
    return false;
  }
  for (const b of others) {
    try { b.stepDown(); } catch (err) { reportError(inst, "handing over", err); }
  }
  return true;
}

function keyProblem(inst: Installation, found: Located): string | null {
  const key = inst.o.key;
  if (found.keyNamed) return "Steam already names this key";
  if (key === LOADER_TAB_KEY || (inst.o.yieldToHostTab && key === HOST_TAB_KEY)) return "this key is another party's";
  return null;
}

function apply(inst: Installation, found: Located): void {
  const problem = keyProblem(inst, found);
  if (problem) {
    inst.phase = "stopped";
    reportOnce(inst, "key", "warn", `Quick Access tab: ${problem}`, inst.o.key);
    return;
  }
  if (!takeOver(inst, found)) return;
  inst.perfKey = found.perfKey;
  prepareElements(inst);
  for (const memo of found.memos) hookMemo(inst, memo as Record<string, any>);
  for (const { host, root } of found.pairs) {
    if (hookHostFiber(inst, host)) hookRootFiber(inst, root);
  }
  inst.phase = "working";
  reportOnce(inst, "installed", "info", "Quick Access tab: installed", inst.o.key);
}

export function applyFound(inst: Installation, found: Located): void {
  try {
    apply(inst, found);
  } catch (err) {
    reportError(inst, "start-up", err);
    inst.phase = "stopped";
    restoreSteam(inst);
  }
}
