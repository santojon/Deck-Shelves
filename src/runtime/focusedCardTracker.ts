import { getLastFocusedElement } from "../core/focusRestore";

/* Shared poll for "which .ds-card is currently gamepad-focused" — replaces
   one independent 150ms poll per DeckRow instance (one per visible shelf)
   plus BadgeFocusOverlay's own. One poll, lazily started/stopped with
   subscriber count; notifies only when the resolved card changes. */

const POLL_MS = 150;
const listeners = new Set<(card: HTMLElement | null) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastCard: HTMLElement | null = null;

function resolveFocusedCard(): HTMLElement | null {
  try {
    const active = getLastFocusedElement();
    return active ? (active.closest(".ds-card") as HTMLElement | null) : null;
  } catch {
    return null;
  }
}

function tick(): void {
  const card = resolveFocusedCard();
  if (card === lastCard) return;
  lastCard = card;
  for (const l of listeners) { try { l(card); } catch {} }
}

export function subscribeFocusedCard(cb: (card: HTMLElement | null) => void): () => void {
  listeners.add(cb);
  if (!pollTimer) pollTimer = setInterval(tick, POLL_MS);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  };
}

export function getFocusedCard(): HTMLElement | null {
  return lastCard;
}

// Test-only reset — keeps vitest cases isolated from module-level state.
export function __resetFocusedCardTrackerForTest(): void {
  listeners.clear();
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  lastCard = null;
}
