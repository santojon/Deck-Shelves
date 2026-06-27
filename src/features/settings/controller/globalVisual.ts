import type { Settings } from "../../../types";

export interface GlobalVisualDeps {
  liveSettings: () => Settings | null;
  persist: (next: Settings) => Promise<boolean>;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

export function createGlobalVisualActions(deps: GlobalVisualDeps) {
  const { liveSettings, persist } = deps;
  const setBool = async (key: keyof Settings, value: boolean) => {
    const s = liveSettings();
    if (!s || (s as any)[key] === value) return;
    await persist({ ...s, [key]: value } as any);
  };
  const setEnum = async <T extends string>(key: string, value: T) => {
    const s = liveSettings();
    if (!s || (s as any)[key] === value) return;
    await persist({ ...s, [key]: value } as any);
  };
  const setClampedNumber = async (key: string, value: number, min: number, max: number) => {
    const s = liveSettings();
    const c = clamp(value, min, max);
    if (!s || (s as any)[key] === c) return;
    await persist({ ...s, [key]: c } as any);
  };
  return {
    setGlobalHeroEnabled: (v: boolean) => setBool("globalHeroEnabled" as any, v),
    setGlobalGameInfoAbove: (v: boolean) => setBool("globalGameInfoAbove" as any, v),
    setGlobalFriendsPlayingOverlay: (v: boolean) => setBool("globalFriendsPlayingOverlay" as any, v),
    setGlobalFriendsPlayingOverlayRecent: (v: boolean) => setBool("globalFriendsPlayingOverlayRecent" as any, v),
    setGlobalMatchNativeSize: (v: boolean) => setBool("globalMatchNativeSize", v),
    setGlobalHideStatusLine: (v: boolean) => setBool("globalHideStatusLine", v),
    setGlobalHideShelfTitle: (v: boolean) => setBool("globalHideShelfTitle", v),
    setGlobalHideGameNames: (v: boolean) => setBool("globalHideGameNames", v),
    setGlobalHideInstallIndicator: (v: boolean) => setBool("globalHideInstallIndicator", v),
    setGlobalHighlightFirst: (v: boolean) => setBool("globalHighlightFirst", v),
    setGlobalHighlightAll: (v: boolean) => setBool("globalHighlightAll", v),
    setGlobalHighlightRandom: (v: boolean) => setBool("globalHighlightRandom" as any, v),
    setGlobalEnableLogo: (v: boolean) => setBool("globalEnableLogo" as any, v),
    setGlobalEnableIcon: (v: boolean) => setBool("globalEnableIcon" as any, v),
    setGlobalEnableDescription: (v: boolean) => setBool("globalEnableDescription" as any, v),
    setGlobalDescriptionBelowLogo: (v: boolean) => setBool("globalDescriptionBelowLogo" as any, v),
    setGlobalLogoBelowShelf: (v: boolean) => setBool("globalLogoBelowShelf" as any, v),
    setGlobalLogoPosition: (v: "left" | "center" | "right") => setEnum("globalLogoPosition", v),
    setGlobalDescriptionPosition: (v: "left" | "center" | "right") => setEnum("globalDescriptionPosition", v),
    setGlobalLogoSize: (v: number) => setClampedNumber("globalLogoSize", v, 50, 200),
    setGlobalLogoTopOffset: (v: number) => setClampedNumber("globalLogoTopOffset", v, -50, 100),
    setGlobalFullPageShelf: (v: boolean) => setBool("globalFullPageShelf" as any, v),
    setGlobalIconVerticalAlign: (v: "top" | "center" | "bottom") => setEnum("globalIconVerticalAlign", v),
    setGlobalShelfTitlePosition: (v: "left" | "center" | "right") => setEnum("globalShelfTitlePosition", v),
    setGlobalGameNamePosition: (v: "left" | "center" | "right") => setEnum("globalGameNamePosition", v),
    setGlobalPlaytimePosition: (v: "left" | "center" | "right") => setEnum("globalPlaytimePosition", v),
    setGlobalDescriptionHeight: (v: number) => setClampedNumber("globalDescriptionHeight", v, 1, 3),
    setGlobalDescriptionLogoGap: (v: number) => setClampedNumber("globalDescriptionLogoGap", v, -40, 80),
    setGlobalHideNewBadge: (v: boolean) => setBool("globalHideNewBadge", v),
    setGlobalHideDiscountBadge: (v: boolean) => setBool("globalHideDiscountBadge" as any, v),
    setGlobalHideCompatIcons: (v: boolean) => setBool("globalHideCompatIcons", v),
    setGlobalHideSeeMore: (v: boolean) => setBool("globalHideSeeMore", v),
    setGlobalHideRefreshCard: (v: boolean) => setBool("globalHideRefreshCard", v),
    setGlobalHideNonSteamBadge: (v: boolean) => setBool("globalHideNonSteamBadge", v),
    setGlobalDedupeByName: (v: boolean) => setBool("globalDedupeByName" as any, v),
  };
}
