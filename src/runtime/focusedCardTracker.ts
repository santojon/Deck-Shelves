import { getLastFocusedElement } from "../core/focusRestore";
import { subscribeSessionState } from "./sessionState";
import { getPreferredSteamDocument } from "./steamHost";
import { getPowerState, registerPeriodic, type PowerState } from "./powerGate";

/* Shared poll for "which .ds-card is currently gamepad-focused" — replaces
   one independent 150ms poll per DeckRow instance (one per visible shelf)
   plus BadgeFocusOverlay's own. One poll, lazily started/stopped with
   subscriber count and held by the power gate (a game, suspend); notifies
   only when the resolved card changes. */

// 150 ms while input is flowing (2 s after the last press), 500 ms once it settles.
const FAST_MS = 150;
const SLOW_MS = 500;
const FAST_WINDOW_MS = 2000;
// Only the visible Home has cards to track; a return restarts at the fast cadence.
const RUN_IN: PowerState[] = ['active'];
const INPUT_EVENTS = ['vgp_ondirection', 'focusin', 'keydown'];

const listeners = new Set<(card: HTMLElement | null) => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastCard: HTMLElement | null = null;
let lastInputAt = 0;
let inputDoc: Document | null = null;
let sessionUnsub: (() => void) | null = null;
let unregisterTask: (() => void) | null = null;

function cadence(): number {
  return Date.now() - lastInputAt < FAST_WINDOW_MS ? FAST_MS : SLOW_MS;
}

function schedule(): void {
  pollTimer = setTimeout(tick, cadence());
}

function stamp(): void {
  if (__DEV__) {
    try {
      (globalThis as any).__ds_focus_poll_active = pollTimer != null;
      (globalThis as any).__ds_focus_poll_state = { listeners: listeners.size, timer: pollTimer != null, cadence: cadence(), state: getPowerState(), at: Date.now() };
    } catch {}
  }
}

// A press during the slow cadence brings the next read forward.
function onInput(): void {
  const settled = cadence() === SLOW_MS;
  lastInputAt = Date.now();
  if (settled && pollTimer) { clearTimeout(pollTimer); schedule(); }
}

function unwatchInput(): void {
  if (!inputDoc) return;
  for (const ev of INPUT_EVENTS) inputDoc.removeEventListener(ev, onInput, true);
  inputDoc = null;
}

function watchInput(): void {
  const doc = getPreferredSteamDocument();
  if (doc === inputDoc) return;
  unwatchInput();
  inputDoc = doc;
  for (const ev of INPUT_EVENTS) doc.addEventListener(ev, onInput, true);
}

function allowed(): boolean {
  return RUN_IN.includes(getPowerState());
}

function startPoll(): void {
  if (pollTimer || listeners.size === 0) return;
  // A (re)start follows a mount or a return: focus is settling, read fast first.
  lastInputAt = Date.now();
  try { watchInput(); } catch {}
  schedule();
  stamp();
}

function stopPoll(): void {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  unwatchInput();
  stamp();
}

function syncPoll(): void {
  if (listeners.size > 0 && allowed()) startPoll();
  else stopPoll();
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
  pollTimer = null;
  // The app-lifetime notification can land before the running-apps store
  // updates; the gate re-reads it here and this tick stops itself.
  if (!allowed()) { stopPoll(); return; }
  schedule();
  const card = resolveFocusedCard();
  if (card === lastCard) return;
  lastCard = card;
  for (const l of listeners) { try { l(card); } catch {} }
}

export function subscribeFocusedCard(cb: (card: HTMLElement | null) => void): () => void {
  listeners.add(cb);
  if (!sessionUnsub) sessionUnsub = subscribeSessionState(syncPoll);
  if (!unregisterTask) unregisterTask = registerPeriodic('focusedCardTracker', { runIn: RUN_IN, start: startPoll, stop: stopPoll });
  syncPoll();
  return () => {
    listeners.delete(cb);
    if (listeners.size > 0) return;
    stopPoll();
    unregisterTask?.(); unregisterTask = null;
    sessionUnsub?.(); sessionUnsub = null;
  };
}

export function getFocusedCard(): HTMLElement | null {
  return lastCard;
}

// Test-only reset — keeps vitest cases isolated from module-level state.
export function __resetFocusedCardTrackerForTest(): void {
  listeners.clear();
  stopPoll();
  unregisterTask?.(); unregisterTask = null;
  sessionUnsub?.(); sessionUnsub = null;
  lastCard = null;
  lastInputAt = 0;
}
