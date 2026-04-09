import { useEffect, useRef, useState } from "react";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";

export function MoreCard({ item, cardW = CARD_W, cardH = CARD_ART_H }: { item: DeckRowItem; cardW?: number; cardH?: number }) {
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
          cls !== 'Panel'
          && cls !== 'Focusable'
          && cls !== 'gpfocus'
          && cls !== 'gpfocuswithin'
          && !cls.startsWith('ds-')
        ));
        if (!rootClasses.includes('gpfocuswithin')) rootClasses.push('gpfocuswithin');
        setNativeCardClass(rootClasses.join(' '));
        try {
          const pa = getComputedStyle(nativeSample, '::after');
          const animName = (pa.animationName || '').split(',')[0] || '';
          if (animName && animName !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', animName);
        } catch (e) {
          logInfo("HOME", "MoreCard: animation read failed", String(e));
        }
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
      const ok = injectNativeClasses();
      if (!ok && attempts < intervals.length) {
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
      className={`ds-card${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
      focusClassName="gpfocus"
      onActivate={item.onActivate}
      onOKButton={item.onActivate}
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
          position: "absolute",
          inset: 0,
          width: cardW,
          height: cardH,
          overflow: "hidden",
          background: "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
          borderRadius: cachedCardRadius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <span className="ds-more-card-text">{item.name}</span>
      </div>
    </Focusable>
  );
}
