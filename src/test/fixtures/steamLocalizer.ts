import { vi } from "vitest";
import { __resetSteamTextForTest } from "../../steam/steamText";

/* Steam's localizer as tests see it: strings by token, as the live client's
   English and Brazilian Portuguese tables return them. Real Steam always has
   one; the plugin reads its rows and tabs through it (steam/steamText.ts). */
export const STEAM_EN: Record<string, string> = {
  "#LibraryHome_RecentGames": "Recent Games", "#Showcase_RecentGames": "Recent Games",
  "#HomeTab_WhatsNew": "What's New", "#HomeTab_Friends": "Friends", "#HomeTab_Recommended": "Recommended",
  "#Button_Close": "Close", "#Generic_Close": "Close", "#Button_Cancel": "Cancel",
};

export const STEAM_PT_BR: Record<string, string> = {
  "#LibraryHome_RecentGames": "Jogos recentes", "#Showcase_RecentGames": "Jogos recentes",
  "#HomeTab_WhatsNew": "Novidades", "#HomeTab_Friends": "Amigos", "#HomeTab_Recommended": "Recomendados",
  "#Button_Close": "Fechar", "#Generic_Close": "Fechar", "#Button_Cancel": "Cancelar",
};

// Steam's LocalizationManager with `user` strings; English comes from its fallback table.
export function stubSteamLocalizer(user: Record<string, string> = STEAM_EN, english: Record<string, string> = STEAM_EN): void {
  __resetSteamTextForTest();
  vi.stubGlobal("LocalizationManager", {
    LocalizeString: (token: string) => user[token] ?? null,
    LocalizeStringFromFallback: (token: string) => english[token] ?? null,
  });
}

// Removes the stub (and any other stubbed global) and forgets cached strings.
export function clearSteamLocalizer(): void {
  vi.unstubAllGlobals();
  __resetSteamTextForTest();
}
