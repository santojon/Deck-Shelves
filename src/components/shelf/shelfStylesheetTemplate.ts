import { themeStylesheet } from "../../themes/registry";

export type ShelfStylesheetCtx = {
  cardRadius: string;
  cardW: number;
  cardH: number;
  cardArtH: number;
  cardGap: number;
  featuredW: number;
  featuredH: number;
  featuredArtH: number;
};

// Focus styles stay card-local: a document-level selector tied to card focus restyles the whole page
// on every controller move. No perspective on the row and no focus zoom past 1.02; both cost presses.
export function buildShelfStylesheet(ctx: ShelfStylesheetCtx): string {
  return `
    :root {
      --ds-card-radius: ${ctx.cardRadius};
      --ds-card-dim: 0.9;
      --ds-card-bg: rgba(55, 55, 58, 0.52);
      --ds-shell-bg: transparent;
      --ds-page-bg: rgb(0, 0, 0);
      --ds-native-card-w: ${ctx.cardW}px;
      --ds-native-card-h: ${ctx.cardH}px;
      --ds-native-card-gap: ${ctx.cardGap}px;
      --ds-native-card-art-h: ${ctx.cardArtH}px;
      --ds-native-feat-w: ${ctx.featuredW}px;
      --ds-native-feat-h: ${ctx.featuredH}px;
      --ds-native-feat-art-h: ${ctx.featuredArtH}px;
      --ds-card-h: ${ctx.cardH}px;
      --ds-row-base-gap: ${ctx.cardGap}px;
    }
    #deck-shelves-home-root { margin-top: -32px !important; }
    .deck-shelves-root { background: transparent; }
    .Panel.ds-shelf { background: transparent !important; }
    .ds-row-scroll { scrollbar-width: none; -ms-overflow-style: none; }
    .ds-row-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }

    .Panel.ds-shelf {
      height: auto !important;
    }


    .ds-shelf[data-ds-info-above="true"] .ds-card .ds-card-label {
      display: none !important;
    }
    .ds-promoted-hero-label .ds-card-label {
      position: static !important;
      top: auto !important;
      left: auto !important;
      width: auto !important;
      padding-top: 0 !important;
      opacity: 1 !important;
      display: block !important;
    }
    .ds-promoted-hero-label .ds-card-label-name {
      font-size: 22px !important;
      font-weight: 800 !important;
      line-height: 1.15 !important;
      color: rgb(255, 255, 255) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.85);
    }
    .ds-promoted-hero-label .ds-card-status {
      font-size: 14.6667px !important;
      font-weight: 700 !important;
      opacity: 1 !important;
      color: rgba(255, 255, 255, 0.5) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      margin-top: 2px !important;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
    }
    .ds-promoted-hero-label .ds-card-status-icon.ds-card-status-play {
      display: none !important;
    }
    .ds-card {
      border-radius: var(--ds-card-radius, ${ctx.cardRadius}) !important;
      overflow: visible;
      scroll-margin-top: 90px;
      scroll-margin-bottom: 52px;
      scroll-margin-inline-end: 2.8vw;
    }
    .ds-card-art {
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
    }
    #deck-shelves-home-root .ds-card.Focusable,
    #deck-shelves-home-root .ds-card {
      transition:
        filter 0.4s cubic-bezier(0, 0.73, 0.48, 1),
        box-shadow 0.4s cubic-bezier(0, 0.73, 0.48, 1),
        transform 0.4s cubic-bezier(0, 0.73, 0.48, 1) !important;
    }
    #deck-shelves-home-root .ds-card:focus,
    #deck-shelves-home-root .ds-card.gpfocus,
    #deck-shelves-home-root .ds-card:hover {
      transform: scale(1.025);
    }
    #deck-shelves-home-root .ds-card { filter: none !important; }
    #deck-shelves-home-root .deck-shelves-root:focus,
    #deck-shelves-home-root .deck-shelves-root.gpfocus,
    #deck-shelves-home-root .deck-shelves-root.gpfocuswithin,
    #deck-shelves-home-root .ds-row-scroll:focus,
    #deck-shelves-home-root .ds-row-scroll.gpfocus,
    #deck-shelves-home-root .ds-row-scroll.gpfocuswithin,
    #deck-shelves-home-root .Panel.gpfocus,
    #deck-shelves-home-root .Focusable.gpfocus,
    #deck-shelves-home-root [class*="row"].gpfocus {
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
      animation: none !important;
    }
    #deck-shelves-home-root .ds-card:focus,
    #deck-shelves-home-root .ds-card.gpfocus,
    #deck-shelves-home-root .ds-card:hover {
      outline: none !important;
      outline-offset: 0px !important;
      border: none !important;
      box-shadow: rgba(0, 0, 0, 0.5) 0px 16px 24px 0px !important;
      z-index: 12;
    }
    #deck-shelves-home-root .ds-card--synthetic-noshadow,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:focus,
    #deck-shelves-home-root .ds-card--synthetic-noshadow.gpfocus,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:hover,
    #deck-shelves-home-root .ds-card--synthetic-noshadow .ds-card-art {
      box-shadow: none !important;
    }
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only .ds-card-art {
      box-shadow: none !important;
    }
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only:focus,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only.gpfocus,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only:hover {
      box-shadow: 0 8px 16px rgba(0,0,0,0.5) !important;
    }
    #deck-shelves-home-root .ds-card--synthetic-noshadow::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:focus::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow.gpfocus::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    #deck-shelves-home-root { z-index: 10 !important; }
    #deck-shelves-home-root .ds-card::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: auto !important;
      height: var(--ds-card-art-h, 100%) !important;
      border-radius: var(--ds-card-radius, ${ctx.cardRadius}) !important;
      pointer-events: none !important;
      display: inline !important;
    }
    #deck-shelves-home-root .ds-card.gpfocus::after,
    #deck-shelves-home-root .ds-card:focus::after,
    #deck-shelves-home-root .ds-card:hover::after {
      height: var(--ds-card-art-h, 100%) !important;
      bottom: auto !important;
      border-radius: var(--ds-card-radius, ${ctx.cardRadius}) !important;
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(90,90,90,0.18) 0%, rgba(160,160,160,0.32) 50%, rgba(90,90,90,0.18) 100%);
      background-size: 200% 100%;
      animation: ds-shelf-shimmer 2s ease-in-out 4 forwards;
      pointer-events: none;
      z-index: 1;
      border-radius: var(--ds-card-radius, 4px);
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer--loaded { display: none; }
    #deck-shelves-home-root .ds-per-shelf-hero-img { opacity: 0 !important; transition: none !important; }
    #deck-shelves-home-root .ds-per-shelf-hero-img.is-loaded { opacity: 1 !important; transition: opacity 0.06s ease !important; }
    @keyframes ds-refresh-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .ds-refresh-icon.ds-refresh-spinning {
      animation: ds-refresh-spin 0.7s cubic-bezier(0.4, 0.05, 0.4, 1);
    }
    @keyframes ds-shelf-shimmer {
      0% { background-position: 0% 0%; opacity: 0; }
      40% { opacity: 1; }
      100% { background-position: -200% 0%; opacity: 0; }
    }
    @keyframes ds-focus-pulse {
      0% { opacity: 0; }
      40% { opacity: 1; }
      100% { opacity: 0; }
    }
    #deck-shelves-home-root .ds-card *:focus { outline: none !important; box-shadow: none !important; }
    .ds-card-art {
      position: absolute !important;
      inset: 0 !important;
      height: var(--ds-card-art-h, 100%) !important;
      padding-top: 0 !important;
      border-radius: var(--ds-card-radius, ${ctx.cardRadius});
      overflow: hidden;
      filter: brightness(var(--ds-card-dim, 0.9)) !important;
      transition: filter 0.4s cubic-bezier(0, 0.73, 0.48, 1);
    }
    .ds-card-art img {
      border-radius: var(--ds-card-radius, ${ctx.cardRadius});
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-art,
    #deck-shelves-home-root .ds-card:focus .ds-card-art,
    #deck-shelves-home-root .ds-card:hover .ds-card-art {
      z-index: 2;
      filter: brightness(1) !important;
    }



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

    .ds-card .ds-card-label {
      opacity: 0;
      transition: opacity .15s ease;
    }

    .ds-card-label--compact .ds-card-status { display: none !important; }
    .ds-card.gpfocus .ds-card-label,
    .ds-card:focus .ds-card-label,
    .ds-card:hover .ds-card-label {
      opacity: 1;
    }
    .ds-card img:not(.ds-card-icon):not(.ds-card-logo) { transition: opacity .15s ease; width: 100% !important; height: 100% !important; object-fit: cover !important; }
    .ds-card .ds-card-icon { width: 20px !important; height: 20px !important; object-fit: contain !important; }
    .ds-compat {
      position: absolute; bottom: 4px; right: 4px;
      display: var(--ds-compat-display, flex); align-items: center;
      background: rgba(0,0,0,0.7);
      border-radius: 20px;
      padding: 2px;
      z-index: 3; pointer-events: none;
      width: 40px; height: 20px;
      opacity: 0;
      transition: opacity .15s ease;
    }
    .ds-card.gpfocus .ds-compat,
    .ds-card:focus .ds-compat,
    .ds-card:hover .ds-compat { opacity: var(--ds-compat-opacity, 1); }
    .ds-compat svg { flex-shrink: 0; width: 20px; height: 20px; }
    .ds-compat-deck-icon { color: var(--custom-compat-icons-deck, rgba(255,255,255,0.84)); }
    .ds-compat-verified .ds-compat-verdict-icon { color: var(--custom-compat-icons-verified, rgb(89, 191, 64)); }
    .ds-compat-playable .ds-compat-verdict-icon { color: var(--custom-compat-icons-playable, rgb(255, 200, 44)); }
    .ds-compat-unsupported .ds-compat-verdict-icon { color: var(--custom-compat-icons-unsupported, rgb(220, 222, 223)); }
    .ds-compat-unknown .ds-compat-verdict-icon { color: var(--custom-compat-icons-unknown, rgba(255,255,255,0.4)); }
    .ds-compat--controller { width: 24px; justify-content: center; background: var(--custom-compat-icons-bg, rgb(14, 20, 27)); border-radius: 10px; }
    .ds-compat--controller svg { color: var(--custom-compat-icons-deck, rgba(255,255,255,0.84)); }
    body.ds-hide-non-steam-badges .nonsteam-badge,
    .ds-card--hide-non-steam-badge .nonsteam-badge { display: none !important; }
    .ds-new-badge-band {
      position: absolute; top: 0px; left: 0; right: 0;
      height: 24px;
      display: flex; justify-content: center; align-items: flex-start;
      pointer-events: none;
      z-index: 21;
    }
    .ds-card .ds-card-badge-host {
      top: -2px;
      height: calc(100% + 2px);
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-badge-host--inline,
    #deck-shelves-home-root .ds-card:focus .ds-card-badge-host--inline,
    #deck-shelves-home-root .ds-card.is-selected .ds-card-badge-host--inline {
      visibility: hidden;
    }
    .ds-new-badge {
      background: var(--ds-new-badge-bg, var(--colored-toggles-main-color, rgb(26, 159, 255)));
      color: var(--ds-new-badge-color, var(--colored-toggles-friends-text-color, #fff));
      font: 700 10px/20px "Motiva Sans", Helvetica, Arial, sans-serif;
      letter-spacing: 0.5px; text-transform: uppercase;
      padding: 2px 12px;
      border-radius: var(--ds-new-badge-radius, var(--round-radius-size, 0px));
      box-shadow: rgb(37, 53, 83) 0 1px 8px 0;
      pointer-events: none;
      z-index: 21;
    }
    .ds-new-badge.ds-new-badge--split { display: flex; padding: 0; letter-spacing: 0; overflow: hidden; }
    .ds-new-badge--split > span { padding: 2px 6px; }
    .ds-new-badge--split > .ds-new-badge__price { background: rgba(0, 0, 0, 0.3); }
    .ds-shelf-title {
      color: var(--ds-native-heading-color, inherit);
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .ds-shelf-collapse-icon {
      font-size: 14px;
      opacity: 0.5;
      transition: transform 0.2s;
      display: inline-block;
    }
    .ds-card-label-name {
      color: var(--ds-native-heading-color, inherit);
      font-size: inherit;
      line-height: 1.2;
      font-weight: bold;
      white-space: nowrap;
      overflow: visible;
    }
    .ds-card-status {
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.7;
      font-size: 0.75em;
      line-height: 1.3;
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 4px;
      white-space: nowrap;
      overflow: visible;
    }
    [data-ds-playtime-position="center"] .ds-card-status { justify-content: center; }
    [data-ds-playtime-position="right"]  .ds-card-status { justify-content: flex-end; }
    .ds-card-logo-overlay {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 12px;
      box-sizing: border-box;
    }
    .ds-card-logo-overlay[data-ds-position="left"] { align-items: flex-start; }
    .ds-card-logo-overlay[data-ds-position="right"] { align-items: flex-end; }
    .ds-card-description[data-ds-position="left"] { text-align: left; margin-left: 0; margin-right: auto; }
    .ds-card-description[data-ds-position="center"] { text-align: center; margin-left: auto; margin-right: auto; }
    .ds-card-description[data-ds-position="right"] { text-align: right; margin-left: auto; margin-right: 0; }
    .ds-card-logo {
      width: 92%;
      max-height: 60%;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7));
    }
    .ds-card-icon {
      width: 12px;
      height: 12px;
      object-fit: contain;
      flex-shrink: 0;
      border-radius: 2px;
    }
    .ds-card-description {
      position: absolute;
      top: 100%;
      margin-top: 2px;
      font-size: calc(0.7em * var(--ds-eff-desc-scale, 1));
      line-height: 1.2;
      opacity: 0;
      transition: opacity 0.18s ease;
      width: min(calc(var(--ds-eff-card-w, 188px) * 4 + var(--ds-eff-card-gap, 16px) * 3), 72vw);
      max-width: min(calc(var(--ds-eff-card-w, 188px) * 4 + var(--ds-eff-card-gap, 16px) * 3), 72vw);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      font-weight: normal;
      text-transform: none;
      pointer-events: none;
      z-index: 5;
    }
    .ds-card-description[data-ds-position="left"]   { left: 0; right: auto; text-align: left; }
    .ds-card-description[data-ds-position="center"] { left: 50%; transform: translateX(-50%); text-align: center; }
    .ds-card-description[data-ds-position="right"]  { right: 0; left: auto; text-align: right; }
    .ds-card.gpfocus .ds-card-description,
    .ds-card.gpfocuswithin .ds-card-description { opacity: 0.88; }
    .ds-card-description--below-logo {
      margin-top: 6px;
      max-width: 80%;
    }
    .ds-card-status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      line-height: 0;
    }
    .ds-card-status-play { color: var(--ds-native-heading-color, rgb(89, 191, 64)); }
    .ds-friend-avatars {
      position: absolute;
      z-index: 4;
      display: flex;
      flex-direction: row;
      gap: 3px;
      pointer-events: none;
    }
    .ds-friend-avatar {
      position: relative;
      width: var(--ds-friend-avatar-size, 23px);
      height: var(--ds-friend-avatar-size, 23px);
      flex-shrink: 0;
      box-shadow: 2px 2px 8px 1px rgba(0, 0, 0, 0.3);
    }
    .ds-friend-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #1b2838;
    }
    .ds-friend-avatar-status {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 9%;
      min-height: 2px;
      background: var(--ds-native-heading-color, rgb(89, 191, 64));
    }
    .ds-more-card-text {
      font-size: 16px;
      font-weight: 400;
      line-height: 1.35;
      text-align: center;
    }
    .ds-card-art-placeholder {
      font-size: 11px;
      opacity: 0.5;
      text-align: center;
      word-break: break-word;
    }
    .ds-card.ds-card--featured .ds-card-art img { object-position: center top; }

    @keyframes ds-per-shelf-hero-zoom {
      from { transform: scale(1); }
      to   { transform: scale(var(--ds-hero-zoom-scale, 1.06)); }
    }
    .ds-idle .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img { animation-play-state: paused; }
    .deck-shelves-root .ds-shelf[data-ds-pending="true"] { display: none !important; }
    .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      animation: ds-per-shelf-hero-zoom var(--ds-hero-zoom-duration, 25s) var(--ds-hero-zoom-ease, steps(125, end)) infinite alternate;
      transition: opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83),
                  filter 0.35s ease;
      object-fit: var(--ds-hero-fit, cover);
      object-position: var(--ds-hero-position, 50% 18%);
      filter: var(--ds-hero-appearance-filter, none);
      mask-image: var(--ds-hero-mask, none);
      -webkit-mask-image: var(--ds-hero-mask, none);
    }

    .ds-hero-background {
      mask-image: var(--ds-hero-mask, linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px)));
      -webkit-mask-image: var(--ds-hero-mask, linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px)));
    }


    #deck-shelves-home-root .ds-card:not(.gpfocus):not(.is-selected):not(:hover):not(:focus) .ds-card-art {
      opacity: var(--carousel-opacity, 1) !important;
      transition: opacity 0.2s ease-in-out;
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-art,
    #deck-shelves-home-root .ds-card:focus .ds-card-art,
    #deck-shelves-home-root .ds-card:hover .ds-card-art,
    #deck-shelves-home-root .ds-card.is-selected .ds-card-art {
      opacity: 1 !important;
    }
    .ds-card { opacity: 1 !important; }



    .deck-shelves-root > .ds-shelf:first-child:not([data-ds-recents-slot="true"]) + .ds-shelf [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -170px;
      --ds-hero-h: calc(100% + 170px);
    }

    .deck-shelves-root > .ds-shelf[data-ds-recents-slot="true"]:first-child + .ds-shelf:not([data-ds-recents-slot="true"]) [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -110px;
      --ds-hero-h: calc(100% + 110px);
    }

    .deck-shelves-root[data-ds-hero-background="true"][data-ds-recents-hidden="true"]:not([data-ds-theme-hero-fullscreen="true"]) > .ds-shelf[data-ds-recents-slot="true"]:first-child [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -56px;
      --ds-hero-h: calc(100% + 56px);
    }
    .deck-shelves-root[data-ds-recents-hidden="true"] > .ds-shelf[data-ds-hero-enabled="true"]:first-child:not([data-ds-recents-slot="true"]) {
      padding-top: var(--ds-hero-band, 128px);
    }
    .deck-shelves-root[data-ds-recents-hidden="true"] > .ds-shelf[data-ds-hero-enabled="true"]:first-child:not([data-ds-recents-slot="true"]) [data-ds-per-shelf-hero="true"] { --ds-hero-top: -56px; --ds-hero-h: calc(100% + 56px); }
    ${themeStylesheet(ctx)}
  `;
}
