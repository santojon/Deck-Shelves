import { devStamp } from "./devStamps";
// Button presses from the loader's focus handlers and keys typed in Big Picture fan out from here.

import { GamepadButton } from "./host/decky";
// Side-effect import: loads the keydown listener, which nothing else imports.
import "./controllerInput";

type HomeButtonEvent = { button: number };
type Listener = (e: HomeButtonEvent) => void;

const listeners = new Set<Listener>();

export function subscribeHomeButton(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function dispatchHomeButtonDown(evt: { detail?: { button?: number } } | any): void {
  const button = evt?.detail?.button;
  if (typeof button !== "number") return;
  devStamp("__ds_home_btn_last", { button, t: Date.now() });
  for (const l of listeners) {
    try { l({ button }); } catch {}
  }
}

export interface KeyEvent {
  key: string;
  code?: string;
  ctrl?: boolean;
  shift?: boolean;
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
  devStamp("__ds_home_key_last", ev);
  for (const l of keyListeners) {
    try { l(ev); } catch {}
  }
}

export { GamepadButton };
