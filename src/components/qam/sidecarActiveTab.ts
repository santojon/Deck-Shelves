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

export function useQamCompositorSync(qamExpanded: boolean, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const opener = (getQamWindow()?.opener ?? null) as Window | null;
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
