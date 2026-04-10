import { useEffect, useState, useRef } from "react";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { logInfo } from "../../runtime/logger";

function getHeroUrls(appid: number): string[] {
  return [
    `/customimages/${appid}_hero.png`,
    `/customimages/${appid}_hero.jpg`,
    `/assets/${appid}/library_hero.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
    `/assets/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  ];
}

/** Classes discovered from the native recents hero art DOM chain. */
type NativeHeroClasses = {
  imgClass: string;
  zoomContainerClass: string;  // parent of img — carries the 25s zoom animation
  wrapperClasses: string[];    // intermediate wrappers between outer container and zoom container
};

export function HeroBackground({ mountEl }: { mountEl: HTMLElement }) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const prevHero = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [nativeClasses, setNativeClasses] = useState<NativeHeroClasses | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const currentAppid = useRef(0);
  const allUrls = useRef<string[]>([]);

  // Discover native hero classes from the recents section
  useEffect(() => {
    const discover = () => {
      const doc = getPreferredSteamDocument();
      if (!doc) return;
      // The recents section is the sibling before our mount
      const prev = mountEl.previousElementSibling as HTMLElement | null;
      if (!prev) return;
      // Find the hero image — check by class count (native hero imgs have 4+ classes)
      // rather than dimensions, since recents may be hidden (height: 0)
      const imgs = Array.from(prev.querySelectorAll('img'));
      for (const img of imgs) {
        const classes = Array.from(img.classList);
        const r = img.getBoundingClientRect();
        // Either the image is large enough (recents visible) or has enough native classes (recents hidden)
        if ((r.width > 400 && r.height > 200) || classes.length >= 4) {
          const imgClass = Array.from(img.classList).join(' ');
          // Walk up: parent is the zoom container (25s animation), then intermediate wrappers
          const zoomContainer = img.parentElement;
          if (!zoomContainer) continue;
          const zoomContainerClass = Array.from(zoomContainer.classList).join(' ');
          // Collect intermediate wrappers up to the top-level Focusable
          const wrapperClasses: string[] = [];
          let el = zoomContainer.parentElement;
          for (let i = 0; i < 4 && el && el !== prev; i++) {
            if (el.classList.contains('Focusable') || el.classList.contains('Panel')) break;
            wrapperClasses.push(Array.from(el.classList).join(' '));
            el = el.parentElement;
          }
          setNativeClasses({ imgClass, zoomContainerClass, wrapperClasses });
          logInfo("HOME", "HeroBackground: native classes discovered", { imgClass: imgClass.substring(0, 40), zoomContainerClass: zoomContainerClass.substring(0, 40) });
          return;
        }
      }
    };
    discover();
    const t = setTimeout(discover, 2000);
    return () => clearTimeout(t);
  }, [mountEl]);

  useEffect(() => {
    const updateHero = () => {
      const firstShelf = mountEl.querySelector('.ds-shelf');
      if (!firstShelf) { return; }
      const focused = firstShelf.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      if (!focused) {
        // Keep previous hero when focus moves to non-card items (e.g., "view more").
        return;
      }
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      if (appid <= 0) {
        // Non-app items (more-link) — keep existing hero instead of clearing it
        return;
      }
      if (appid !== currentAppid.current) {
        // Save previous hero so we can restore it if the new app has no hero
        prevHero.current = heroUrl;
        currentAppid.current = appid;
        const urls = getHeroUrls(appid);
        allUrls.current = urls;
        fallbackIdx.current = 0;
        setHeroUrl(urls[0] ?? null);
        setVisible(true);
      } else {
        setVisible(true);
      }
    };

    const observer = new MutationObserver(updateHero);
    observer.observe(mountEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
    mountEl.addEventListener('focusin', updateHero);
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !mountEl.contains(related)) setVisible(false);
    };
    mountEl.addEventListener('focusout', onFocusOut);
    return () => {
      observer.disconnect();
      mountEl.removeEventListener('focusin', updateHero);
      mountEl.removeEventListener('focusout', onFocusOut);
    };
  }, [mountEl]);

  const onImgError = () => {
    fallbackIdx.current += 1;
    if (fallbackIdx.current < allUrls.current.length) {
      setHeroUrl(allUrls.current[fallbackIdx.current]);
    } else {
      // Restore previous hero if available instead of clearing the background.
      if (prevHero.current) {
        setHeroUrl(prevHero.current);
        setVisible(true);
      } else {
        setVisible(false);
      }
    }
  };

  if (!heroUrl) return null;

  // Replicate the native DOM structure so theme CSS rules match:
  // outer (clip) > wrappers > zoomContainer (25s zoom anim) > img (grayscale, fade-in anim)
  const wrappers = nativeClasses?.wrapperClasses ?? [];

  let inner = (
    <div
      className={nativeClasses?.zoomContainerClass || undefined}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      <img
        ref={imgRef}
        className={nativeClasses?.imgClass || undefined}
        src={heroUrl}
        onError={onImgError}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "50% 50%",
          display: "block",
        }}
        loading="eager"
      />
    </div>
  );

  // Wrap in intermediate containers (native has 2-3 wrappers with absolute positioning)
  for (let i = wrappers.length - 1; i >= 0; i--) {
    inner = (
      <div
        className={wrappers[i] || undefined}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className="ds-hero-background"
      style={{
        position: "absolute",
        top: -60,
        left: 0,
        right: 0,
        height: 420,
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
      }}
    >
      {inner}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "70%",
        background: "linear-gradient(to top, rgba(14,16,18,0.98) 0%, rgba(14,16,18,0) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      }} />
    </div>
  );
}
