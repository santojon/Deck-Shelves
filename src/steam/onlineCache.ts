import type { ResolverContext } from "./resolverContext";

// Online resolves take seconds, so serve the last result and refresh in the background once stale.
const ONLINE_SWR_TTL_MS = 600_000;

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
    if (Date.now() - hit.ts < ONLINE_SWR_TTL_MS) return hit.ids;
    if (!hit.refreshing) {
      hit.refreshing = true;
      void inner(ctx)
        .then((ids) => { onlineSwrCache.set(key, { ts: Date.now(), ids, refreshing: false }); })
        .catch(() => { hit.refreshing = false; });
    }
    return hit.ids;
  };
}
