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
  // The QAM's real window is reachable through the shared DOM.
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

// Two copies can mount at once; only the visible one runs the singleton effects.
// Starts inactive: starting active let a hidden copy reset the shared state for one commit.
function isShown(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function useIsActiveQamTab(scopeRef: { current: HTMLElement | null }): boolean {
  const [isActive, setIsActive] = useState(false);
  useEffect(() => {
    const el = scopeRef.current;
    if (!el) return;
    setIsActive(isShown(el));
    const io = new IntersectionObserver(
      (entries) => setIsActive(entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scopeRef]);
  return isActive;
}

export function shouldRenderSidecar(isActiveTab: boolean, qamExpanded: boolean): boolean {
  return isActiveTab && qamExpanded;
}
