import { useEffect, useState } from 'react';

let current = false;
const emitter = new EventTarget();
const EVENT = 'ds-qam-expanded-changed';

// Drive the native QAM compositor expansion using the same protocol the
// Friends & Chat module uses. window.opener of the QAM is the
// SharedJSContext, which hosts the FriendsUI singleton that listens for
// these messages, toggles its observable state, and (via Steam internals)
// makes the compositor render the wide QAM layout.
function notifyCompositor(expanded: boolean): void {
  // eslint-disable-next-line no-console
  console.log('[DS-NOTIFY]', 'start', expanded, 'opener=', !!(globalThis as { opener?: unknown }).opener);
  const g = (globalThis as unknown as { opener?: Window | null });
  const opener = g.opener ?? null;
  if (!opener) {
    // eslint-disable-next-line no-console
    console.log('[DS-NOTIFY]', 'no opener');
    return;
  }
  try {
    opener.postMessage(
      { message: expanded ? 'QamFriendsExpanded' : 'QamFriendsHidden' },
      'https://steamloopback.host',
    );
    // eslint-disable-next-line no-console
    console.log('[DS-NOTIFY]', 'sent', expanded);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[DS-NOTIFY]', 'err', String(e));
  }
}

export function getQamExpanded(): boolean {
  return current;
}

export function setQamExpanded(next: boolean | ((prev: boolean) => boolean)): void {
  const g = globalThis as unknown as { __ds_set_count__?: number; __ds_last_set__?: unknown };
  g.__ds_set_count__ = (g.__ds_set_count__ ?? 0) + 1;
  g.__ds_last_set__ = { type: typeof next, t: Date.now() };
  const value = typeof next === 'function' ? next(current) : next;
  if (value === current) return;
  current = value;
  notifyCompositor(value);
  emitter.dispatchEvent(new Event(EVENT));
}

export function toggleQamExpanded(): void {
  setQamExpanded((v) => !v);
}

// Debug hook used by the screenshot scripts and CDP probes to drive the
// sidecar open/closed without having to simulate a real gamepad input
// (SteamClient.Input doesn't fire for dispatched keyboard events). Safe
// to leave always-on — it's the same setter the React tree calls.
try {
  const g = globalThis as unknown as { __ds_qam_expanded__?: unknown };
  g.__ds_qam_expanded__ = { set: setQamExpanded, get: getQamExpanded, toggle: toggleQamExpanded };
} catch {}

export function useQamExpanded(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const sync = () => setValue(current);
    emitter.addEventListener(EVENT, sync);
    sync();
    return () => emitter.removeEventListener(EVENT, sync);
  }, []);
  return [value, setQamExpanded];
}
