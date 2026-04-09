import { useEffect, useRef, useState } from "react";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";

export function PlaceholderCard({ item, cardW = CARD_W, cardH = CARD_ART_H, featured = false }: { item: DeckRowItem; cardW?: number; cardH?: number; featured?: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    function injectNativeClasses(): boolean {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map?.nativeCard) return false;
      const sampleSelector = buildSelectorFromToken(map.nativeCard);
      const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
      if (nativeSample) {
        const rootClasses = Array.from(nativeSample.classList).filter((cls) => (
          cls !== 'Panel' && cls !== 'Focusable' && cls !== 'gpfocus' && cls !== 'gpfocuswithin' && !cls.startsWith('ds-')
        ));
        if (!rootClasses.includes('gpfocuswithin')) rootClasses.push('gpfocuswithin');
        setNativeCardClass(rootClasses.join(' '));
      } else {
        setNativeCardClass([map.nativeCard, map.nativeCardMods].filter(Boolean).join(' '));
      }
      return true;
    }
    let attempts = 0;
    const intervals = [250, 500, 800, 1200];
    let timer: number | null = null;
    const tryInject = () => {
      attempts += 1;
      if (!injectNativeClasses() && attempts < intervals.length) {
        timer = window.setTimeout(tryInject, intervals[attempts - 1]);
      }
    };
    tryInject();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  const cachedCardRadius = getCachedCardRadius();

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${featured ? ' ds-card--featured' : ''}${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
      focusClassName="gpfocus"
      role="listitem"
      onActivate={item.onActivate}
      onOKButton={item.onActivate}
      onMenuButton={item.onMenuButton}
      onContextMenu={item.onMenuButton}
      data-appid={item.appid || undefined}
      data-shelfid={item.shelfId || undefined}
      style={{
        position: "relative",
        width: cardW,
        minWidth: cardW,
        height: cardH,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "pointer",
        overflow: "visible",
      }}
    >
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
          borderRadius: cachedCardRadius,
        }}
      >
        <span style={{
          fontSize: featured ? 14 : 11,
          opacity: 0.5,
          textAlign: "center",
          wordBreak: "break-word",
          lineHeight: 1.3,
        }}>
          {item.name}
        </span>
      </div>
    </Focusable>
  );
}
