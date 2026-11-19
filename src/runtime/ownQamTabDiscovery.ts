import { findModule } from "./host/decky";
import { steamUIStore } from "../steam/internals";
import { isObject, type Fiber, type Installation, type TabList } from "./ownQamTabBase";

const NODE_SCAN_LIMIT = 300;
const TREE_VISIT_LIMIT = 40000;
const CLIMB_LIMIT = 16;
const LIST_SEARCH_LIMIT = 128;
const OUTPUT_VISIT_LIMIT = 300;
const OUTPUT_DEPTH_LIMIT = 16;

const SHOW_ELEMENT = 1;

const MEMO_TYPE = Symbol.for("react.memo");
const PORTAL_TYPE = Symbol.for("react.portal");

export type Located = {
  pairs: Array<{ host: Fiber; root: Fiber }>;
  memos: object[];
  perfKey: number;
  keyNamed: boolean;
};

function isMemo(v: unknown): boolean {
  return isObject(v) && v.$$typeof === MEMO_TYPE;
}

function isTabList(v: unknown): v is TabList {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.every((e) => isObject(e) && typeof e.key === "number" && "panel" in e);
}

function isRootProps(p: unknown): boolean {
  return isObject(p) && "showHeaderAndFooter" in p && "onFocusNavActivated" in p && "onFocusNavDeactivated" in p;
}

function isElementLike(v: unknown): v is Record<string, any> {
  return isObject(v) && typeof v.$$typeof === "symbol";
}

function childValues(node: Record<string, any>): unknown[] {
  if (node.$$typeof === PORTAL_TYPE) return [node.children];
  const props = node.props;
  return isObject(props) ? Object.values(props) : [];
}

function pushValues(stack: Array<[unknown, number]>, values: unknown[], depth: number): void {
  for (let i = 0; i < values.length && stack.length < OUTPUT_VISIT_LIMIT; i++) {
    if (isObject(values[i])) stack.push([values[i], depth]);
  }
}

function walkOutput(out: unknown, visit: (node: Record<string, any>) => boolean): void {
  const stack: Array<[unknown, number]> = [[out, 0]];
  for (let visited = 0; stack.length && visited < OUTPUT_VISIT_LIMIT; visited++) {
    const [node, depth] = stack.pop()!;
    if (depth > OUTPUT_DEPTH_LIMIT) continue;
    if (Array.isArray(node)) {
      if (!isTabList(node)) pushValues(stack, node, depth + 1);
    } else if (isElementLike(node) && !visit(node)) {
      pushValues(stack, childValues(node), depth + 1);
    }
  }
}

export function listsIn(out: unknown): TabList[] {
  const lists: TabList[] = [];
  walkOutput(out, (node) => {
    const props = node.props;
    if (!isObject(props)) return false;
    for (const v of Object.values(props)) if (isTabList(v) && !lists.includes(v)) lists.push(v);
    return false;
  });
  return lists;
}

export function rootElementsIn(out: unknown): Array<Record<string, any>> {
  const found: Array<Record<string, any>> = [];
  walkOutput(out, (node) => {
    if (!isRootProps(node.props)) return false;
    found.push(node);
    return true;
  });
  return found;
}

function mainDocument(): Document | null {
  const doc = steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
  return doc && typeof doc.createTreeWalker === "function" ? doc : null;
}

function fiberOf(node: Node): Fiber | null {
  for (const name of Object.keys(node)) {
    if (name.startsWith("__reactFiber$") || name.startsWith("__reactContainer$")) {
      const f = (node as any)[name];
      if (isObject(f)) return f as Fiber;
    }
  }
  return null;
}

function firstFiber(doc: Document): Fiber | null {
  const body = doc.body;
  if (!body) return null;
  const walker = doc.createTreeWalker(body, SHOW_ELEMENT);
  let node: Node | null = body;
  for (let i = 0; node && i < NODE_SCAN_LIMIT; i++) {
    const f = fiberOf(node);
    if (f) return f;
    node = walker.nextNode();
  }
  return null;
}

function treeTop(start: Fiber): Fiber {
  let f = start;
  for (let i = 0; i < TREE_VISIT_LIMIT && f.return; i++) f = f.return;
  const live = f.stateNode?.current;
  return isObject(live) ? (live as Fiber) : f;
}

function rootFibers(top: Fiber): Fiber[] {
  const found: Fiber[] = [];
  const stack: Fiber[] = [top];
  let visited = 0;
  while (stack.length && visited < TREE_VISIT_LIMIT) {
    const f = stack.pop()!;
    visited += 1;
    if (isRootProps(f.memoizedProps) && !isMemo(f.elementType)) found.push(f);
    else if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
  return found;
}

function memoAbove(fiber: Fiber): Fiber | null {
  let f = fiber.return;
  for (let i = 0; i < CLIMB_LIMIT && f; i++, f = f.return) {
    if (isMemo(f.elementType)) return f;
  }
  return null;
}

function readExport(mod: Record<string, any>, name: string): unknown {
  try { return mod[name]; } catch { return undefined; }
}

function isKeyTable(v: unknown): v is Record<string, unknown> {
  if (!isObject(v) || Array.isArray(v) || typeof v.$$typeof === "symbol") return false;
  const perf = v.Perf;
  if (typeof perf !== "number") return false;
  const name = v[perf];
  return typeof name === "string" && v[name] === perf;
}

function scanModules(known: Set<object>): { memos: object[]; table: Record<string, unknown> } | null {
  let memos: object[] | null = null;
  let table: Record<string, unknown> | null = null;
  const visit = (mod: unknown): boolean => {
    try {
      if (!isObject(mod)) return false;
      const values = Object.keys(mod).map((name) => readExport(mod, name));
      if (!memos && values.some((v) => isObject(v) && known.has(v))) memos = values.filter((v): v is object => isMemo(v));
      if (!table) table = (values.find(isKeyTable) as Record<string, unknown> | undefined) ?? null;
      return !!memos && !!table;
    } catch {
      return false;
    }
  };
  try { findModule(visit); } catch {}
  return memos && table ? { memos, table } : null;
}

export function locate(inst: Installation): Located | null {
  const doc = mainDocument();
  const start = doc ? firstFiber(doc) : null;
  if (!start) return null;
  const pairs: Array<{ host: Fiber; root: Fiber }> = [];
  for (const root of rootFibers(treeTop(start))) {
    const host = memoAbove(root);
    if (host) pairs.push({ host, root });
  }
  if (!pairs.length) return null;
  const scanned = scanModules(new Set(pairs.map((p) => p.host.elementType as object)));
  if (!scanned) return null;
  const perfKey = scanned.table.Perf as number;
  return { pairs, memos: scanned.memos, perfKey, keyNamed: scanned.table[inst.o.key] !== undefined };
}

export function walkBelow(start: Fiber, visit: (f: Fiber) => boolean): void {
  const queue: Fiber[] = start.child ? [start.child] : [];
  for (let i = 0; i < queue.length && i < LIST_SEARCH_LIMIT; i++) {
    const f = queue[i];
    if (visit(f)) return;
    if (f.child) queue.push(f.child);
    if (f.sibling) queue.push(f.sibling);
  }
}

export function listBelow(root: Fiber): TabList | null {
  let found: TabList | null = null;
  walkBelow(root, (f) => {
    const props = f.memoizedProps;
    found = isObject(props) ? ((Object.values(props).find(isTabList) as TabList | undefined) ?? null) : null;
    return !!found;
  });
  return found;
}
