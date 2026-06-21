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

function getActiveNavRoot(el: HTMLElement): NavNode | null {
  const view = el.ownerDocument?.defaultView as any;
  const candidates: any[] = [
    view?.opener?.SteamUIStore?.NavigationManager?.m_ActiveContext?.m_LastActiveNavTree?.m_Root,
    view?.SteamUIStore?.NavigationManager?.m_ActiveContext?.m_LastActiveNavTree?.m_Root,
    (globalThis as any).SteamUIStore?.NavigationManager?.m_ActiveContext?.m_LastActiveNavTree?.m_Root,
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
