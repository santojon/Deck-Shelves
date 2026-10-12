
import { getAllStyleText } from "../detect";
import type { ThemeAdapter } from "../types";

export function isTiltedHomeActive(): boolean {
  const text = getAllStyleText();
  return /--ren-tilt-angle\s*:/i.test(text);
}

export function getTiltedHomeMode(): { method: "skew" | "3d"; direction: "one-way" | "opposites" } | null {
  if (!isTiltedHomeActive()) return null;
  const text = getAllStyleText();
  // Method: 3d if any tilt rule combines perspective+rotateY with the
  // --ren-tilt-angle var; otherwise skew (the default / most common
  // installed variant uses skew()).
  const method: "skew" | "3d" =
    /transform\s*:[^;}]*rotateY[^;}]*--ren-tilt-angle/i.test(text)
    || /transform\s*:[^;}]*perspective\([^)]*\)[^;}]*--ren-tilt-angle/i.test(text)
      ? "3d"
      : "skew";
  // Direction: opposites mode injects a sibling-after-focused override
  // (`> div.gpfocuswithin ~ div`) somewhere in the chain. one-way mode
  // has no such override — every tile uses the same tilt direction.
  const direction: "one-way" | "opposites" =
    />\s*div\.gpfocuswithin\s*~\s*div/i.test(text) ? "opposites" : "one-way";
  return { method, direction };
}

/* TiltedHome: the user picks one of four CSS Loader modules (skew / 3d ×
   one-way / opposites). The mode is published as data attributes so the CSS
   below gates the exact transform on the installed variant, reading the
   theme's own `--ren-*` variables so the intensity matches the user's choice. */
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
  css: () => `
    /* =================================================================
       TiltedHome — DS-side, mode-aware implementation.
       =================================================================
       Why DS-side and not class-adoption: Decky's Focusable puts a
       tabindex on the same wrapper that would adopt nativeCardWrapper,
       and some TiltedHome modules' focused-state selectors use the
       tabindex attribute to match the focused tile — which would then
       match EVERY DS card and replace the tilt with a flat scale on
       all of them. So DS mirrors each TiltedHome variant exactly:
       - SKEW one-way: every tile gets skew(angle) — most common install
       - SKEW opposites: cards before focus skew(+angle), after skew(-angle)
       - 3D one-way: every tile gets perspective + rotateY(angle)
       - 3D opposites: same with sibling override
       Tilt is applied to .ds-card ITSELF (not the wrapping div) so the
       Focusable's box-shadow focus indicator (computed from the card's
       bounding rect) follows the tilt. The wrapping div added in
       GameCard / MoreCard / RefreshCard stays — the card art keeps its
       layout while the parent tilts as a single unit. All rules use
       !important to beat Steam's native higher-specificity :focus rule
       (translateZ(7px)), which is composed into the focused rule so the
       native depth-lift is preserved. */

    /* Row needs perspective context for 3D tilts to compose around a
       fixed eye-point, plus overflow-y: visible so tilted edges
       aren't clipped at the row boundary. */
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll {
      overflow-y: visible !important;
      perspective: 600px !important;
    }

    /* SKEW one-way: every card tilts same direction. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    /* SKEW opposites: default lean one way, sibling-after-focused flips. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg))) !important;
    }
    /* SKEW focused — one-way mode: KEEP the directional tilt + scale +
       Steam's translateZ. The whole row leans the same direction so
       the selected card stays integrated by keeping its tilt.
       Opposites mode: focused goes FLAT (no skew, just scale +
       translateZ) — the surrounding cards form a fan converging on
       the focused tile, so the pivot of the fan reads correctly
       only when it itself has no tilt (matches native behaviour). */
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

    /* 3D one-way: every card gets perspective + rotateY same direction. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    /* 3D opposites: default lean left (+2*angle), sibling-after-focused
       flips to right (-2*angle). Together these form the fan
       composition converging on the focused card. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) !important;
    }
    /* 3D focused — same direction rule as SKEW. One-way keeps the
       rotation; opposites flattens the focused pivot. */
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

    /* Trailing tiles (Refresh / More) — view-more / GoToLibrary
       treatment. */
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
    /* Trailing tiles focused — same one-way-keeps-tilt /
       opposites-flattens rule as game tiles. */
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

    /* Most-recent / first tile offset — mirrors native's
       --ren-most-recent-offset shift. */
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll > .ds-card:first-child {
      margin-left: var(--ren-most-recent-offset, 2%);
    }

    /* Counter-tilt the verified / playable badge so it reads
       horizontally even though the card is tilted. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-card .ds-compat {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg)));
    }
  `,
};
