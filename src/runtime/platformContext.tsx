import React, { createContext, useContext } from "react";
import type { PlatformApi } from "./platform";

let currentPlatform: PlatformApi | null = null;

const PlatformContext = createContext<PlatformApi | null>(null);

export function setPlatform(platform: PlatformApi) {
  currentPlatform = platform;
}

export function PlatformProvider({ platform, children }: { platform: PlatformApi; children: React.ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformApi {
  const ctx = useContext(PlatformContext);
  if (ctx) return ctx;
  if (currentPlatform) return currentPlatform;
  throw new Error("Deck Shelves platform was not configured.");
}
