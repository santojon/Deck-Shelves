import React, { useEffect, useRef, useState } from "react";
import { Focusable, Navigation } from "../../runtime/host/decky";
import i18n from "../../i18n";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";
import { usePlatform } from "../../runtime/platformContext";
import { showSyntheticCardMenu } from "../../core/syntheticCardMenu";
import { resolveLocalImage, subscribeLocalImage } from "../../core/localImage";
import { getCurrentSettings, saveSettings } from "../../store/settingsStore";
import { patchShelfInSettings } from "../../domain/settings";

// An invalid URL sent to NavigateToExternalWeb can leave the Big Picture router broken.
function openExternalUrl(raw: string): void {
  if (!raw) return;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { new URL(url); } catch { return; }
  const sc: any = (globalThis as any).SteamClient;
  if (typeof sc?.System?.OpenInSystemBrowser === "function") {
    sc.System.OpenInSystemBrowser(url);
    return;
  }
  try { Navigation?.NavigateToExternalWeb?.(url); } catch {}
}

type Synth = NonNullable<DeckRowItem["synthetic"]>;

function synthActions(canPatch: boolean, onRemove: () => void, onToggleSize: () => void) {
  if (!canPatch) return {};
  return {
    onSecondaryButton: onRemove,
    onSecondaryActionDescription: i18n.t('card_remove'),
    onOptionsButton: onToggleSize,
    onOptionsActionDescription: i18n.t('card_synth_toggle_size'),
  };
}

function syntheticFrame(synth: Synth, cardW: number, cardH: number, featuredW: number | undefined) {
  const hasContent = synth.text !== undefined || synth.image !== undefined;
  const effW = synth.size === "featured" && featuredW ? featuredW : cardW;
  const focusable = hasContent && !!synth.link;
  const cssW = `${effW}px`;
  const cssH = `${cardH}px`;
  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: cssW,
    minWidth: cssW,
    height: cssH,
    flexShrink: 0,
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: focusable ? "pointer" : "default",
    overflow: "visible",
    opacity: typeof synth.alpha === "number" ? synth.alpha : 1,
  };
  return { hasContent, focusable, cssW, cssH, containerStyle };
}

function synthTarget(item: DeckRowItem, synth: Synth) {
  const shelfId = String(item.shelfId ?? "");
  const synthIndex = typeof synth.index === "number" ? synth.index : -1;
  return { shelfId, synthIndex, canPatchSynth: synthIndex >= 0 && !!shelfId };
}

const gapAttr = (hasContent: boolean) => (hasContent ? {} : { "data-ds-synthetic-gap": "1" });

function shadowClassFor(synth: Synth, focusable: boolean): string {
  if (!focusable) return " ds-card--synthetic-noshadow";
  const mode = synth.shadowMode ?? "never";
  if (mode === "always") return "";
  if (mode === "onFocus") return " ds-card--synthetic-shadow-focus-only";
  return " ds-card--synthetic-noshadow";
}

function heroDataProps(synth: Synth): Record<string, string> {
  const hero = synth.heroImage && synth.heroImage.length > 0 ? resolveLocalImage(synth.heroImage) : null;
  return hero ? { "data-ds-hero-url": hero } : {};
}

function SyntheticImage({ synth }: { synth: Synth }) {
  const resolved = resolveLocalImage(synth.image as string);
  if (!resolved) return null;
  const fit = synth.placeholder ? "cover" : "contain";
  return (
    <img
      src={resolved}
      alt=""
      draggable={false}
      style={{ width: "100%", height: "100%", objectFit: fit, display: "block", pointerEvents: "none" }}
    />
  );
}

function SyntheticInner({ synth, cssW, cssH, radius }: { synth: Synth; cssW: string; cssH: string; radius: number | string }) {
  const innerBg: React.CSSProperties = synth.placeholder
    ? { background: "linear-gradient(313deg, rgba(51,51,51,0.55), rgba(85,85,85,0.55))" }
    : { background: "transparent" };
  return (
    <div
      className="ds-card-art ds-synthetic-card"
      style={{
        position: "absolute",
        inset: 0,
        width: cssW,
        height: cssH,
        overflow: "hidden",
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        color: "rgba(255,255,255,0.92)",
        ...innerBg,
      }}
    >
      {synth.image ? <SyntheticImage synth={synth} /> : synth.text ? (
        <span
          className="ds-synthetic-text"
          style={{
            font: "600 14px/1.3 'Motiva Sans', Helvetica, Arial, sans-serif",
            textAlign: "center",
            padding: "0 12px",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
          }}
        >
          {synth.text}
        </span>
      ) : null}
    </div>
  );
}

export function SyntheticCard({
  item,
  cardW = CARD_W,
  cardH = CARD_ART_H,
  featuredW,
}: {
  item: DeckRowItem;
  cardW?: number;
  cardH?: number;
  featuredW?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState("");
  const [, setImageTick] = useState(0);
  useEffect(() => subscribeLocalImage(() => setImageTick((n) => n + 1)), []);
  const platform = usePlatform();
  const synth = item.synthetic;

  useEffect(() => {
    return retryWithIntervals(() => {
      const cls = resolveNativeCardClass(getPreferredSteamDocument());
      if (cls === null) return false;
      setNativeCardClass(cls);
      return true;
    }, [250, 500, 800, 1200]);
  }, []);

  if (!synth) return null;

  const { hasContent, focusable, cssW, cssH, containerStyle } = syntheticFrame(synth, cardW, cardH, featuredW);
  const inner = <SyntheticInner synth={synth} cssW={cssW} cssH={cssH} radius={getCachedCardRadius()} />;
  const resolveShadowClass = () => shadowClassFor(synth, focusable);

  if (!focusable) {
    return (
      <div
        ref={cardRef as any}
        className={`ds-card ds-card--synthetic${resolveShadowClass()}${nativeCardClass ? ` ${nativeCardClass}` : ""}`}
        style={containerStyle}
        {...gapAttr(hasContent)}
      >
        {inner}
      </div>
    );
  }

  const handleActivate = () => {
    const link = synth.link;
    if (!link) return;
    try {
      if (link.type === "url") {
        openExternalUrl(String(link.value ?? "").trim());
      } else {
        const appid = Number(link.value);
        if (Number.isFinite(appid)) platform.navigateToApp(appid);
      }
    } catch {}
  };

  const handleMenu = () => {
    try {
      const shelfId = String(item.shelfId ?? "");
      if (!shelfId) return;
      showSyntheticCardMenu(shelfId, cardRef.current, synth?.text);
    } catch {}
  };
  const { shelfId, synthIndex, canPatchSynth } = synthTarget(item, synth);
  const handleRemove = () => {
    if (!shelfId || synthIndex < 0) return;
    try {
      const s = getCurrentSettings();
      if (!s) return;
      const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
      const list: any[] = Array.isArray(sh?.syntheticCards) ? sh.syntheticCards : [];
      if (synthIndex >= list.length) return;
      const next = list.filter((_, i) => i !== synthIndex);
      void saveSettings(patchShelfInSettings(s, shelfId, { syntheticCards: next.length ? next : undefined } as any));
    } catch {}
  };
  const handleToggleSize = () => {
    if (!shelfId || synthIndex < 0) return;
    try {
      const s = getCurrentSettings();
      if (!s) return;
      const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
      const list: any[] = Array.isArray(sh?.syntheticCards) ? sh.syntheticCards : [];
      if (synthIndex >= list.length) return;
      const next = list.map((c, i) => i === synthIndex
        ? { ...c, size: c?.size === "featured" ? "normal" : "featured" }
        : c);
      void saveSettings(patchShelfInSettings(s, shelfId, { syntheticCards: next } as any));
    } catch {}
  };

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card ds-card--synthetic${resolveShadowClass()}${nativeCardClass ? ` ${nativeCardClass}` : ""}`}
      focusClassName="gpfocus"
      onActivate={handleActivate}
      onOKButton={handleActivate}
      onMenuButton={handleMenu}
      onMenuActionDescription={i18n.t('card_options')}
      {...synthActions(canPatchSynth, handleRemove, handleToggleSize)}
      style={containerStyle}
      {...heroDataProps(synth)}
    >
      {inner}
    </Focusable>
  );
}
