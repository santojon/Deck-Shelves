import { useEffect, useRef, useMemo, useState, memo } from "react";
import { Focusable } from "../../runtime/host/decky";
import { getAppAssetCacheKey } from "../../core/steamAssets";
import i18n from "../../i18n";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { formatPlaytime } from "./shelfStyles";
import { PlaceholderCard } from "./PlaceholderCard";
import { useNearViewport } from "./cardUtils";
import { getFriendsInApp, subscribeFriendsChanged } from "../../runtime/friendsState";
import { getCurrentSettings, saveSettings } from "../../store/settingsStore";
import { patchShelfInSettings } from "../../domain/settings";
import { saveFocusTarget, beginFocusRestoreLoop } from "../../core/focusRestore";
import { BTN, resolveBindings } from "../../runtime/buttonBindings";
import { currentPlatformKey } from "../../core/onlineMetadata";
import { isSteamOSCached, primeSystemPlatform } from "../../runtime/diagnosticsInfo";
import { getLocalLibraryAppIds } from "../../steam";
import { trackFeature } from "../../steam/usageTracking";
import {
  useCardActivation, useCardInputBindings, useCardQuickLaunchState,
  useNativeCardClassInjection, useCardImageFallback, useCardAssetDecoration,
} from "./gameCardHooks";

// Master switch for cardHideRemove/cardHighlightToggle/cardQuickLaunch —
// gates resolveBindings() below regardless of the per-binding disabled list.
function cardActionsEnabled(): boolean {
  return getCurrentSettings()?.cardActionShortcutsEnabled !== false;
}

const TOKEN_TO_BTN: Record<string, number> = {
  X: BTN.SECONDARY, Y: BTN.OPTIONS,
  L1: BTN.L1, R1: BTN.R1, L2: BTN.L2, R2: BTN.R2,
  VIEW: BTN.VIEW, SELECT: BTN.VIEW,
  LSTICK: BTN.LSTICK, RSTICK: BTN.RSTICK,
  DPAD_UP: BTN.DPAD_UP, DPAD_DOWN: BTN.DPAD_DOWN,
  DPAD_LEFT: BTN.DPAD_LEFT, DPAD_RIGHT: BTN.DPAD_RIGHT,
};

function singleButtonToken(raw: string | null | undefined): number | null {
  if (!raw || raw.includes("+")) return null;
  return TOKEN_TO_BTN[raw.trim().toUpperCase()] ?? null;
}

type ActionDescriptionArgs = {
  previewMode: boolean; appid: number | undefined; isLibraryGame: boolean;
  quickLaunchLabel: string | undefined; removable: boolean; hideable: boolean; hiddenNow: boolean;
};

function fillActionDescriptions(args: ActionDescriptionArgs, b: ReturnType<typeof resolveBindings>): Record<number, string> {
  const out: Record<number, string> = {};
  const qb = singleButtonToken(b.cardQuickLaunch);
  if (qb !== null && args.isLibraryGame && args.quickLaunchLabel) out[qb] = args.quickLaunchLabel;
  const hb = singleButtonToken(b.cardHideRemove);
  if (hb !== null) {
    if (args.removable) out[hb] = i18n.t('card_remove');
    else if (args.hideable) out[hb] = i18n.t(args.hiddenNow ? 'card_show' : 'card_hide');
  }
  const yb = singleButtonToken(b.cardHighlightToggle);
  if (yb !== null) out[yb] = i18n.t('card_highlight_toggle');
  return out;
}

function computeCardDataAttrs(params: { appid: number; shelfId: string | undefined; name: string; showNewBadge: boolean; showDiscountBadge: boolean; discount: number | undefined; cardIndex: number | undefined }) {
  const { appid, shelfId, name, showNewBadge, showDiscountBadge, discount, cardIndex } = params;
  return {
    appid: appid || undefined,
    shelfId: shelfId || undefined,
    name: name || undefined,
    isNew: showNewBadge ? 'true' : undefined,
    discount: showDiscountBadge ? String(discount) : undefined,
    cardIndex: cardIndex !== undefined ? String(cardIndex) : undefined,
  };
}

function computeCardActionFlags(params: { appid: number | undefined; removableSet: Set<number> | undefined; onRemoveCard: ((appid: number) => void) | undefined; hiddenSet: Set<number> | undefined; onHideCard: ((appid: number) => void) | undefined }): { removable: boolean; hideable: boolean; hiddenNow: boolean } {
  const { appid, removableSet, onRemoveCard, hiddenSet, onHideCard } = params;
  return {
    removable: !!(appid && removableSet?.has(appid) && onRemoveCard),
    hideable: !!(appid && onHideCard),
    hiddenNow: !!(appid && hiddenSet?.has(appid)),
  };
}

// Build a {buttonId: label} map for Decky's Focusable `actionDescriptionMap`.
// Only single-button bindings get a legend; chords/doubles silently drop.
function buildActionDescriptionMap(args: ActionDescriptionArgs): Record<number, string> | undefined {
  const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled, cardActionsEnabled());
  if (args.previewMode || !args.appid) return undefined;
  const out = fillActionDescriptions(args, b);
  return Object.keys(out).length ? out : undefined;
}

function findHighlightTarget(s: any, shelfId: string): { isSmart: boolean; shelf: any; regular: any[]; smart: any[] } | null {
  const regular = (s.shelves ?? []) as any[];
  const smart = ((s as any).smartShelves ?? []) as any[];
  const isSmart = !regular.find((sh) => sh.id === shelfId);
  const shelf = isSmart ? smart.find((sh) => sh.id === shelfId) : regular.find((sh) => sh.id === shelfId);
  return shelf ? { isSmart, shelf, regular, smart } : null;
}

function computeHighlightPatch(shelf: any, appid: number): Record<string, any> {
  const ids: number[] = shelf.highlightedAppIds ?? [];
  const wasInIds = ids.includes(appid);
  const wasViaAll = !!shelf.highlightAll;
  if (!wasInIds && !wasViaAll) return { highlightedAppIds: [...ids, appid] };
  const patch: Record<string, any> = {};
  if (wasInIds) patch.highlightedAppIds = ids.filter((id) => id !== appid);
  if (wasViaAll) patch.highlightAll = false;
  return patch;
}

/* Y-button quick-action: toggle a per-card highlight (entry in
   `highlightedAppIds`). When the card was being highlighted via the
   shelf-level highlightAll / highlightFirst flags, this clears the
   shelf-level source instead so the user gets a predictable visual "off".
   Mirrors the context-menu "Highlight this game" path. */
export function toggleCardHighlight(shelfId: string | undefined, appid: number): void {
  if (!shelfId || !appid) return;
  const s = getCurrentSettings();
  if (!s) return;
  try { trackFeature("highlight"); } catch {}
  // Smart shelves carry their own settings array — fall back to it when the
  // id doesn't match a regular shelf so Y-button toggle works on
  // friends_playing / spare_time / etc cards too.
  const target = findHighlightTarget(s, shelfId);
  if (!target) return;
  const patch = computeHighlightPatch(target.shelf, appid);
  /* saveSettings triggers a Shelf re-render that may unmount/remount the
     card and lose focus. Mirror the context-menu "Highlight" path: save the
     focus target + start the restore loop so the card stays focused across
     the settings → React reconcile cycle. */
  try { saveFocusTarget(appid, shelfId); beginFocusRestoreLoop(); } catch {}
  if (target.isSmart) {
    const updated = target.smart.map((sh: any) => sh.id === shelfId ? { ...sh, ...patch } : sh);
    void saveSettings({ ...s, smartShelves: updated } as any);
  } else {
    void saveSettings(patchShelfInSettings(s, shelfId, patch));
  }
}

const downloadIcon = (
  <span className="ds-card-status-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={{ width: 14, height: 14, display: "block" }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M29 23V27H7V23H2V32H34V23H29Z" fill="currentColor" />
      <path d="M20 14.1716L24.5858 9.58578L27.4142 12.4142L18 21.8284L8.58582 12.4142L11.4142 9.58578L16 14.1715V2H20V14.1716Z" fill="currentColor" />
    </svg>
  </span>
);
const playIcon = (
  <span className="ds-card-status-icon ds-card-status-play">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={{ width: 14, height: 14, display: "block" }}>
      <path d="M7.5 32.135a1 1 0 0 1-1.5-.866V4.73a1 1 0 0 1 1.5-.866l22.999 13.269a1 1 0 0 1 0 1.732l-23 13.269Z" fill="currentColor" />
    </svg>
  </span>
);
const updateIcon = (
  <span className="ds-card-status-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14, display: "block" }}>
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
    </svg>
  </span>
);
const deckLogoSvg = (
  <svg className="ds-compat-deck-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path opacity="0.84" fillRule="evenodd" clipRule="evenodd" d="M7.77715 4.30197C10.9241 4.30197 13.4752 6.85305 13.4752 9.99997C13.4752 13.1469 10.9241 15.698 7.77715 15.698V18.8889C12.6864 18.8889 16.666 14.9092 16.666 9.99997C16.666 5.09078 12.6864 1.11108 7.77715 1.11108V4.30197ZM7.77756 13.8889C9.92533 13.8889 11.6664 12.1477 11.6664 9.99997C11.6664 7.8522 9.92533 6.11108 7.77756 6.11108C5.62979 6.11108 3.88867 7.8522 3.88867 9.99997C3.88867 12.1477 5.62979 13.8889 7.77756 13.8889Z" fill="currentColor" />
  </svg>
);
const checkmarkSvg = (
  <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.33342 11.9222L14.4945 5.76667L16.4556 7.72779L8.33342 15.8556L3.26675 10.7833L5.22786 8.82223L8.33342 11.9222Z" fill="currentColor" />
  </svg>
);
const infoCircleSvg = (
  <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.61079 9.44444V15H11.3886V9.44444H8.61079ZM9.07372 8.05245C9.34781 8.23558 9.67004 8.33333 9.99967 8.33333C10.4417 8.33333 10.8656 8.15774 11.1782 7.84518C11.4907 7.53262 11.6663 7.10869 11.6663 6.66667C11.6663 6.33703 11.5686 6.0148 11.3855 5.74072C11.2023 5.46663 10.942 5.25301 10.6375 5.12687C10.3329 5.00072 9.99783 4.96771 9.67452 5.03202C9.35122 5.09633 9.05425 5.25507 8.82116 5.48815C8.58808 5.72124 8.42934 6.01821 8.36503 6.34152C8.30072 6.66482 8.33373 6.99993 8.45988 7.30447C8.58602 7.60902 8.79964 7.86931 9.07372 8.05245Z" fill="currentColor" />
  </svg>
);
const xCircleSvg = (
  <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M14.1931 15.6064C13.0246 16.4816 11.5733 17 10.001 17C6.13498 17 3.00098 13.866 3.00098 10C3.00098 8.42766 3.51938 6.97641 4.39459 5.80783L14.1931 15.6064ZM15.6074 14.1922C16.4826 13.0236 17.001 11.5723 17.001 10C17.001 6.13401 13.867 3 10.001 3C8.42864 3 6.97739 3.5184 5.80881 4.39362L15.6074 14.1922ZM19.001 10C19.001 14.9706 14.9715 19 10.001 19C5.03041 19 1.00098 14.9706 1.00098 10C1.00098 5.02944 5.03041 1 10.001 1C14.9715 1 19.001 5.02944 19.001 10Z" fill="currentColor" />
  </svg>
);

// Native Steam input glyphs (viewBox 0 0 36 36), reproduced verbatim so the
// desktop compat badge matches the native library exactly: a gamepad for
// controller support, keyboard + mouse otherwise. `.ds-compat svg` sizes them.
const nativeControllerSvg = (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M31.5,9.6c-0.3-0.3-0.7-0.6-1.1-1V8.4c0,0,0-0.6-0.6-1.1s-3.9-1.7-5.1-1.7c-0.7,0-0.9,0.2-1.2,0.4c-0.2,0.1-0.3,0.2-0.5,0.2H12.9c-0.2,0-0.4-0.1-0.5-0.2c-0.2-0.2-0.5-0.4-1.2-0.4c-1.1,0-4.5,1.1-5.1,1.7S5.6,8.4,5.6,8.4v0.1c-0.4,0.3-0.8,0.7-1.1,1C3.4,10.7,0,20.2,0,25.3s3.4,5.6,3.4,5.6c0.9,0,2.3-1.8,3.7-3.5c1.2-1.5,2.3-3,3.1-3.2c1.7-0.6,14.1-0.6,15.8,0c0.8,0.3,1.9,1.7,3.1,3.2c1.4,1.7,2.8,3.5,3.7,3.5c0,0,3.4-0.6,3.4-5.6S32.6,10.7,31.5,9.6z M8.4,14.6c-1.2,0-2.2-1-2.2-2.2s1-2.2,2.2-2.2s2.2,1,2.2,2.2S9.7,14.6,8.4,14.6z M15.8,18.8c0,0.3-0.3,0.6-0.6,0.6h-0.8v0.8c0,0.3-0.3,0.6-0.6,0.6h-1.1c-0.3,0-0.6-0.3-0.6-0.6v-0.8h-0.8c-0.3,0-0.6-0.3-0.6-0.6v-1.1c0-0.3,0.3-0.6,0.6-0.6h0.8v-0.8c0-0.3,0.3-0.6,0.6-0.6h1.1c0.3,0,0.6,0.3,0.6,0.6v0.8h0.8c0.3,0,0.6,0.3,0.6,0.6V18.8z M27.6,8.7c0.8,0,1.4,0.6,1.4,1.4s-0.6,1.4-1.4,1.4s-1.4-0.6-1.4-1.4S26.8,8.7,27.6,8.7z M23.1,20.2c-1.2,0-2.2-1-2.2-2.2s1-2.2,2.2-2.2s2.2,1,2.2,2.2S24.3,20.2,23.1,20.2z M25,14.1c-0.8,0-1.4-0.6-1.4-1.4c0-0.8,0.6-1.4,1.4-1.4s1.4,0.6,1.4,1.4C26.4,13.4,25.8,14.1,25,14.1z M27.6,16.6c-0.8,0-1.4-0.6-1.4-1.4s0.6-1.4,1.4-1.4s1.4,0.6,1.4,1.4S28.3,16.6,27.6,16.6z M30.1,14.1c-0.8,0-1.4-0.6-1.4-1.4c0-0.8,0.6-1.4,1.4-1.4s1.4,0.6,1.4,1.4C31.5,13.4,30.9,14.1,30.1,14.1z" />
  </svg>
);
const nativeKbmSvg = (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M31.4096 7H1V23.5601H21.9066V19.8801H7.65209V18.0401H21.9066V17.7641C21.9066 17.2208 21.9876 16.6959 22.1387 16.2001H20.9563V14.36H22.8569V14.7117C23.7116 13.4671 25.0741 12.5776 26.6581 12.3204V10.68H28.5587V12.244H31.4096V7ZM5.75149 10.68H3.8509V12.52H5.75149V10.68ZM3.8509 18.0401H5.75149V19.8801H3.8509V18.0401ZM7.65209 14.36H3.8509V16.2001H7.65209V14.36ZM7.65209 10.68H9.55269V12.52H7.65209V10.68ZM11.4533 10.68H13.3539V12.52H11.4533V10.68ZM11.4533 14.36H9.55269V16.2001H11.4533V14.36ZM15.2545 10.68H17.1551V12.52H15.2545V10.68ZM15.2545 14.36H13.3539V16.2001H15.2545V14.36ZM17.1551 14.36H19.0557V16.2001H17.1551V14.36ZM20.9563 10.68H19.0557V12.52H20.9563V10.68ZM24.7575 10.68H22.8569V12.52H24.7575V10.68Z" />
    <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M27.9783 15.4332C26.3164 15.4332 24.9691 16.7376 24.9691 18.3466V25.1444C24.9691 27.8261 27.2146 30 29.9845 30C32.7545 30 35 27.8261 35 25.1444V18.3466C35 16.7376 33.6527 15.4332 31.9907 15.4332H27.9783ZM29.9845 17.861C29.4305 17.861 28.9814 18.2958 28.9814 18.8321V20.7744C28.9814 21.3107 29.4305 21.7455 29.9845 21.7455C30.5385 21.7455 30.9876 21.3107 30.9876 20.7744V18.8321C30.9876 18.2958 30.5385 17.861 29.9845 17.861Z" />
  </svg>
);

/* The card compat badge mirrors what native Steam shows for the current
   device: Deck compatibility on SteamOS, controller support everywhere else
   (macOS / Windows / desktop Linux, known synchronously; Linux decides from
   the cached SteamOS flag, defaulting to Deck until primed). */
// Owned-library app ids, memoized briefly — the compat/input badge only shows
// for owned games (store / wishlist cards, resolved from online sources, are
// not in the library and get no badge, matching the native library).
let _ownedSet: Set<number> | null = null;
let _ownedAt = 0;
function ownedLibraryAppIds(): Set<number> {
  const now = Date.now();
  if (!_ownedSet || now - _ownedAt > 30000) {
    try { _ownedSet = getLocalLibraryAppIds(true, false); } catch { _ownedSet = new Set(); }
    _ownedAt = now;
  }
  return _ownedSet;
}

function showsControllerCompat(): boolean {
  const plat = currentPlatformKey();
  if (plat === "mac" || plat === "windows") return true;
  primeSystemPlatform(); // idempotent — Linux needs the async SteamOS flag
  return isSteamOSCached() === false;
}

function computeBadgeFlags(params: { hideNewBadge: boolean; isNew: boolean | undefined; hideDiscountBadge: boolean; discount: number | undefined }): { showNewBadge: boolean; showDiscountBadge: boolean; hasBadge: boolean } {
  const showNewBadge = !params.hideNewBadge && params.isNew === true;
  const showDiscountBadge = !params.hideDiscountBadge && typeof params.discount === 'number' && params.discount > 0;
  return { showNewBadge, showDiscountBadge, hasBadge: showNewBadge || showDiscountBadge };
}

function resolveMenuActionDescription(previewMode: boolean, onMenuButton: unknown): string | undefined {
  if (previewMode || !onMenuButton) return undefined;
  return i18n.t('card_options');
}

function isCompatSuppressed(params: { hideCompatIcons: boolean; hideNonSteamBadge: boolean; isNonSteam: boolean; appid: number }): boolean {
  if (params.hideCompatIcons) return true;
  if (params.hideNonSteamBadge && params.isNonSteam) return true;
  return !ownedLibraryAppIds().has(params.appid);
}

function resolveCompatClass(params: { suppressCompat: boolean; useControllerCompat: boolean; compat: number }): string {
  if (params.suppressCompat) return "";
  if (params.useControllerCompat) {
    // Desktop clients show an input glyph on every card — controller for
    // controller support, keyboard + mouse otherwise. Neutral colour, one
    // icon (`ds-compat--controller` narrows the pill, neutralises the tint).
    return "ds-compat ds-compat--controller";
  }
  if (params.compat === 3) return "ds-compat ds-compat-verified";
  if (params.compat === 2) return "ds-compat ds-compat-playable";
  if (params.compat === 1) return "ds-compat ds-compat-unsupported";
  return "";
}

function CardCompatIcon({ useControllerCompat, controllerSupport, compat }: { useControllerCompat: boolean; controllerSupport: number; compat: number }) {
  if (useControllerCompat) return <>{controllerSupport >= 1 ? nativeControllerSvg : nativeKbmSvg}</>;
  return <>{deckLogoSvg}{compat === 3 ? checkmarkSvg : compat === 2 ? infoCircleSvg : xCircleSvg}</>;
}

type CardArtImageProps = {
  cssArtH: string; imgRef: React.RefObject<HTMLImageElement | null>; firstUrl: string; alt: string;
  imgLoaded: boolean; setImgLoaded: (v: boolean) => void; onImgError: () => void; onImgLoad: () => void;
  featured: boolean; compatClass: string; useControllerCompat: boolean; controllerSupport: number; compat: number;
};

/* Transform-target div — mirrors native card structure where theme CSS
   targets `_1HIFNGSxh4-jOhPiDynR4C > div:first-child` (TiltedHome tilt,
   ArtHero, etc). The Focusable above wears nativeCardWrapper (via
   resolveNativeCardClass) so "wrapper > div" themes land here. */
function CardArtImage(props: CardArtImageProps) {
  const { cssArtH, imgRef, firstUrl, alt, imgLoaded, setImgLoaded, onImgError, onImgLoad, featured, compatClass, useControllerCompat, controllerSupport, compat } = props;
  return (
    <div style={{ height: cssArtH, position: 'relative' }}>
      <div className="ds-card-art" style={{ background: "var(--ds-card-bg, rgba(50, 50, 55, 0.55))", overflow: "hidden" }}>
        <img
          ref={(el) => {
            imgRef.current = el;
            /* Eager-load detection: a hot blob URL / HTTP-cache hit means
               the browser already decoded the image, so el.complete +
               naturalWidth > 0 is true the same tick the ref fires — mark
               loaded synchronously to skip the opacity-gate flash. Cold
               loads stay gated and flip via onLoad below. */
            if (el && el.complete && (el.naturalWidth || 0) > 0 && !imgLoaded) {
              setImgLoaded(true);
            }
          }}
          src={firstUrl}
          alt={alt}
          onError={onImgError}
          onLoad={onImgLoad}
          decoding="async"
          /* opacity-gated — `onError` swaps src through the fallback chain
             (/customimages/* → CDN), and each failing URL would otherwise
             flash the browser's broken-image glyph. The ref callback above
             covers cached images, so this is instant-for-cached /
             glyph-free-for-cold. */
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: imgLoaded ? 1 : 0 }}
          loading={featured ? "eager" : "lazy"}
          fetchPriority="high"
        />
        <div className={`ds-card-shimmer${imgLoaded ? ' ds-card-shimmer--loaded' : ''}`} aria-hidden="true" />
        {compatClass && (
          <div className={compatClass}>
            <CardCompatIcon useControllerCompat={useControllerCompat} controllerSupport={controllerSupport} compat={compat} />
          </div>
        )}
      </div>
    </div>
  );
}

// Icon only renders when there's *some* text below the card — name, status
// row, or description. Sits to the left of the text column, vertically
// centred.
function cardIconVisible(params: { hideGameName: boolean; hideStatusLine: boolean; isLibraryGame: boolean; enableDescription: boolean; description: string | null; logoOwnsDescription: boolean }): boolean {
  const hasName = !params.hideGameName;
  const hasStatus = !params.hideStatusLine && params.isLibraryGame;
  const hasDesc = params.enableDescription && !!params.description && !params.logoOwnsDescription;
  return hasName || hasStatus || hasDesc;
}

type CardStatusLineProps = {
  hideStatusLine: boolean; overlayFriends: { avatar?: string }[]; friendsLabel: string;
  isLibraryGame: boolean; updatePending: boolean; isInstalled: boolean; playtime: string | null;
  hasPlaytime: boolean; hideInstallIndicator: boolean; t: (k: string, o?: any) => string;
};

function FriendsStatusRow({ friendsLabel }: { friendsLabel: string }) {
  return (
    <div className="ds-card-status ds-card-status--friends">
      {playIcon}
      <span style={{ color: 'var(--ds-native-heading-color, rgb(89, 191, 64))', fontWeight: 700, fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {friendsLabel}
      </span>
    </div>
  );
}

// Mirrors the native menu's install/update/play state machine for the
// status line's icon + label — one clear case per (installed × hasUpdate ×
// hasPlaytime) combination, same branches the old inline IIFE had.
type InstallStatusContent = { icon: typeof downloadIcon; labelKey: string; labelOpts?: Record<string, unknown> };

// Mirrors the native menu's install/update/play state machine — one case
// per (installed × hasUpdate × hasPlaytime) combination.
function resolveInstallStatusContent(params: { isInstalled: boolean; updatePending: boolean; hasPlaytime: boolean; playtime: string | null }): InstallStatusContent {
  const { isInstalled, updatePending, hasPlaytime, playtime } = params;
  if (!isInstalled) {
    return hasPlaytime
      ? { icon: downloadIcon, labelKey: 'playtime_label', labelOpts: { time: playtime } }
      : { icon: downloadIcon, labelKey: 'status_not_installed' };
  }
  if (updatePending) {
    return hasPlaytime
      ? { icon: updateIcon, labelKey: 'playtime_label', labelOpts: { time: playtime } }
      : { icon: updateIcon, labelKey: 'status_no_playtime' };
  }
  return hasPlaytime
    ? { icon: playIcon, labelKey: 'playtime_label', labelOpts: { time: playtime } }
    : { icon: playIcon, labelKey: 'status_no_playtime' };
}

function InstallStatusRow({ isInstalled, updatePending, hasPlaytime, playtime, hideInstallIndicator, t }: { isInstalled: boolean; updatePending: boolean; hasPlaytime: boolean; playtime: string | null; hideInstallIndicator: boolean; t: (k: string, o?: any) => string }) {
  const { icon, labelKey, labelOpts } = resolveInstallStatusContent({ isInstalled, updatePending, hasPlaytime, playtime });
  return <div className="ds-card-status">{!hideInstallIndicator && icon}<span>{t(labelKey, labelOpts)}</span></div>;
}

// Avatar pixels are drawn by the global FriendsAvatarOverlay (portaled above
// the focus ring); the card just advertises the friend avatar URLs.
function computeFriendsDisplay(overlayFriends: { avatar?: string }[], t: (k: string, o?: any) => string): { friendsLabel: string; friendAvatarAttr: string | undefined } {
  if (overlayFriends.length === 0) return { friendsLabel: "", friendAvatarAttr: undefined };
  const friendsLabel = overlayFriends.length === 1
    ? t("friends_overlay_count_one", { count: 1 })
    : t("friends_overlay_count_other", { count: overlayFriends.length });
  const friendAvatarAttr = overlayFriends.slice(0, 3).map((f) => f.avatar).filter(Boolean).join("|") || undefined;
  return { friendsLabel, friendAvatarAttr };
}

function buildCardClassName(params: { featured: boolean; nativeCardClass: string; hideCompatIcons: boolean; hideNonSteamBadge: boolean }): string {
  const { featured, nativeCardClass, hideCompatIcons, hideNonSteamBadge } = params;
  let cls = "ds-card";
  if (featured) cls += " ds-card--featured";
  if (nativeCardClass) cls += ` ${nativeCardClass}`;
  if (hideCompatIcons) cls += " ds-card--hide-compat";
  if (hideNonSteamBadge) cls += " ds-card--hide-non-steam-badge";
  return cls;
}

function labelAlignItems(iconVerticalAlign: 'top' | 'center' | 'bottom'): 'center' | 'flex-end' | 'flex-start' {
  if (iconVerticalAlign === 'center') return 'center';
  if (iconVerticalAlign === 'bottom') return 'flex-end';
  return 'flex-start';
}

/* Size off the per-shelf --ds-eff-* vars (set by DeckRow when
   matchNativeSize is on) so a native-dims change reflows via CSS, no
   re-render; the prop is the fallback. Art height that already covers the
   whole card sizes off the card's own box (100%) instead of the
   --ds-eff-*-art-h var, which can end up shorter and leave a gap. */
function computeCardCssDims(params: { featured: boolean; cardW: number; cardH: number; artH: number }): { cssW: string; cssH: string; cssArtH: string } {
  const { featured, cardW, cardH, artH } = params;
  const cssW = `var(${featured ? "--ds-eff-feat-w" : "--ds-eff-card-w"}, ${cardW}px)`;
  const cssH = `var(${featured ? "--ds-eff-feat-h" : "--ds-eff-card-h"}, ${cardH}px)`;
  const artFillsCard = artH >= cardH;
  const cssArtH = artFillsCard
    ? "100%"
    : `var(${featured ? "--ds-eff-feat-art-h" : "--ds-eff-card-art-h"}, ${artH}px)`;
  return { cssW, cssH, cssArtH };
}

function selectionMarkBoxShadow(mark: NonNullable<DeckRowItem['selectionMark']>): string {
  if (mark === 'grabbed') return '0 0 0 2px #ffd54f, 0 0 0 5px rgba(255, 213, 79, 0.35)';
  if (mark === 'hidden') return '0 0 0 2px #ef5350';
  if (mark === 'added') return '0 0 0 2px #2196f3';
  return '0 0 0 2px #4caf50';
}

/* Editor picker markers — siblings of the art / label, anchored to the
   Focusable's positioned wrapper. The colored ring reuses the native focus
   ring's box-shadow (shelfStyles.ts: `box-shadow: 0 0 0 2px ...`) so it sits
   at the card's OUTSIDE edge across every preview tab. Dim layer + corner
   icon stay inside the art for hidden-state readability. */
function CardSelectionMarkOverlay({ mark, cssArtH }: { mark: DeckRowItem['selectionMark']; cssArtH: string }) {
  if (!mark) return null;
  return (
    <div
      aria-hidden='true'
      style={{
        position: 'absolute',
        // Confine to the art rectangle (top:0 + cssArtH) — the label area
        // sits at top:100% with absolute positioning outside this overlay,
        // so it stays unobscured.
        top: 0, left: 0, right: 0, height: cssArtH,
        pointerEvents: 'none',
        borderRadius: 'var(--ds-card-radius, 0)',
        /* Outset ring at the SAME offset Steam's focus ring uses — 2px
           outside the card edge. The colored ring lives on this container's
           box-shadow so themes (Round / Outrun) keep the corner curve and
           the line never crosses into the art interior. */
        boxShadow: selectionMarkBoxShadow(mark),
        zIndex: 4,
      }}
    >
      {mark === 'hidden' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', borderRadius: 'inherit' }} />
      )}
      {mark === 'highlight' && (
        // Match the legacy `CheckIcon` exactly (14px, viewBox 24x24, stroke
        // #4caf50 width 2.5, polyline `20 6 9 17 4 12`).
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#4caf50' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' style={{ position: 'absolute', top: 4, left: 4 }}>
          <polyline points='20 6 9 17 4 12' />
        </svg>
      )}
      {mark === 'hidden' && (
        // Mirror the CheckIcon style: line-only X (no filled circle). Same
        // 14px / viewBox 24x24 / strokeWidth 2.5 grammar so check + X read
        // as a coherent pair.
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#f44336' strokeWidth='2.5' strokeLinecap='round' style={{ position: 'absolute', top: 4, left: 4 }}>
          <line x1='18' y1='6' x2='6' y2='18' />
          <line x1='6' y1='6' x2='18' y2='18' />
        </svg>
      )}
      {mark === 'added' && (
        // Same line-art grammar as check / X — 14px, viewBox 24x24,
        // strokeWidth 2.5. Blue (#2196f3) marks "manually added to shelf"
        // (in manualOrder but not in the resolved source).
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#2196f3' strokeWidth='2.5' strokeLinecap='round' style={{ position: 'absolute', top: 4, left: 4 }}>
          <line x1='12' y1='5' x2='12' y2='19' />
          <line x1='5' y1='12' x2='19' y2='12' />
        </svg>
      )}
    </div>
  );
}

function CardBadgeHost({ hasBadge, showDiscountBadge, showNewBadge, discount, t }: { hasBadge: boolean; showDiscountBadge: boolean; showNewBadge: boolean; discount: number | undefined; t: (k: string, o?: any) => string }) {
  if (!hasBadge) return null;
  return (
    <div
      className="ds-card-badge-host ds-card-badge-host--inline"
      aria-hidden="true"
      style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 24, pointerEvents: 'none', zIndex: 50 }}
    >
      {showDiscountBadge && (
        <div className="ds-new-badge-band">
          <div className="ds-new-badge" style={{ background: '#2a7f2a' }}>
            {t('badge_discount', { count: discount }) ?? `${discount}% off`}
          </div>
        </div>
      )}
      {showNewBadge && !showDiscountBadge && (
        <div className="ds-new-badge-band">
          <div className="ds-new-badge">{t('badge_new')}</div>
        </div>
      )}
    </div>
  );
}

type CardLabelBlockProps = {
  cssW: string; cssArtH: string; hideStatusLine: boolean; iconVerticalAlign: 'top' | 'center' | 'bottom';
  showIcon: boolean; iconSrc: string | null; setIconIdx: (updater: (i: number) => number) => void;
  playtimePosition: 'left' | 'center' | 'right'; hideGameName: boolean; gameNamePosition: 'left' | 'center' | 'right';
  gameName: string; statusLine: CardStatusLineProps; enableDescription: boolean; description: string | null;
  logoOwnsDescription: boolean; descriptionPosition: 'left' | 'center' | 'right';
};

/* Non-library items have no meaningful install state — CardStatusLine
   already hides per card. Description renders below the install/playtime
   row, unless `descriptionBelowLogo` moved it into the logo overlay
   instead (PerShelfHero.tsx). */
function CardLabelBlock(props: CardLabelBlockProps) {
  const { cssW, cssArtH, hideStatusLine, iconVerticalAlign, showIcon, iconSrc, setIconIdx, playtimePosition, hideGameName, gameNamePosition, gameName, statusLine, enableDescription, description, logoOwnsDescription, descriptionPosition } = props;
  return (
    <div
      className={`ds-card-label${hideStatusLine ? ' ds-card-label--compact' : ''}`}
      style={{
        position: "absolute", top: cssArtH, left: 0, width: `calc(${cssW} + 20px)`, paddingTop: 10,
        pointerEvents: "none", display: "flex", flexDirection: "row", alignItems: labelAlignItems(iconVerticalAlign), gap: 6,
      }}
    >
      {showIcon && (
        <img className="ds-card-icon" src={iconSrc as string} alt="" aria-hidden="true" onError={() => setIconIdx((i) => i + 1)} />
      )}
      <div data-ds-playtime-position={playtimePosition} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 auto', position: 'relative' }}>
        {!hideGameName && (
          <div className="ds-card-label-name" style={{ textAlign: gameNamePosition, width: '100%' }}>{gameName}</div>
        )}
        <CardStatusLine {...statusLine} />
        {enableDescription && description && !logoOwnsDescription && (
          <div className="ds-card-description" data-ds-position={descriptionPosition}>{description}</div>
        )}
      </div>
    </div>
  );
}

function CardStatusLine(props: CardStatusLineProps) {
  if (props.hideStatusLine) return null;
  if (props.overlayFriends.length > 0) return <FriendsStatusRow friendsLabel={props.friendsLabel} />;
  if (!props.isLibraryGame) return null;
  return (
    <InstallStatusRow
      isInstalled={props.isInstalled}
      updatePending={props.updatePending}
      hasPlaytime={props.hasPlaytime}
      playtime={props.playtime}
      hideInstallIndicator={props.hideInstallIndicator}
      t={props.t}
    />
  );
}

type GameCardProps = {
  item: DeckRowItem; cardW?: number; cardH?: number; artH?: number; featured?: boolean; cardIndex?: number;
  hideStatusLine?: boolean; hideNewBadge?: boolean; hideDiscountBadge?: boolean; hideCompatIcons?: boolean;
  hideNonSteamBadge?: boolean; hideGameName?: boolean; hideInstallIndicator?: boolean; friendsOverlay?: boolean;
  friendsOverlayRecent?: boolean; enableLogo?: boolean; enableIcon?: boolean; enableDescription?: boolean;
  descriptionBelowLogo?: boolean; logoPosition?: 'left' | 'center' | 'right'; descriptionPosition?: 'left' | 'center' | 'right';
  iconVerticalAlign?: 'top' | 'center' | 'bottom'; gameNamePosition?: 'left' | 'center' | 'right';
  playtimePosition?: 'left' | 'center' | 'right'; inlineBadges?: boolean; previewMode?: boolean;
  removableSet?: Set<number>; onRemoveCard?: (appid: number) => void; hiddenSet?: Set<number>; onHideCard?: (appid: number) => void;
};

function GameCardImpl({ item, cardW = CARD_W, cardH = CARD_ART_H, artH: artHProp, featured = false, cardIndex, hideStatusLine = false, hideNewBadge = false, hideDiscountBadge = false, hideCompatIcons = false, hideNonSteamBadge = false, hideGameName = false, hideInstallIndicator = false, friendsOverlay = false, friendsOverlayRecent = false, enableLogo = false, enableIcon = false, enableDescription = false, descriptionBelowLogo = false, descriptionPosition = 'left', iconVerticalAlign = 'top', gameNamePosition = 'left', playtimePosition = 'left', previewMode = false, removableSet, onRemoveCard, hiddenSet, onHideCard }: GameCardProps) {
  const t = i18n.t.bind(i18n);
  const cardRef = useRef<HTMLDivElement>(null);
  // Gates description fetch + icon/logo/cover cache warming to cards near
  // the visible scroll area — see useNearViewport.
  const isNearViewport = useNearViewport(cardRef, '600px');
  const imgRef = useRef<HTMLImageElement>(null);
  const appid = typeof item.id === "number" ? item.id : Number(item.appid ?? 0);
  const featuredW = cardW;
  const artH = artHProp ?? cardH;
  const { cssW, cssH, cssArtH } = computeCardCssDims({ featured, cardW, cardH, artH });

  /* getFriendsInApp (below) is a plain pull read during render, not a prop —
     without this, a card whose other props stay stable across a friends
     poll never re-renders to pick up a friend who just started playing.
     Only subscribes when the decoration is actually on. */
  const [, forceFriendsTick] = useState(0);
  useEffect(() => {
    if (!friendsOverlay || previewMode) return;
    return subscribeFriendsChanged(() => forceFriendsTick((n) => n + 1));
  }, [friendsOverlay, previewMode]);

  const { activate, quickLaunch } = useCardActivation({ cardRef, item, previewMode, appid });
  const cardState = useCardQuickLaunchState(appid, previewMode);
  const quickLaunchLabel = cardState.label;
  const { buttonDownHandler } = useCardInputBindings({
    cardRef, appid, previewMode, shelfId: item.shelfId, removableSet, onRemoveCard, onHideCard,
    quickLaunch, toggleCardHighlight,
  });
  /* `isLibraryGame` = appid resolves to an AppOverview in the local Steam
     store. True for any game the user owns (installed or not, Steam or
     non-Steam shortcut). False for decorations (no appid), online items
     (wishlist / store, not owned) and non-owned friends-playing. Gates
     Options button, View/quick-launch, and install indicator. */
  const isLibraryGame = useMemo(() => {
    if (previewMode || !appid) return false;
    try { return !!(globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); }
    catch { return false; }
  }, [appid, previewMode]);

  const nativeCardClass = useNativeCardClassInjection(cardRef, imgRef, featured);

  const assetKey = getAppAssetCacheKey(appid);
  const { iconSrc, setIconIdx, description } = useCardAssetDecoration({
    appid, assetKey, isNearViewport, previewMode, enableLogo, enableIcon, enableDescription,
  });
  const { firstUrl, imgFailed, imgLoaded, setImgLoaded, onImgError, onImgLoad } = useCardImageFallback({
    imgRef, appid, featured, item, assetKey, isNearViewport,
  });

  const compat = item.deckCompatCategory ?? 0;
  const playtime = formatPlaytime(item.playtimeMinutes);
  const isNonSteam = item.isSteam === false;
  // The compat / input badge is only for owned library games (matches
  // native — store & wishlist cards, resolved from online sources, aren't owned).
  const suppressCompat = isCompatSuppressed({ hideCompatIcons, hideNonSteamBadge, isNonSteam, appid });
  // Desktop clients (macOS / Windows / desktop Linux) show controller
  // support instead of Deck compatibility; reuse the badge slot + the
  // verified/playable colour classes (full → green, partial → amber).
  const useControllerCompat = showsControllerCompat();
  const controllerSupport = item.controllerSupport ?? 0;
  const compatClass = resolveCompatClass({ suppressCompat, useControllerCompat, compat });
  const discount = item.discountPercent;
  const { showNewBadge, showDiscountBadge, hasBadge } = computeBadgeFlags({ hideNewBadge, isNew: item.isNew, hideDiscountBadge, discount });

  // Badge: inline render only here. A single global BadgeFocusOverlay
  // (mounted by HomeInject) draws the on-focus badge above the focus ring by
  // reading data-isnew / data-discount from the focused card.

  // Placeholder fallback must be returned AFTER all hooks above so the hook
  // count stays stable across renders (React error #300 otherwise).
  if (imgFailed || !firstUrl) {
    return <PlaceholderCard
      item={item}
      cardW={cardW}
      cardH={cardH}
      artH={artH}
      featured={featured}
      previewMode={previewMode}
      removableSet={removableSet}
      onRemoveCard={onRemoveCard}
      hiddenSet={hiddenSet}
      onHideCard={onHideCard}
    />;
  }

  const overlayFriends = friendsOverlay && !previewMode ? getFriendsInApp(appid, friendsOverlayRecent) : [];
  const { friendsLabel, friendAvatarAttr } = computeFriendsDisplay(overlayFriends, t);
  const logoOwnsDescription = enableLogo && descriptionBelowLogo;
  const showIcon = enableIcon && iconSrc && cardIconVisible({ hideGameName, hideStatusLine, isLibraryGame, enableDescription, description, logoOwnsDescription });
  const dataAttrs = computeCardDataAttrs({ appid, shelfId: item.shelfId, name: item.name, showNewBadge, showDiscountBadge, discount, cardIndex });
  // TiltedHome compat CSS uses this to compute the exact zoom scale that
  // covers the skewed parallelogram — featured (landscape) and portrait
  // cards need different scale factors.
  const cardHWRatio = featuredW > 0 ? (cardH / featuredW).toFixed(4) : "1.5";

  return (
    <Focusable
      ref={cardRef}
      className={buildCardClassName({ featured, nativeCardClass, hideCompatIcons, hideNonSteamBadge })}
      focusClassName="gpfocus"
      role="listitem"
      onActivate={activate}
      onOKButton={activate}
      /* Menu/Options stays bound for EVERY real card with an onMenuButton —
         wishlist/store shelves rely on it for Properties/View-store/DS
         actions. Only View (below) is library-gated. */
      onMenuButton={item.onMenuButton}
      onMenuActionDescription={resolveMenuActionDescription(previewMode, item.onMenuButton)}
      onContextMenu={item.onMenuButton}
      onButtonDown={previewMode ? undefined : buttonDownHandler}
      actionDescriptionMap={buildActionDescriptionMap({
        previewMode, appid, isLibraryGame, quickLaunchLabel,
        ...computeCardActionFlags({ appid, removableSet, onRemoveCard, hiddenSet, onHideCard }),
      })}
      data-appid={dataAttrs.appid}
      data-ds-friend-avatars={friendAvatarAttr}
      data-shelfid={dataAttrs.shelfId}
      data-name={dataAttrs.name}
      data-isnew={dataAttrs.isNew}
      data-discount={dataAttrs.discount}
      data-ds-card-index={dataAttrs.cardIndex}
      style={{
        position: "relative",
        width: cssW,
        minWidth: cssW,
        height: cssH,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        // Matches .ds-card-art's idle placeholder tone so the reserved
        // label strip below the art doesn't go fully transparent.
        background: "var(--ds-card-bg, rgba(50, 50, 55, 0.55))",
        cursor: "pointer",
        overflow: "visible",
        ["--ds-card-art-h" as string]: cssArtH,
        ["--ds-card-h-w-ratio" as string]: cardHWRatio,
      }}
    >
      <CardBadgeHost hasBadge={hasBadge} showDiscountBadge={showDiscountBadge} showNewBadge={showNewBadge} discount={discount} t={t} />
      <CardArtImage
        cssArtH={cssArtH}
        imgRef={imgRef}
        firstUrl={firstUrl}
        alt={item.name}
        imgLoaded={imgLoaded}
        setImgLoaded={setImgLoaded}
        onImgError={onImgError}
        onImgLoad={onImgLoad}
        featured={featured}
        compatClass={compatClass}
        useControllerCompat={useControllerCompat}
        controllerSupport={controllerSupport}
        compat={compat}
      />
      <CardLabelBlock
        cssW={cssW}
        cssArtH={cssArtH}
        hideStatusLine={hideStatusLine}
        iconVerticalAlign={iconVerticalAlign}
        showIcon={!!showIcon}
        iconSrc={iconSrc}
        setIconIdx={setIconIdx}
        playtimePosition={playtimePosition}
        hideGameName={hideGameName}
        gameNamePosition={gameNamePosition}
        gameName={item.name}
        statusLine={{
          hideStatusLine, overlayFriends, friendsLabel, isLibraryGame,
          updatePending: item.updatePending === true, isInstalled: item.isInstalled === true,
          playtime, hasPlaytime: !!playtime && !!item.playtimeMinutes && item.playtimeMinutes > 0,
          hideInstallIndicator, t,
        }}
        enableDescription={enableDescription}
        description={description}
        logoOwnsDescription={logoOwnsDescription}
        descriptionPosition={descriptionPosition}
      />
      {/* Logo overlay — composited over the art (top area). When active, the
          in-label game name is suppressed (`!hideGameName && !enableLogo`
          above). With `descriptionBelowLogo` and `enableDescription`, the
          description sits directly below the logo. */}
      {/* Logo + (optionally) description below it are rendered ONCE per
          shelf in `PerShelfHero` — tied to the currently focused card — not
          per card. See `PerShelfHero.tsx` for the focused-card logo +
          description render path. */}
      {/* Editor picker markers — siblings of the art / label, anchored to the
          Focusable's positioned wrapper. The colored ring reuses the native
          focus ring's box-shadow (shelfStyles.ts: `box-shadow: 0 0 0 2px ...`)
          so it sits at the card's OUTSIDE edge across every preview tab. Dim
          layer + corner icon stay inside the art for hidden-state readability. */}
      <CardSelectionMarkOverlay mark={item.selectionMark} cssArtH={cssArtH} />
    </Focusable>
  );
}

export const GameCard = memo(GameCardImpl);
