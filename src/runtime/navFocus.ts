// Forcibly move Steam's NavTree focus to a given DOM element. The
// pattern is lifted from the QAM sidecar's known-working sequence:
/* walk the active nav tree (via opener.SteamUIStore.NavigationManager),
   find the NavNode whose `m_element` matches our target, and call
   `BTakeFocus(0)` on it. Returns `true` when BTakeFocus reports it was
   honored; the caller should still retry on a short loop to win the
   race with Steam's post-mount tree rebuild. */

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

// The active nav-tree root reachable from a SteamUIStore (undefined if any hop
// is missing).
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

export function takeNavTreeFocusOnFirstChild(container: HTMLElement): boolean {
  const first = container.querySelector(".Focusable") as HTMLElement | null;
  if (!first) return false;
  return takeNavTreeFocus(first);
}
