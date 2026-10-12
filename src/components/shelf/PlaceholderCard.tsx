import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Focusable, GamepadButton } from "../../runtime/host/decky";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals, applyNativeAfterAnimation } from "./cardUtils";
import { toggleCardHighlight } from "./GameCard";
import { useCardQuickLaunchState } from "./gameCardHooks";

type Handler = (() => void) | undefined;

// Size off the per-shelf --ds-eff-* vars (mirrors GameCard) so a native-dims
// change reflows through CSS with no re-render; the props are the fallback.
function cardSizeVars(featured: boolean, cardW: number, cardH: number, artH: number | undefined) {
  const art = typeof artH === "number" ? artH : cardH;
  return {
    cssW: `var(${featured ? "--ds-eff-feat-w" : "--ds-eff-card-w"}, ${cardW}px)`,
    cssH: `var(${featured ? "--ds-eff-feat-h" : "--ds-eff-card-h"}, ${cardH}px)`,
    cssArtH: `var(${featured ? "--ds-eff-feat-art-h" : "--ds-eff-card-art-h"}, ${art}px)`,
  };
}

function hideLabel(previewMode: boolean, hidden: boolean): string {
  if (previewMode) return i18n.t(hidden ? 'show_in_shelf' : 'hide_from_shelf');
  return i18n.t(hidden ? 'card_show' : 'card_hide');
}

/* X → remove (for menu-added cards) or hide (otherwise). Same context-aware
   shape as GameCard, including the short home-only labels. */
function secondaryAction(args: {
  appid: number; previewMode: boolean;
  removableSet?: Set<number>; onRemoveCard?: (appid: number) => void;
  hiddenSet?: Set<number>; onHideCard?: (appid: number) => void;
}): { description: string | undefined; handler: Handler } {
  const { appid, previewMode, removableSet, onRemoveCard, hiddenSet, onHideCard } = args;
  if (appid && removableSet?.has(appid) && onRemoveCard) {
    return { description: i18n.t(previewMode ? 'menu_remove_from_shelf' : 'card_remove'), handler: () => { try { onRemoveCard(appid); } catch {} } };
  }
  if (appid && onHideCard) {
    return { description: hideLabel(previewMode, !!hiddenSet?.has(appid)), handler: () => { try { onHideCard(appid); } catch {} } };
  }
  return { description: undefined, handler: undefined };
}

/* Y → highlight toggle. Same gating as GameCard: only outside previewMode
   (the modal owns highlight via its picker) and only with a real appid. */
function optionsAction(appid: number, previewMode: boolean, shelfId: string | undefined): { description: string | undefined; handler: Handler } {
  if (previewMode || !appid) return { description: undefined, handler: undefined };
  return { description: i18n.t('card_highlight_toggle'), handler: () => { try { toggleCardHighlight(shelfId, appid); } catch {} } };
}

// Class, activation, menu and data attributes — the item-driven part of the card.
function placeholderFocusProps(item: DeckRowItem, previewMode: boolean, featured: boolean, nativeCardClass: string) {
  return {
    className: `ds-card ds-card--text${featured ? ' ds-card--featured' : ''}${nativeCardClass ? ` ${nativeCardClass}` : ''}`,
    onActivate: item.onToggleSelection ?? item.onActivate,
    onOKButton: item.onToggleSelection ?? item.onActivate,
    onMenuButton: item.onMenuButton,
    onMenuActionDescription: !previewMode && item.onMenuButton ? i18n.t('card_options') : undefined,
    onContextMenu: item.onMenuButton,
    "data-appid": item.appid || undefined,
    "data-shelfid": item.shelfId || undefined,
  };
}

function PlaceholderArt({ featured, name, discount, isNew, radius }: { featured: boolean; name: string; discount: number | undefined; isNew: boolean; radius: number | string }) {
  const { t } = useTranslation();
  const showDiscountBadge = typeof discount === 'number' && discount > 0;
  const showNewBadge = isNew && !showDiscountBadge;
  return (
    <div
      className="ds-card-art"
      style={{
        overflow: "hidden",
        background: "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: featured ? 16 : 6,
        boxSizing: "border-box",
        borderRadius: radius,
      }}
    >
      <span className="ds-card-text" style={{
        fontSize: featured ? 14 : 11,
        opacity: 0.5,
        textAlign: "center",
        wordBreak: "break-word",
        lineHeight: 1.3,
      }}>
        {name}
      </span>
      {showDiscountBadge && (
        <div className="ds-new-badge-band">
          <div className="ds-new-badge" style={{ background: '#2a7f2a' }}>
            {t('badge_discount', { count: discount }) ?? `${discount}% off`}
          </div>
        </div>
      )}
      {showNewBadge && (
        <div className="ds-new-badge-band">
          <div className="ds-new-badge">{t('badge_new')}</div>
        </div>
      )}
    </div>
  );
}

export function PlaceholderCard({
  item,
  cardW = CARD_W,
  cardH = CARD_ART_H,
  artH,
  featured = false,
  previewMode = false,
  removableSet,
  onRemoveCard,
  hiddenSet,
  onHideCard,
}: {
  item: DeckRowItem;
  cardW?: number;
  cardH?: number;
  artH?: number;
  featured?: boolean;
  previewMode?: boolean;
  removableSet?: Set<number>;
  onRemoveCard?: (appid: number) => void;
  hiddenSet?: Set<number>;
  onHideCard?: (appid: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');
  const appid = item.appid ?? 0;

  useEffect(() => {
    return retryWithIntervals(() => {
      const doc = getPreferredSteamDocument();
      const cls = resolveNativeCardClass(doc);
      if (cls === null) return false;
      setNativeCardClass(cls);
      applyNativeAfterAnimation(doc, cardRef.current);
      return true;
    }, [250, 500, 800, 1200]);
  }, []);

  /* View (SELECT) binding — mirrors GameCard. Needed here because cards
     without library art fall through to PlaceholderCard, and the user
     still expects the "Atualizar / Retomar / Jogar / Instalar" hint +
     action on the View button for owned-library items. */
  const isLibraryGame = useMemo(() => {
    if (previewMode || !appid) return false;
    try { return !!(globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); }
    catch { return false; }
  }, [appid, previewMode]);
  // The same per-state label/action GameCard shows, from the shared store.
  const cardState = useCardQuickLaunchState(appid, previewMode);
  /* Mirror GameCard: open the native menu and click its first item —
     same dispatch as the user picking that item manually. Avoids the
     state-specific Steam APIs (RunGame / RaiseWindowForGame /
     ResumeAppUpdate) which behave inconsistently on the Deck. */
  const quickLaunch = useCallback(() => {
    if (previewMode || !appid) return;
    if (typeof item.onMenuButton !== 'function') return;
    try {
      item.onMenuButton({} as any);
      const doc = cardRef.current?.ownerDocument ?? document;
      let attempts = 0;
      const tryClick = () => {
        const first = doc.querySelector('.contextMenuItem') as HTMLElement | null;
        if (first) { try { first.click(); } catch {} return; }
        if (attempts++ < 12) requestAnimationFrame(tryClick);
      };
      requestAnimationFrame(tryClick);
    } catch {}
  }, [appid, previewMode, item.onMenuButton]);
  const buttonDownHandler = useCallback((evt: any) => {
    if (previewMode || !appid) return;
    try {
      if (evt?.detail?.button === GamepadButton.SELECT) quickLaunch();
    } catch {}
  }, [appid, previewMode, quickLaunch]);

  const size = cardSizeVars(featured, cardW, cardH, artH);
  const secondary = secondaryAction({ appid, previewMode, removableSet, onRemoveCard, hiddenSet, onHideCard });
  const options = optionsAction(appid, previewMode, item.shelfId);
  const libraryInput = isLibraryGame
    ? { onButtonDown: buttonDownHandler, actionDescriptionMap: cardState.label ? { [GamepadButton.SELECT]: cardState.label } : undefined }
    : { onButtonDown: undefined, actionDescriptionMap: undefined };

  return (
    <Focusable
      ref={cardRef}
      {...placeholderFocusProps(item, previewMode, featured, nativeCardClass)}
      focusClassName="gpfocus"
      role="listitem"
      onOptionsActionDescription={options.description}
      onOptionsButton={options.handler}
      onSecondaryActionDescription={secondary.description}
      onSecondaryButton={secondary.handler}
      onButtonDown={libraryInput.onButtonDown}
      actionDescriptionMap={libraryInput.actionDescriptionMap}
      style={{
        position: "relative",
        width: size.cssW,
        minWidth: size.cssW,
        height: size.cssH,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "pointer",
        overflow: "visible",
        // Pass artH through the same `--ds-card-art-h` variable GameCard uses,
        // so the art region fills the right height in the modal preview (where
        // cardH includes the label strip and artH is shorter).
        ["--ds-card-art-h" as string]: size.cssArtH,
      }}
    >
      <PlaceholderArt featured={featured} name={item.name} discount={item.discountPercent} isNew={item.isNew === true} radius={getCachedCardRadius()} />
    </Focusable>
  );
}
