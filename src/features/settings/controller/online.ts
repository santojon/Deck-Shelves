import type { Settings } from "../../../types";

export interface OnlineDeps {
  liveSettings: () => Settings | null;
  persist: (next: Settings) => Promise<boolean>;
}

export function createOnlineActions(deps: OnlineDeps) {
  const { liveSettings, persist } = deps;
  return {
    async setOnlineFeaturesEnabled(onlineFeaturesEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s.onlineFeaturesEnabled ?? false) === onlineFeaturesEnabled) return;
      await persist({ ...s, onlineFeaturesEnabled });
    },
    async setOnlineWishlistEnabled(onlineWishlistEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s.onlineWishlistEnabled ?? true) === onlineWishlistEnabled) return;
      await persist({ ...s, onlineWishlistEnabled });
    },
    async setOnlineMetadataEnabled(onlineMetadataEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s.onlineMetadataEnabled ?? false) === onlineMetadataEnabled) return;
      await persist({ ...s, onlineMetadataEnabled });
    },
    async setOnlineHideOwnedGames(onlineHideOwnedGames: boolean) {
      const s = liveSettings();
      if (!s || (s.onlineHideOwnedGames ?? false) === onlineHideOwnedGames) return;
      await persist({ ...s, onlineHideOwnedGames });
    },
    async setOnlineHideOwnedNonSteam(onlineHideOwnedNonSteam: boolean) {
      const s = liveSettings();
      if (!s || (s.onlineHideOwnedNonSteam ?? false) === onlineHideOwnedNonSteam) return;
      await persist({ ...s, onlineHideOwnedNonSteam });
    },
    async setOnlineHideOwnedNonSteamCloud(onlineHideOwnedNonSteamCloud: boolean) {
      const s = liveSettings();
      if (!s || (s.onlineHideOwnedNonSteamCloud ?? false) === onlineHideOwnedNonSteamCloud) return;
      await persist({ ...s, onlineHideOwnedNonSteamCloud });
    },
    async setOnlinePriceSortEnabled(onlinePriceSortEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s.onlinePriceSortEnabled ?? true) === onlinePriceSortEnabled) return;
      await persist({ ...s, onlinePriceSortEnabled });
    },
    async acceptOnlinePrivacy() {
      const s = liveSettings();
      if (!s || s.onlinePrivacyAccepted) return;
      await persist({ ...s, onlinePrivacyAccepted: true });
    },
  };
}
