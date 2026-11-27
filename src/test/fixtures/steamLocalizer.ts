import { vi } from "vitest";
import { __resetSteamTextForTest } from "../../steam/steamText";

export const STEAM_EN: Record<string, string> = {
  "#LibraryHome_RecentGames": "Recent Games", "#Showcase_RecentGames": "Recent Games", "#Showcase_CurrentGame": "Current Game",
  "#HomeTab_WhatsNew": "What's New", "#HomeTab_Friends": "Friends", "#HomeTab_Recommended": "Recommended",
  "#Button_Close": "Close", "#Generic_Close": "Close", "#Button_Cancel": "Cancel",
  "#ContentManagement_ExternalMicroSD": "MicroSD Card", "#Settings_System_SDCard": "SD Card",
};

export const STEAM_PT_BR: Record<string, string> = {
  "#LibraryHome_RecentGames": "Jogos recentes", "#Showcase_RecentGames": "Jogos recentes", "#Showcase_CurrentGame": "Jogo atual",
  "#HomeTab_WhatsNew": "Novidades", "#HomeTab_Friends": "Amigos", "#HomeTab_Recommended": "Recomendados",
  "#Button_Close": "Fechar", "#Generic_Close": "Fechar", "#Button_Cancel": "Cancelar",
  "#ContentManagement_ExternalMicroSD": "Cartão microSD", "#Settings_System_SDCard": "Cartão SD",
};

export function stubSteamLocalizer(user: Record<string, string> = STEAM_EN, english: Record<string, string> = STEAM_EN): void {
  __resetSteamTextForTest();
  vi.stubGlobal("LocalizationManager", {
    LocalizeString: (token: string) => user[token] ?? null,
    LocalizeStringFromFallback: (token: string) => english[token] ?? null,
  });
}

export function clearSteamLocalizer(): void {
  vi.unstubAllGlobals();
  __resetSteamTextForTest();
}
