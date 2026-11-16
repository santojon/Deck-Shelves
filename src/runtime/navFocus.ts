// Callers should retry briefly: Steam rebuilds the nav tree after mount.

type NavNode = {
  m_element?: HTMLElement;
  m_rgChildren?: NavNode[];
  BTakeFocus?: (reason: number) => boolean;
};

function findNavNodeFor(node: NavNode | undefined, target: HTMLElement): NavNode | null {
  if (!node) return null;
  if (node.m_element === target) return node;
  for (const c of (node.m_rgChildren ?? [])) {
    const r = findNavNodeFor(c, target);
    if (r) return r;
  }
  return null;
}

function navRootFrom(store: any): any {
  return store?.NavigationManager?.m_ActiveContext?.m_LastActiveNavTree?.m_Root;
}

function getActiveNavRoot(el: HTMLElement): NavNode | null {
  const view = el.ownerDocument?.defaultView as any;
  const candidates: any[] = [
    navRootFrom(view?.opener?.SteamUIStore),
    navRootFrom(view?.SteamUIStore),
    navRootFrom((globalThis as any).SteamUIStore),
  ];
  for (const c of candidates) {
    if (c) return c as NavNode;
  }
  return null;
}

export function takeNavTreeFocus(el: HTMLElement): boolean {
  try {
    const root = getActiveNavRoot(el);
    if (!root) return false;
    const node = findNavNodeFor(root, el);
    if (!node?.BTakeFocus) return false;
    return !!node.BTakeFocus(0);
  } catch {
    return false;
  }
}
