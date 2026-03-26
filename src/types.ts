import { z } from "zod";

export const FilterSchema = z.object({
  favorites: z.boolean().optional(),
  hidden: z.union([z.boolean(), z.literal("only")]).optional(),
  nonSteam: z.boolean().optional(),
  installed: z.boolean().optional(),
  playedWithinDays: z.number().int().positive().optional(),
  nameIncludes: z.string().optional(),
  nameRegex: z.string().optional(),
  deckCompatibility: z.array(z.enum(["verified", "playable", "unsupported", "unknown"])).optional(),
  sort: z.enum(["alphabetical", "recent", "playtime"]).optional(),
  minPlaytimeMinutes: z.number().int().min(0).optional(),
  maxPlaytimeMinutes: z.number().int().min(0).optional(),
  updatePending: z.boolean().optional(),
}).passthrough();

export const ShelfSourceSchema = z.union([
  z.object({ type: z.literal("collection"), collectionId: z.string() }),
  z.object({ type: z.literal("tab"), tab: z.string().min(1) }),
  z.object({ type: z.literal("filter"), filter: FilterSchema.default({}) })
]);

export type ShelfSource = z.infer<typeof ShelfSourceSchema>;
export type ShelfFilter = z.infer<typeof FilterSchema>;

export const ShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(15),
  source: ShelfSourceSchema
});

export type Shelf = z.infer<typeof ShelfSchema>;

export const SettingsSchema = z.object({
  enabled: z.boolean().default(true),
  shelves: z.array(ShelfSchema).default([])
});

export type Settings = z.infer<typeof SettingsSchema>;
