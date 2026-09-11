/* Showcase / Dynamic Idle Mode (opt-in, off by default). During
   Home inactivity, cycles attention through the user's own shelves; any
   real interaction stops it instantly. MVP scope only — see
   .roadmaps/showcase-mode.md for the full spec and what's deferred. */

/* Never fakes input (no synthetic key/button dispatch) — reuses the exact
   focus-a-shelf's-first-card mechanism Side Nav's own "jump to shelf"
   already ships (`ShelfSideNav.tsx`'s `jumpToShelf`), just timer-driven. */

import { getCurrentSettings, subscribeSettings } from "../store/settingsStore";
import { getPreferredSteamDocument } from "./steamHost";
import { focusElement } from "../core/focusRestore";
import { subscribeControllerInput } from "./controllerInput";
import { evalVisibility } from "../steam/smartShelves";
import { logInfo } from "./logger";
import type { Settings } from "../types";

const MIN_START_AFTER_S = 15;
const MAX_START_AFTER_S = 600;
const MIN_DWELL_S = 3;
const MAX_DWELL_S = 120;
const MIN_CARD_DWELL_S = 1;
const MAX_CARD_DWELL_S = 60;
const MIN_CARDS_PER_SHELF = 1;
const MAX_CARDS_PER_SHELF = 20;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapIndex(count: number, value: number): number {
  return count > 0 ? value % count : 0;
}

function cssEscapeLocal(value: string): string {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

// How many cards to visit on the current shelf before advancing — 1 when
// within-shelf panning is off, else the configured cap bounded by the
// shelf's real card count (never linger on non-existent indices).
function resolveMaxCards(pan: boolean, cardsPerShelf: number | undefined, cardCount: number): number {
  if (!pan) return 1;
  return Math.min(clamp(cardsPerShelf ?? 5, MIN_CARDS_PER_SHELF, MAX_CARDS_PER_SHELF), Math.max(1, cardCount));
}

// The first card of each shelf uses the longer shelf dwell as an arrival
// pause; subsequent cards (within-shelf panning) use the shorter per-card dwell.
function resolveDwellMs(cardIdx: number, shelfDwellSeconds: number | undefined, cardDwellSeconds: number | undefined): number {
  if (cardIdx === 0) return clamp(shelfDwellSeconds ?? 10, MIN_DWELL_S, MAX_DWELL_S) * 1000;
  return clamp(cardDwellSeconds ?? 4, MIN_CARD_DWELL_S, MAX_CARD_DWELL_S) * 1000;
}

function eligibleShelfIds(settings: Settings): string[] {
  const regulars = (settings.shelves ?? []).filter((x: any) => x.enabled && !x.hidden && evalVisibility(x));
  const smart = settings.smartShelvesEnabled
    ? (settings.smartShelves ?? []).filter((x: any) => x.enabled !== false && !x.hidden && evalVisibility(x))
    : [];
  const all = [...regulars, ...smart].map((s: any) => s.id as string);
  const participants = (settings as any).showcaseShelfIds as string[] | undefined;
  // Empty (or unset) participant list = every currently-visible shelf
  // participates — there's no per-shelf opt-in picker yet (MVP scope).
  if (!participants || participants.length === 0) return all;
  return all.filter((id) => participants.includes(id));
}

export function installShowcaseMode(): () => void {
  let disposed = false;
  let running = false;
  let idx = 0;
  let visitCardIdx = 0; // offset within the CURRENT visit's pan sequence (0-based)
  let lastShelfId: string | null = null;
  // Absolute last-shown card index per shelf, so a revisit continues panning
  // from where it left off instead of restarting at card 0 every time.
  const cardCursor = new Map<string, number>();
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearDwell = () => { if (dwellTimer !== null) { clearTimeout(dwellTimer); dwellTimer = null; } };
  const clearIdle = () => { if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; } };

  function stopShowcase(): void {
    if (!running) return;
    running = false;
    clearDwell();
    logInfo("RUNTIME", "showcase mode: stopped");
  }

  function focusCard(shelfId: string, cardIndex: number): boolean {
    const doc = getPreferredSteamDocument();
    if (!doc) return false;
    const target = doc.querySelector<HTMLElement>(
      `[data-shelfid="${cssEscapeLocal(shelfId)}"] [data-ds-card-index="${cardIndex}"]`,
    );
    if (!target) return false;
    try { return focusElement(target); } catch { return false; }
  }

  // How many cards a shelf currently renders (used to bound within-shelf panning
  // so we don't linger on non-existent indices).
  function shelfCardCount(shelfId: string): number {
    const doc = getPreferredSteamDocument();
    if (!doc) return 0;
    return doc.querySelectorAll(
      `[data-shelfid="${cssEscapeLocal(shelfId)}"] [data-ds-card-index]`,
    ).length;
  }

  // Advance within the current shelf's pan sequence, or leave it — saving the
  // cursor one past the last card shown so the next visit continues instead
  // of repeating the same cards.
  function advanceCursor(pick: number, shelfId: string, cardIndex: number, cardCount: number, pan: boolean, focused: boolean, maxCards: number): void {
    if (pan && focused && visitCardIdx + 1 < maxCards) {
      visitCardIdx += 1;
      return;
    }
    cardCursor.set(shelfId, wrapIndex(cardCount, cardIndex + 1));
    idx = pick + 1;
    lastShelfId = null;
  }

  function step(): void {
    if (disposed || !running) return;
    const s = getCurrentSettings();
    if (!s?.showcaseModeEnabled) { stopShowcase(); return; }
    const ids = eligibleShelfIds(s);
    if (ids.length === 0) { stopShowcase(); return; }
    const pick = s.showcaseRandomize ? Math.floor(Math.random() * ids.length) : idx % ids.length;
    const shelfId = ids[pick];
    if (shelfId !== lastShelfId) { lastShelfId = shelfId; visitCardIdx = 0; }

    // Within-shelf panning (opt-in): walk cards from this shelf's saved cursor
    // (wrapping around its real card count), up to the cap or the card count,
    // then advance to the next shelf. Off = land on the saved card only.
    const pan = (s as any).showcasePanCards === true;
    const cardCount = shelfCardCount(shelfId);
    const maxCards = resolveMaxCards(pan, (s as any).showcaseCardsPerShelf, cardCount);
    const startIdx = cardCursor.get(shelfId) ?? 0;
    const cardIndex = wrapIndex(cardCount, startIdx + visitCardIdx);

    const focused = focusCard(shelfId, cardIndex);
    const dwellMs = resolveDwellMs(visitCardIdx, s.showcaseDwellSeconds, (s as any).showcaseCardDwellSeconds);
    advanceCursor(pick, shelfId, cardIndex, cardCount, pan, focused, maxCards);
    dwellTimer = setTimeout(step, dwellMs);
  }

  function startShowcase(): void {
    if (running || disposed) return;
    const s = getCurrentSettings();
    if (!s?.showcaseModeEnabled) return;
    if (eligibleShelfIds(s).length === 0) { armIdle(); return; } // nothing to show yet; retry later
    running = true;
    idx = 0;
    visitCardIdx = 0;
    lastShelfId = null;
    logInfo("RUNTIME", "showcase mode: starting");
    step();
  }

  function armIdle(): void {
    clearIdle();
    if (disposed) return;
    const s = getCurrentSettings();
    if (!s?.showcaseModeEnabled) return;
    const delayMs = clamp(s.showcaseStartAfterSeconds ?? 60, MIN_START_AFTER_S, MAX_START_AFTER_S) * 1000;
    idleTimer = setTimeout(startShowcase, delayMs);
  }

  function onActivity(): void {
    if (disposed) return;
    if (running) {
      const s = getCurrentSettings();
      if (s?.showcaseStopOnInteraction !== false) stopShowcase();
    }
    armIdle();
  }

  const unsubSettings = subscribeSettings((s) => {
    if (!s?.showcaseModeEnabled) { stopShowcase(); clearIdle(); return; }
    if (!running && idleTimer === null) armIdle();
  });
  const unsubController = subscribeControllerInput(onActivity);
  const doc = getPreferredSteamDocument();
  doc.addEventListener("pointerdown", onActivity, { passive: true });
  doc.addEventListener("wheel", onActivity, { passive: true });
  doc.addEventListener("keydown", onActivity);

  armIdle();

  return () => {
    disposed = true;
    stopShowcase();
    clearIdle();
    unsubSettings();
    unsubController();
    doc.removeEventListener("pointerdown", onActivity);
    doc.removeEventListener("wheel", onActivity);
    doc.removeEventListener("keydown", onActivity);
  };
}
