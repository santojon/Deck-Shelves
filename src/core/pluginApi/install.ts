import { makeApi } from "./surface";
import {
  shelfSources, contextAwareShelfSources, smartSources, filterTypes, sortOptions, importTypes,
  searchProviders, sideMenuProviders, contextProviders, widgetProviders, shelfRenderers,
  metadataProviders, statisticsProviders, recommendationProviders, exportHandlers, importHandlers,
} from "./registries";
import * as focusTracker from "../focusedCardTracker";
import type { DeckShelvesIntegration, DeckShelvesPublicAPI, Unsubscribe } from "@deck-shelves/api";

export const READY_EVENT = "deck-shelves:ready";
export const TEARDOWN_EVENT = "deck-shelves:teardown";

const PENDING_KEY = Symbol.for("deck-shelves/pending");
type PendingEntry = {
  integration: DeckShelvesIntegration;
  unsub?: Unsubscribe;
  cancelled?: boolean;
};

function drainPendingIntegrations(api: DeckShelvesPublicAPI, register: (i: DeckShelvesIntegration) => Unsubscribe): Unsubscribe[] {
  const queue = (globalThis as unknown as Record<symbol, unknown>)[PENDING_KEY];
  const offs: Unsubscribe[] = [];
  if (!Array.isArray(queue)) return offs;
  while (queue.length) {
    const entry = queue.shift() as PendingEntry;
    if (entry.cancelled) continue;
    try { entry.unsub = register(entry.integration); offs.push(entry.unsub); } catch {}
  }
  void api;
  return offs;
}

// Indirect binding avoids an import cycle with the internal registry.
let internalBootstrap: (() => () => void) | null = null;
export function setInternalBootstrap(fn: () => () => void): void { internalBootstrap = fn; }

export function installPluginApi(): () => void {
  const api = makeApi();
  const uninstallInternals = internalBootstrap ? internalBootstrap() : () => {};

  const integrationUnsubs: Unsubscribe[] = [];
  const teardownFns: Array<() => void | Promise<void>> = [];

  // A queued plugin can arrive twice (the queue drain and its own ready event).
  const registered = new Map<DeckShelvesIntegration, Unsubscribe>();
  const register = (integration: DeckShelvesIntegration): Unsubscribe => {
    const existing = registered.get(integration);
    if (existing) return existing;
    let unmountFired = false;
    void Promise.resolve()
      .then(() => integration.onMount(api))
      .catch(() => {});
    const unsub: Unsubscribe = () => {
      if (unmountFired) return;
      unmountFired = true;
      registered.delete(integration);
      try {
        const r = integration.onUnmount?.();
        if (r) void Promise.resolve(r).catch(() => {});
      } catch {}
    };
    registered.set(integration, unsub);
    // Teardown goes through the same guarded unsubscribe, so onUnmount runs once.
    if (integration.onUnmount) teardownFns.push(unsub);
    return unsub;
  };

  const deckShelves = {
    version: api.version,
    api,
    register,
  };
  try { (window as unknown as { deckShelves: typeof deckShelves }).deckShelves = deckShelves; } catch {}

  for (const u of drainPendingIntegrations(api, register)) integrationUnsubs.push(u);

  try { window.dispatchEvent(new CustomEvent(READY_EVENT)); } catch {}

  return () => {
    try { window.dispatchEvent(new CustomEvent(TEARDOWN_EVENT)); } catch {}
    for (const fn of teardownFns) { try { void fn(); } catch {} }
    for (const u of integrationUnsubs) { try { u(); } catch {} }
    try { delete (window as unknown as Record<string, unknown>).deckShelves; } catch {}
    try { uninstallInternals(); } catch {}
    try { focusTracker.uninstallFocusedCardTracker(); } catch {}
    shelfSources.clear();
    contextAwareShelfSources.clear();
    smartSources.clear();
    filterTypes.clear();
    sortOptions.clear();
    importTypes.clear();
    searchProviders.clear();
    sideMenuProviders.clear();
    contextProviders.clear();
    widgetProviders.clear();
    shelfRenderers.clear();
    metadataProviders.clear();
    statisticsProviders.clear();
    recommendationProviders.clear();
    exportHandlers.clear();
    importHandlers.clear();
  };
}
