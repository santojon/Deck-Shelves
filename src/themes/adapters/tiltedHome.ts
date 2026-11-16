
import { getAllStyleText } from "../detect";
import type { ThemeAdapter } from "../types";

export function isTiltedHomeActive(): boolean {
  const text = getAllStyleText();
  return /--ren-tilt-angle\s*:/i.test(text);
}

export function getTiltedHomeMode(): { method: "skew" | "3d"; direction: "one-way" | "opposites" } | null {
  if (!isTiltedHomeActive()) return null;
  const text = getAllStyleText();
  const method: "skew" | "3d" =
    /transform\s*:[^;}]*rotateY[^;}]*--ren-tilt-angle/i.test(text)
    || /transform\s*:[^;}]*perspective\([^)]*\)[^;}]*--ren-tilt-angle/i.test(text)
      ? "3d"
      : "skew";
  const direction: "one-way" | "opposites" =
    />\s*div\.gpfocuswithin\s*~\s*div/i.test(text) ? "opposites" : "one-way";
  return { method, direction };
}

export const tiltedHomeTheme: ThemeAdapter = {
  id: "tilted-home",
  label: "TiltedHome",
  scope: "root",
  flags: ["data-ds-theme-tilted-home", "data-ds-theme-tilt-method", "data-ds-theme-tilt-direction"],
  allRoots: true,
  read: () => {
    const tilted = isTiltedHomeActive();
    const mode = tilted ? getTiltedHomeMode() : null;
    return {
      "data-ds-theme-tilted-home": tilted,
      "data-ds-theme-tilt-method": mode?.method ?? null,
      "data-ds-theme-tilt-direction": mode?.direction ?? null,
    };
  },
  // Mirrored here rather than adopting Steam's card wrapper class: some variants find the focused tile
  // by tabindex, which Decky's Focusable puts on that wrapper, so every card would go flat.
  css: () => `
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll {
      overflow-y: visible !important;
      perspective: 600px !important;
    }

    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg))) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card:focus {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card:focus {
      transform: scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }

    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card:focus {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card:focus {
      transform: scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }

    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-refresh-card,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-more-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(var(--ren-view-more-focus-scale, 0.88)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"] .ds-refresh-card,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"] .ds-more-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) scale(var(--ren-view-more-focus-scale, 0.88)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-more-card.gpfocus {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-more-card.gpfocus {
      transform: scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-more-card.gpfocus {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-more-card.gpfocus {
      transform: scale(1.05) translateZ(7px) !important;
    }

    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll > .ds-card:first-child {
      margin-left: var(--ren-most-recent-offset, 2%);
    }

    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-card .ds-compat {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg)));
    }
  `,
};
