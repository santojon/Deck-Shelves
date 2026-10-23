import type { AppOverview } from "./appOverview";
import type { ShelfSource } from "../types";

/* The shapes every per-source resolver shares: the loose source it reads and
   the context the dispatcher hands it. */

/* A shelf source as the resolvers read it: dispatched on `type`, the variant fields
   (`collectionId`, `tab`, `sources`, …) are read before narrowing, so the index
   signature keeps those reads untyped while the shared fields stay typed. */
export type LooseSource = ShelfSource & Record<string, any>;

// Shared context passed to each per-source resolver.
export type ResolverContext = {
  source: LooseSource;
  limit: number;
  sort?: string | string[];
  shelfId?: string;
  sortReverse?: boolean | boolean[];
  options?: { hiddenAppIds?: number[]; dedupeByName?: boolean; onResolveTotal?: (n: number) => void };
  depth: number;
  all: AppOverview[];
  overShootLimit: number;
  finish: (ids: number[]) => number[];
  // Reports the pre-limit match count so callers can decide whether a
  // "See more" affordance is warranted (only some resolvers report it).
  reportTotal?: (n: number) => void;
};
