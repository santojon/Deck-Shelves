/**
 * Public inter-plugin API for Deck Shelves.
 *
 * External plugins can register custom shelf sources via:
 *   window.__DECK_SHELVES_API__.registerShelfSource(descriptor)
 *
 * The returned cleanup function must be called on plugin dismount.
 *
 * Source type "external" in shelf config is persisted as:
 *   { type: "external", sourceId: string }
 */

export type ExternalShelfSourceDescriptor = {
  /** Unique ID for this source — must be stable across reloads */
  id: string;
  /** Human-readable name shown in the QAM source dropdown */
  displayName: string;
  /** Called whenever Deck Shelves needs to refresh shelf contents */
  resolve: (limit: number) => Promise<number[]>;
};

export interface DeckShelvesPublicAPI {
  readonly version: number;
  registerShelfSource(descriptor: ExternalShelfSourceDescriptor): () => void;
  getRegisteredSources(): ExternalShelfSourceDescriptor[];
}

const registry = new Map<string, ExternalShelfSourceDescriptor>();

function makeApi(): DeckShelvesPublicAPI {
  return {
    version: 1,
    registerShelfSource(descriptor: ExternalShelfSourceDescriptor): () => void {
      registry.set(descriptor.id, descriptor);
      return () => { registry.delete(descriptor.id); };
    },
    getRegisteredSources(): ExternalShelfSourceDescriptor[] {
      return Array.from(registry.values());
    },
  };
}

export function installPluginApi(): () => void {
  const api = makeApi();
  try { (window as any).__DECK_SHELVES_API__ = api; } catch {}
  return () => {
    try { delete (window as any).__DECK_SHELVES_API__; } catch {}
    registry.clear();
  };
}

export function resolveExternalSource(sourceId: string, limit: number): Promise<number[]> {
  const src = registry.get(sourceId);
  if (!src) return Promise.resolve([]);
  return src.resolve(limit).catch(() => []);
}

export function getExternalSources(): ExternalShelfSourceDescriptor[] {
  return Array.from(registry.values());
}
