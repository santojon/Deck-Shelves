import { useEffect, useState } from 'react';

// The QAM-expanded state is per QAM session: it never survives across
// QAM open/close cycles, even when the plugin tab itself stays mounted
// in SharedJSContext. Persisting at the module level produced stale-open
// reports — every fresh QAM open inherited the previous session's state.
// Backed by sessionStorage so the EXTERNAL setter (dpad bridge, CDP
// probes) can write before the React hook subscribes, and the popup's
// own browser context clears the store when Steam tears it down.
const STORAGE_KEY = '__ds_qam_expanded__';
const emitter = new EventTarget();
const EVENT = 'ds-qam-expanded-changed';

function readSession(): boolean {
  try { return globalThis.sessionStorage?.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}

function writeSession(value: boolean): void {
  try { globalThis.sessionStorage?.setItem(STORAGE_KEY, value ? '1' : '0'); }
  catch {}
}

let current = readSession();

// Drive the native QAM compositor expansion using the same protocol the
// Friends & Chat module uses. window.opener of the QAM.
function notifyCompositor(expanded: boolean): void {
  const g = (globalThis as unknown as { opener?: Window | null });
  const opener = g.opener ?? null;
  if (!opener) return;
  try {
    opener.postMessage(
      { message: expanded ? 'QamFriendsExpanded' : 'QamFriendsHidden' },
      'https://steamloopback.host',
    );
  } catch {}
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
  writeSession(value);
  notifyCompositor(value);
  emitter.dispatchEvent(new Event(EVENT));
}

// Wipe both the live ref and the persisted flag without firing the event.
// Used by the React tree's mount effect so a freshly-mounted DS QAM tab
// never inherits a stale expanded state from the previous QAM session.
export function resetQamExpanded(): void {
  current = false;
  writeSession(false);
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
