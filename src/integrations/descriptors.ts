import { isTabMasterInstalled, isUnifiDeckInstalled, isNonSteamBadgesInstalled } from "./registry";

type IntegrationCapability = "tabs" | "badges";

export type IntegrationDescriptor = {
  id: "tabmaster" | "unifideck" | "nonsteambadges";
  label: string;
  provides: readonly IntegrationCapability[];
  isInstalled: () => boolean;
};

export const INTEGRATIONS: readonly IntegrationDescriptor[] = [
  { id: "tabmaster", label: "TabMaster", provides: ["tabs"], isInstalled: isTabMasterInstalled },
  { id: "unifideck", label: "UnifiDeck", provides: ["tabs"], isInstalled: isUnifiDeckInstalled },
  { id: "nonsteambadges", label: "Non-Steam Badges", provides: ["badges"], isInstalled: isNonSteamBadgesInstalled },
];

function safeInstalled(i: IntegrationDescriptor): boolean {
  try { return i.isInstalled(); } catch { return false; }
}

export function installedIntegrations(): IntegrationDescriptor[] {
  return INTEGRATIONS.filter(safeInstalled);
}

export function integrationsProviding(cap: IntegrationCapability): IntegrationDescriptor[] {
  return INTEGRATIONS.filter((i) => i.provides.includes(cap));
}

export function integrationPresence(): Record<IntegrationDescriptor["id"], boolean> {
  const out = {} as Record<IntegrationDescriptor["id"], boolean>;
  for (const i of INTEGRATIONS) out[i.id] = safeInstalled(i);
  return out;
}
