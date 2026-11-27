import type { ResolverContext } from "./resolverContext";

// Online resolves take seconds, so serve the last result and refresh in the background once stale.
const ONLINE_SWR_TTL_MS = 600_000;
// An empty result (before login or network) goes stale after a minute, so the next resolve refreshes it.
const ONLINE_EMPTY_TTL_MS = 60_000;

type OnlineSwrEntry = { ts: number; ids: number[]; refreshing: boolean };

const onlineSwrCache = new Map<string, OnlineSwrEntry>();

export function invalidateOnlineResolveCache(): void {
  onlineSwrCache.clear();
}

function onlineSwrKey(type: string, ctx: ResolverContext): string {
  const o = ctx.options ?? {};
  return JSON.stringify([
    type, ctx.source, ctx.sort ?? null, ctx.sortReverse ?? null,
    ctx.overShootLimit, o.hiddenAppIds ?? null, o.dedupeByName ?? null,
  ]);
}

export function withOnlineSwr(type: string, inner: (ctx: ResolverContext) => Promise<number[]>) {
  return async (ctx: ResolverContext): Promise<number[]> => {
    const key = onlineSwrKey(type, ctx);
    const hit = onlineSwrCache.get(key);
    if (!hit) {
      const ids = await inner(ctx);
      onlineSwrCache.set(key, { ts: Date.now(), ids, refreshing: false });
      return ids;
    }
    const ttl = hit.ids.length ? ONLINE_SWR_TTL_MS : ONLINE_EMPTY_TTL_MS;
    if (Date.now() - hit.ts < ttl) return hit.ids;
    if (!hit.refreshing) {
      hit.refreshing = true;
      void inner(ctx)
        .then((ids) => { onlineSwrCache.set(key, { ts: Date.now(), ids, refreshing: false }); })
        .catch(() => { hit.refreshing = false; });
    }
    return hit.ids;
  };
}
