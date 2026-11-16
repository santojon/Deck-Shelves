import { useEffect, useState } from 'react';

// Per QAM session: sessionStorage outlives the popup, so the tab's mount resets it.
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

// Same protocol the Friends & Chat module uses to expand the QAM.
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

function setQamExpanded(next: boolean | ((prev: boolean) => boolean)): void {
  const value = typeof next === 'function' ? next(current) : next;
  // Still resync every panel: resetQamExpanded changes the value without an event.
  if (value !== current) {
    current = value;
    writeSession(value);
    notifyCompositor(value);
  }
  emitter.dispatchEvent(new Event(EVENT));
}

export function resetQamExpanded(): void {
  current = false;
  writeSession(false);
}

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
