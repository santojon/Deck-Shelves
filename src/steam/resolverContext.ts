import type { AppOverview } from "./appOverview";
import type { ShelfSource } from "../types";

// Variant fields are read before narrowing, hence the index signature.
export type LooseSource = ShelfSource & Record<string, any>;

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
  reportTotal?: (n: number) => void;
};
