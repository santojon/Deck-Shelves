import { getLastFocusedElement } from "../core/focusRestore";
import { getSessionState, isGameRunningByEvent, subscribeSessionState } from "./sessionState";

// Both signals: the store alone can show a failed launch that never emits a stop.
function gameRunning(): boolean {
  return isGameRunningByEvent() && getSessionState().gameRunning;
}

/* Shared poll for "which .ds-card is currently gamepad-focused" — replaces
   one independent 150ms poll per DeckRow instance (one per visible shelf)
   plus BadgeFocusOverlay's own. One poll, lazily started/stopped with
   subscriber count and suspended while a game runs (the Home is hidden then);
   notifies only when the resolved card changes. */

const POLL_MS = 150;
const listeners = new Set<(card: HTMLElement | null) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastCard: HTMLElement | null = null;
let sessionUnsub: (() => void) | null = null;

function syncPoll(): void {
  const wanted = listeners.size > 0 && !gameRunning();
  if (wanted && !pollTimer) pollTimer = setInterval(tick, POLL_MS);
  else if (!wanted && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (__DEV__) {
    try {
      (globalThis as any).__ds_focus_poll_active = pollTimer != null;
      (globalThis as any).__ds_focus_poll_state = { listeners: listeners.size, gameRunning: gameRunning(), timer: pollTimer != null, at: Date.now() };
    } catch {}
  }
}

function resolveFocusedCard(): HTMLElement | null {
  try {
    const active = getLastFocusedElement();
    return active ? (active.closest(".ds-card") as HTMLElement | null) : null;
  } catch {
    return null;
  }
}

function tick(): void {
  // The app-lifetime notification can land before the running-apps store
  // updates; the next tick then sees the game and stops itself.
  if (gameRunning()) { syncPoll(); return; }
  const card = resolveFocusedCard();
  if (card === lastCard) return;
  lastCard = card;
  for (const l of listeners) { try { l(card); } catch {} }
}

export function subscribeFocusedCard(cb: (card: HTMLElement | null) => void): () => void {
  listeners.add(cb);
  if (!sessionUnsub) sessionUnsub = subscribeSessionState(syncPoll);
  syncPoll();
  return () => {
    listeners.delete(cb);
    syncPoll();
    if (listeners.size === 0 && sessionUnsub) { sessionUnsub(); sessionUnsub = null; }
  };
}

export function getFocusedCard(): HTMLElement | null {
  return lastCard;
}

// Test-only reset — keeps vitest cases isolated from module-level state.
export function __resetFocusedCardTrackerForTest(): void {
  listeners.clear();
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (sessionUnsub) { sessionUnsub(); sessionUnsub = null; }
  lastCard = null;
}
