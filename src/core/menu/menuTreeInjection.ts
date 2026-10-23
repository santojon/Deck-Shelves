import { fakeRenderComponent, getFrontendLib } from "../../runtime/host/decky";
import { steamReact } from "../../steam/internals";
import { DS_ROOT_KEYS, buildDeckShelvesMenuItems, devInfo, devWarn, resolveShelfIdFromProps } from "./menuContext";

/* Injecting the Deck Shelves items into a rendered game menu: find the Menu
   node in the React tree (or fall back to the root), and patch whatever shape
   the captured menu component has (memo, forwardRef, class, plain function) so
   every later render carries the items. */

// Cache of patched/wrapped captured components so we patch each component
// at most once and can dedupe across showGameMenu calls.
const patchedComponents = new WeakSet<any>();
const wrappedComponents = new WeakMap<any, any>();

function containsDsItems(children: any): boolean {
  if (!Array.isArray(children)) return false;
  return children.some((c: any) => DS_ROOT_KEYS.has(c?.key));
}

function findMenuNode(rendered: any, fl: any): any {
  return fl.findInReactTree(rendered, (node: any) => {
    if (!node || typeof node !== "object" || !node.props) return false;
    if (node.type === fl.Menu) return true;
    if (typeof node.props.label !== "string") return false;
    const ch = node.props.children;
    return Array.isArray(ch) || (ch !== undefined && ch !== null);
  });
}

function toChildArray(children: any): any[] {
  if (Array.isArray(children)) return children;
  return children !== undefined && children !== null ? [children] : [];
}

function appendToMenuNode(menu: any, items: any[], shelfId: string): boolean {
  const existing = toChildArray(menu.props.children);
  if (containsDsItems(existing)) {
    devInfo("[DS][menu] inject skipped — DS items already present in Menu node", { shelfId });
    return false;
  }
  menu.props.children = [...existing, ...items];
  devInfo("[DS][menu] injected", { shelfId, label: menu.props.label, before: existing.length, added: items.length });
  return true;
}

function fallbackInjectIntoRoot(rendered: any, items: any[], fl: any, R: any, shelfId: string): void {
  const existing = rendered.props.children;
  if (containsDsItems(existing)) {
    devInfo("[DS][menu] root inject skipped — DS items already present", { shelfId });
    return;
  }
  const sep = fl.MenuSeparator ? R.createElement(fl.MenuSeparator, { key: "ds-sep-fallback" }) : null;
  if (Array.isArray(existing)) {
    if (sep) existing.push(sep);
    for (const it of items) existing.push(it);
  } else if (existing != null) {
    rendered.props.children = sep ? [existing, sep, ...items] : [existing, ...items];
  } else {
    rendered.props.children = items;
  }
  devInfo("[DS][menu] injected via root fallback", { shelfId, added: items.length });
}

export function injectDeckShelvesIntoTree(rendered: any, shelfId: string): any {
  if (!rendered) { devInfo("[DS][menu] inject skipped — rendered is null"); return rendered; }
  const fl = getFrontendLib();
  const R = steamReact();
  if (!fl?.findInReactTree) {
    devWarn("[DS][menu] inject skipped — fl.findInReactTree unavailable");
    return rendered;
  }
  try {
    return injectItemsOrFallback(rendered, shelfId, fl, R);
  } catch (e) {
    try { (globalThis as any).console?.warn?.("[DS][menu] injectDeckShelvesIntoTree threw", e); } catch {}
    return rendered;
  }
}

function injectItemsOrFallback(rendered: any, shelfId: string, fl: any, R: any): any {
  const items = buildDeckShelvesMenuItems(shelfId, fl, R);
  if (!items.length) {
    devWarn("[DS][menu] no items to inject — buildDeckShelvesMenuItems returned []");
    return rendered;
  }
  const menu = findMenuNode(rendered, fl);
  if (menu?.props) { appendToMenuNode(menu, items, shelfId); return rendered; }
  if (rendered?.props) fallbackInjectIntoRoot(rendered, items, fl, R, shelfId);
  else devWarn("[DS][menu] rendered has no props — skipping inject", { shelfId });
  return rendered;
}

// React internal type tags (stable Symbol.for handles that survive
// bundling) for detecting memo/forwardRef wrappers.
const REACT_MEMO_TYPE = typeof Symbol === "function" ? Symbol.for("react.memo") : 0xead3;
const REACT_FORWARD_REF_TYPE = typeof Symbol === "function" ? Symbol.for("react.forward_ref") : 0xead0;

function makeRenderPatchHandler(extractProps: (args: any[], self: any) => any) {
  return function (this: any, args: any[], result: any) {
    const props = extractProps(args, this);
    const shelfId = resolveShelfIdFromProps(props);
    return shelfId ? injectDeckShelvesIntoTree(result, shelfId) : result;
  };
}

const propsFromArgs = (args: any[]) => args?.[0];
const propsFromThis = (_args: any[], self: any) => self?.props;

function patchRenderOnce(target: any, prop: string, handler: any, fl: any, kind: string, name: string): void {
  if (patchedComponents.has(target)) return;
  try {
    fl.afterPatch(target, prop, handler);
    patchedComponents.add(target);
    devInfo(`[DS][menu] afterPatch installed (${kind})`, { name });
  } catch (e) {
    try { (globalThis as any).console?.warn?.(`[DS][menu] afterPatch ${kind} failed`, e); } catch {}
  }
}

function tryPatchMemo(inner: any): any | null {
  if (typeof inner !== "object" || inner?.$$typeof !== REACT_MEMO_TYPE || !inner.type) return null;
  const patched = getInjectedMenuComponent(inner.type);
  if (patched && patched !== inner.type) { try { inner.type = patched; } catch {} }
  devInfo("[DS][menu] memo unwrapped — patched inner type", { wrappedKind: typeof inner.type });
  return inner;
}

function tryPatchForwardRef(inner: any, fl: any): any | null {
  if (typeof inner !== "object" || inner?.$$typeof !== REACT_FORWARD_REF_TYPE) return null;
  if (typeof inner.render !== "function") return null;
  patchRenderOnce(inner, "render", makeRenderPatchHandler(propsFromArgs), fl,
    "forwardRef via $$typeof", inner.displayName ?? "<forwardRef>");
  return inner;
}

function tryPatchClass(inner: any, fl: any): any | null {
  if (!inner?.prototype || typeof inner.prototype.render !== "function") return null;
  patchRenderOnce(inner.prototype, "render", makeRenderPatchHandler(propsFromThis), fl,
    "class", inner.name ?? inner?.displayName ?? "<anon>");
  return inner;
}

function tryPatchDuckForwardRef(inner: any, fl: any): any | null {
  if (typeof inner.render !== "function" || inner.render === inner) return null;
  patchRenderOnce(inner, "render", makeRenderPatchHandler(propsFromArgs), fl,
    "forwardRef duck", inner.displayName ?? "<forwardRef>");
  return inner;
}

function unwrapThinFunctionWrapper(inner: Function): void {
  if (typeof fakeRenderComponent !== "function") return;
  try {
    const fake = fakeRenderComponent(inner);
    const innerType = fake?.type;
    if (innerType && innerType !== inner) {
      getInjectedMenuComponent(innerType);
      devInfo("[DS][menu] thin wrapper unwrapped — patched inner type",
        { wrapperName: (inner as any).name ?? "<anon>", innerKind: typeof innerType });
    }
  } catch (e) {
    try { (globalThis as any).console?.warn?.("[DS][menu] thin-wrapper unwrap failed", e); } catch {}
  }
}

function wrapFunctionComponent(inner: Function): any {
  unwrapThinFunctionWrapper(inner);
  const cached = wrappedComponents.get(inner);
  if (cached) return cached;
  const wrapped = function DSPatchedAppContextMenu(props: any) { return (inner as any)(props); };
  wrappedComponents.set(inner, wrapped);
  devInfo("[DS][menu] HOC wrapper created (function)",
    { name: (inner as any).name ?? (inner as any).displayName ?? "<anon>" });
  return wrapped;
}

function tryAfterPatchVariants(inner: any, fl: any): any | null {
  if (typeof fl.afterPatch !== "function") return null;
  return tryPatchForwardRef(inner, fl) ?? tryPatchClass(inner, fl) ?? tryPatchDuckForwardRef(inner, fl);
}

function logNoPatchMatch(inner: any): void {
  devWarn("[DS][menu] no patch path matched", {
    kind: typeof inner,
    $$typeof: inner?.$$typeof?.toString?.(),
    name: inner?.name ?? inner?.displayName,
  });
}

export function getInjectedMenuComponent(inner: any): any {
  if (!inner) return inner;
  const fl = getFrontendLib();
  if (!fl) { devWarn("[DS][menu] inject skipped — frontend lib not available"); return inner; }
  const handled = tryPatchMemo(inner) ?? tryAfterPatchVariants(inner, fl);
  if (handled) return handled;
  if (typeof inner === "function") return wrapFunctionComponent(inner);
  logNoPatchMatch(inner);
  return inner;
}
