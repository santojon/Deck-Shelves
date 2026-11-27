import { steamLocalization } from "./internals";

// Strings come from Steam's own tokens, so no translations are kept here.
export const STEAM_TEXT = {
  // The beta client shows the current-game row there in Big Art mode.
  recentGames: ["#LibraryHome_RecentGames", "#Showcase_RecentGames", "#Showcase_CurrentGame"],
  homeTabs: ["#HomeTab_WhatsNew", "#HomeTab_Friends", "#HomeTab_Recommended"],
  closeButton: ["#Button_Close", "#Generic_Close", "#Button_Cancel"],
  sdCard: ["#ContentManagement_ExternalMicroSD", "#Settings_System_SDCard"],
} as const;

export type SteamTextName = keyof typeof STEAM_TEXT;
export type TextMatch = "exact" | "contains";
export type TextLanguage = "both" | "user" | "english";

type TokenStrings = { user: string | null; english: string | null };
const tokens = new Map<string, TokenStrings>();
const names = new Map<string, string[]>();

export const STORE_CATEGORY_TOKENS: Record<number, string> = {
  2: "#AppDetails_Feature_SinglePlayer",
  1: "#AppDetails_Feature_MultiPlayer",
  9: "#AppDetails_Feature_CoOp",
  22: "#AppDetails_Feature_SteamAchievements",
  23: "#AppDetails_Feature_SteamCloud",
  28: "#AppDetails_Feature_FullController",
  18: "#AppDetails_Feature_PartialController",
  30: "#AppDetails_Feature_SteamWorkshop",
  31: "#AppDetails_Feature_VRSupport",
  44: "#AppDetails_Feature_RemotePlayTogether",
  61: "#AppDetails_Feature_HDR",
};

// An unknown token comes back as null (or as the token itself on some clients).
function readRaw(fn: unknown, owner: unknown, token: string): string | null {
  try {
    const text = typeof fn === "function" ? fn.call(owner, token) : null;
    return typeof text === "string" && text.trim() && !text.startsWith("#") ? text.trim() : null;
  } catch { return null; }
}

function read(fn: unknown, owner: unknown, token: string): string | null {
  return readRaw(fn, owner, token)?.toLowerCase() ?? null;
}

export function steamLabel(token: string): string | null {
  const lm = steamLocalization();
  return readRaw(lm?.LocalizeString, lm, token) ?? readRaw(lm?.LocalizeStringFromFallback, lm, token);
}

function stringsOf(token: string): TokenStrings {
  const hit = tokens.get(token);
  if (hit) return hit;
  const lm = steamLocalization();
  const found = { user: read(lm?.LocalizeString, lm, token), english: read(lm?.LocalizeStringFromFallback, lm, token) };
  if (found.user || found.english) tokens.set(token, found);
  return found;
}

function addStrings(out: Set<string>, found: TokenStrings, language: TextLanguage): void {
  if (found.user && language !== "english") out.add(found.user);
  if (found.english && language !== "user") out.add(found.english);
}

export function steamText(name: SteamTextName, language: TextLanguage = "both"): string[] {
  const key = `${name}:${language}`;
  const hit = names.get(key);
  if (hit) return hit;
  const out = new Set<string>();
  let complete = true;
  for (const token of STEAM_TEXT[name]) {
    const found = stringsOf(token);
    if (!found.user && !found.english) complete = false;
    addStrings(out, found, language);
  }
  const list = [...out];
  if (complete) names.set(key, list);
  return list;
}

export function matchesSteamText(text: string, name: SteamTextName, match: TextMatch): boolean {
  const value = text.trim().toLowerCase();
  return steamText(name).some((s) => (match === "exact" ? value === s : value.includes(s)));
}

export function steamTextSelectors(name: SteamTextName, attr: string, match: TextMatch, suffix = "", language: TextLanguage = "both"): string[] {
  const op = match === "exact" ? "=" : "*=";
  return steamText(name, language).map((s) => `[${attr}${op}"${s.replace(/["\\]/g, "\\$&")}" i]${suffix}`);
}

export function __resetSteamTextForTest(): void { tokens.clear(); names.clear(); }
