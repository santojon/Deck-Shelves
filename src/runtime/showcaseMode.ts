// Never fakes input; it reuses the jump-to-shelf focus path on a timer.

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
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel"] as const;

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

function resolveMaxCards(pan: boolean, cardsPerShelf: number | undefined, cardCount: number): number {
  if (!pan) return 1;
  return Math.min(clamp(cardsPerShelf ?? 5, MIN_CARDS_PER_SHELF, MAX_CARDS_PER_SHELF), Math.max(1, cardCount));
}

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
  if (!participants || participants.length === 0) return all;
  return all.filter((id) => participants.includes(id));
}

// Steam's own idle screensaver is a separate nav tree; on clients without it this reads false.
export function isNativeScreensaverActive(): boolean {
  try {
    const ctrl = (globalThis as any).FocusNavController;
    const ctx = ctrl?.m_ActiveContext ?? ctrl?.m_LastActiveContext;
    const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
    const popup = trees.find((t) => t?.m_ID === "ScreensaverPopup");
    return !!popup?.BIsActive?.();
  } catch { return false; }
}

// Blur and focus events are unreliable in GamepadUI, so query hidden/hasFocus directly.
function isWindowUnfocused(): boolean {
  const doc = getPreferredSteamDocument();
  if (!doc) return false;
  try { return doc.hidden || !doc.hasFocus(); } catch { return false; }
}

// Pause rather than stop: either condition can clear without user input.
function shouldYieldToInattention(): boolean {
  return isNativeScreensaverActive() || isWindowUnfocused();
}

export function installShowcaseMode(): () => void {
  let disposed = false;
  let running = false;
  let idx = 0;
  let visitCardIdx = 0; // 0-based offset within the current visit
  let lastShelfId: string | null = null;
  const cardCursor = new Map<string, number>();
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearDwell = () => { if (dwellTimer !== null) { clearTimeout(dwellTimer); dwellTimer = null; } };
  const clearIdle = () => { if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; } };

  // Input only reaches the document the Home is drawn in, and that document can be replaced.
  let listenedDoc: Document | null = null;
  let listenedTarget: EventTarget | null = null;
  function listenWhereItActs(): boolean {
    const doc = getPreferredSteamDocument();
    if (doc === listenedDoc) return true;
    stopListening();
    listenedDoc = doc;
    // On its window, capture phase: Big Picture handles keys there and stops them reaching the page.
    listenedTarget = doc.defaultView ?? doc;
    for (const type of ACTIVITY_EVENTS) listenedTarget.addEventListener(type, onActivity, { capture: true, passive: true });
    return false;
  }

  function stopListening(): void {
    if (!listenedTarget) return;
    for (const type of ACTIVITY_EVENTS) listenedTarget.removeEventListener(type, onActivity, true);
    listenedTarget = null;
    listenedDoc = null;
  }

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

  function shelfCardCount(shelfId: string): number {
    const doc = getPreferredSteamDocument();
    if (!doc) return 0;
    return doc.querySelectorAll(
      `[data-shelfid="${cssEscapeLocal(shelfId)}"] [data-ds-card-index]`,
    ).length;
  }

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
    listenWhereItActs();
    if (shouldYieldToInattention()) { stopShowcase(); armIdle(); return; }
    const ids = eligibleShelfIds(s);
    if (ids.length === 0) { stopShowcase(); return; }
    const pick = s.showcaseRandomize ? Math.floor(Math.random() * ids.length) : idx % ids.length;
    const shelfId = ids[pick];
    if (shelfId !== lastShelfId) { lastShelfId = shelfId; visitCardIdx = 0; }

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
    if (shouldYieldToInattention()) { armIdle(); return; }
    if (eligibleShelfIds(s).length === 0) { armIdle(); return; }
    if (!listenWhereItActs()) { armIdle(); return; }
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
  listenWhereItActs();

  armIdle();

  return () => {
    disposed = true;
    stopShowcase();
    clearIdle();
    unsubSettings();
    unsubController();
    stopListening();
  };
}
