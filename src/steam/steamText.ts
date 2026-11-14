import { steamLocalization } from "./internals";

/* Steam's own UI text, by name. Each name covers one piece of Steam's UI and
   lists the localization tokens Steam shows it with; the strings come from
   Steam itself (the user's language and English), so no translation is kept
   here. To match a new piece of Steam's UI, add its tokens under a new name:
   LocalizationManager's token tables hold them, found by the text Steam shows. */
export const STEAM_TEXT = {
  // The native row the mount goes after on Home: the recents row, or the
  // current-game row that the beta client shows there in Big Art mode.
  recentGames: ["#LibraryHome_RecentGames", "#Showcase_RecentGames", "#Showcase_CurrentGame"],
  // The native Home tab chips the plugin can hide.
  homeTabs: ["#HomeTab_WhatsNew", "#HomeTab_Friends", "#HomeTab_Recommended"],
  // The close or cancel button of Steam's modals and overlays.
  closeButton: ["#Button_Close", "#Generic_Close", "#Button_Cancel"],
} as const;

export type SteamTextName = keyof typeof STEAM_TEXT;
// "exact": the whole text is one of Steam's strings; "contains": it holds one.
export type TextMatch = "exact" | "contains";
export type TextLanguage = "both" | "user" | "english";

type TokenStrings = { user: string | null; english: string | null };
const tokens = new Map<string, TokenStrings>();
const names = new Map<string, string[]>();

/* Steam's names for the store categories the editor offers: the features Steam lists on
   an app's page, by category id. The ids are Steam's own; the text comes from its tokens. */
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

/** Steam's own string for a token as it shows it, in the user's language or English; null when unknown. */
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

// Steam's strings for a name, lower-cased: the user's language, then English.
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

// One `[attr="…" i]` (or `*=`) selector per string, each followed by `suffix`.
export function steamTextSelectors(name: SteamTextName, attr: string, match: TextMatch, suffix = "", language: TextLanguage = "both"): string[] {
  const op = match === "exact" ? "=" : "*=";
  return steamText(name, language).map((s) => `[${attr}${op}"${s.replace(/["\\]/g, "\\$&")}" i]${suffix}`);
}

export function __resetSteamTextForTest(): void { tokens.clear(); names.clear(); }
