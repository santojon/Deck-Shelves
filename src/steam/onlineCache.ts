import type { ResolverContext } from "./resolverContext";

/* Stale-while-revalidate cache for online shelf results (wishlist and store). */

/* Online (wishlist/store) resolves are network calls — measured ~3.7 s p90 on
   real hardware — and the home re-resolves every shelf on every rebuild, so
   reading them live made each return to the home wait seconds, and blow the
   child timeout, leaving the shelf empty. */
/* Serve the last result immediately and refresh in the background once it goes
   stale: the home never waits on the network, and the following resolve already
   has fresh data. No new timer — the refresh rides resolves that happen anyway. */
const ONLINE_SWR_TTL_MS = 600_000;

type OnlineSwrEntry = { ts: number; ids: number[]; refreshing: boolean };

const onlineSwrCache = new Map<string, OnlineSwrEntry>();

/** Drop cached online resolves (manual refresh / cache management). */
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
