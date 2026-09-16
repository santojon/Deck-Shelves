import { useEffect, useState } from 'react'

export type OpenerWithInput = {
  SteamClient?: {
    Input?: {
      RegisterForControllerInputMessages?: (
        cb: (slot: number, button: number, pressed: boolean) => void,
      ) => { unregister?: () => void };
    };
  };
};

export function getQamWindow(): (Window & OpenerWithInput) | null {
  // The plugin runs in a sandboxed JS context; the QAM's "real" window is
  // reachable through the shared DOM via `document.defaultView`.
  try {
    return (document.defaultView ?? null) as (Window & OpenerWithInput) | null;
  } catch {
    return null;
  }
}

/* Beta restructured the QAM into a wide, TAB-based panel; stable expands a Friends
   SIDE PANEL instead. When tabs are present the wide space already exists and the
   `QamFriendsExpanded` message just switches to the Friends tab (the empty
   "notifications" state on beta) — so callers skip it and render in place; stable
   (no tabs) keeps posting it. */
export function qamIsTabbed(doc: Document | null): boolean {
  try { return !!doc?.querySelector('[class*="tab_Friends"], [class*="tab_Notifications"]'); } catch { return false; }
}

export function useQamCompositorSync(qamExpanded: boolean, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const qamWin = getQamWindow();
    if (qamIsTabbed(qamWin?.document ?? null)) return; // beta: no Friends-expand message
    const opener = (qamWin?.opener ?? null) as Window | null;
    if (!opener) return;
    try {
      opener.postMessage(
        { message: qamExpanded ? 'QamFriendsExpanded' : 'QamFriendsHidden' },
        'https://steamloopback.host',
      );
    } catch {}
    return () => {
      try {
        opener.postMessage(
          { message: 'QamFriendsHidden' },
          'https://steamloopback.host',
        );
      } catch {}
    };
  }, [qamExpanded, enabled]);
}

// This panel can mount twice at once (a loader's tab AND a neutral host's
// native tab) — only the VISIBLE instance should manage the shared sidecar
// state, so callers gate their singleton effects behind this.
export function useIsActiveQamTab(scopeRef: { current: HTMLElement | null }): boolean {
  const [isActive, setIsActive] = useState(true);
  useEffect(() => {
    const el = scopeRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setIsActive(entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scopeRef]);
  return isActive;
}

// Small pure helper (not inlined into the render's `&&` chain) so this
// decision doesn't add another branch to DeckQAMSettings's own complexity.
export function shouldRenderSidecar(isActiveTab: boolean, qamExpanded: boolean): boolean {
  return isActiveTab && qamExpanded;
}
