// Buttons received via Decky `Focusable.onButtonDown` on the home root
/* are forwarded to subscribers here. Decky's Focusable IS the only path
   that reliably delivers controller events in this Steam build —
   `SteamClient.Input.RegisterForControllerInputMessages` callbacks
   registered from SharedJSContext (where DS runs) never fire, even when
   the registration succeeds. */

import { GamepadButton } from "@decky/ui";
/* Side-effect import: forces controllerInput.ts to load, which boots
   the BP-context keydown listener used by Quick Search. Without this
   nothing imports the module, its top-level `pollUntilInstalled` never
   runs, and `__ds_bp_keydown_installed` stays undefined in BP. */
import "./controllerInput";

export type HomeButtonEvent = { button: number };
type Listener = (e: HomeButtonEvent) => void;

const listeners = new Set<Listener>();

export function subscribeHomeButton(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function dispatchHomeButtonDown(evt: { detail?: { button?: number } } | any): void {
  const button = evt?.detail?.button;
  if (typeof button !== "number") return;
  try { (globalThis as any).__ds_home_btn_last = { button, t: Date.now() }; } catch {}
  for (const l of listeners) {
    try { l({ button }); } catch {}
  }
}

// `onGamepadDirection` fires for DPAD events that the nav system
// consumes — we get them via a parallel path. Decky's GamepadEvent
// detail.button maps to DIR_UP/DOWN/LEFT/RIGHT enum values.
export function dispatchHomeDirection(evt: { detail?: { button?: number } } | any): void {
  const button = evt?.detail?.button;
  if (typeof button !== "number") return;
  try { (globalThis as any).__ds_home_dir_last = { button, t: Date.now() }; } catch {}
  for (const l of listeners) {
    try { l({ button }); } catch {}
  }
}

// Keyboard events captured by the BP-injected listener — polled from
// SharedJSContext. Subscribers receive each key event with the standard
// KeyboardEvent shape.
export interface KeyEvent {
  key: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  tag?: string;
}

const keyListeners = new Set<(e: KeyEvent) => void>();

export function subscribeHomeKey(cb: (e: KeyEvent) => void): () => void {
  keyListeners.add(cb);
  return () => { keyListeners.delete(cb); };
}

export function dispatchHomeKey(ev: KeyEvent): void {
  try { (globalThis as any).__ds_home_key_last = ev; } catch {}
  for (const l of keyListeners) {
    try { l(ev); } catch {}
  }
}

export { GamepadButton };
