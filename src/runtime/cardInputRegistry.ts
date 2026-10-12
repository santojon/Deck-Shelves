import { subscribeControllerInput, type ControllerEvent } from "./controllerInput";
import { subscribeHomeKey, type KeyEvent } from "./homeInputBus";
import { getLastFocusedElement } from "../core/focusRestore";
import { subscriptionCreated, subscriptionDisposed } from "../core/perfMetrics";

/* One raw-controller + one keyboard subscription for the whole Home, dispatched
   to the card that holds gamepad focus — instead of one pair per card, each
   checking its own `.gpfocus` on every press (O(cards) callbacks per input).
   Handlers are keyed by element and the subscriptions exist only while a card
   is registered; Decky's per-card `onButtonDown` (the native adapter) stays. */
export type CardInputHandlers = {
  raw?: (e: ControllerEvent) => void;
  key?: (e: KeyEvent) => void;
};

const handlers = new Map<HTMLElement, CardInputHandlers>();
let unsubRaw: (() => void) | null = null;
let unsubKey: (() => void) | null = null;

function focusedCardEl(): HTMLElement | null {
  try {
    const active = getLastFocusedElement();
    const card = active ? (active.closest(".ds-card") as HTMLElement | null) : null;
    if (card && handlers.has(card)) return card;
  } catch {}
  // Fallback for hosts where the tracked element lags: the class Decky applies.
  for (const el of handlers.keys()) if (el.classList.contains("gpfocus")) return el;
  return null;
}

function onRaw(e: ControllerEvent): void {
  if (!e.pressed) return;
  const card = focusedCardEl();
  if (!card) return;
  try { handlers.get(card)?.raw?.(e); } catch {}
}

function onKey(e: KeyEvent): void {
  const card = focusedCardEl();
  if (!card) return;
  try { handlers.get(card)?.key?.(e); } catch {}
}

function syncSubscriptions(): void {
  if (handlers.size > 0) {
    if (!unsubRaw) { unsubRaw = subscribeControllerInput(onRaw); subscriptionCreated(); }
    if (!unsubKey) { unsubKey = subscribeHomeKey(onKey); subscriptionCreated(); }
  } else {
    if (unsubRaw) { unsubRaw(); unsubRaw = null; subscriptionDisposed(); }
    if (unsubKey) { unsubKey(); unsubKey = null; subscriptionDisposed(); }
  }
  if (__DEV__) { try { (globalThis as any).__ds_card_input_registry = { cards: handlers.size, raw: !!unsubRaw, key: !!unsubKey }; } catch {} }
}

export function registerCardInput(el: HTMLElement, h: CardInputHandlers): () => void {
  handlers.set(el, h);
  syncSubscriptions();
  return () => {
    if (handlers.get(el) === h) handlers.delete(el);
    syncSubscriptions();
  };
}

export function registeredCardCount(): number {
  return handlers.size;
}

// Test-only reset — keeps vitest cases isolated from module-level state.
export function __resetCardInputRegistryForTest(): void {
  handlers.clear();
  syncSubscriptions();
}
