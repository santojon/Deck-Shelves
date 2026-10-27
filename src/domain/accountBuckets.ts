import type { Settings } from "../types";
import { defaultSettings } from "./defaults";

/* Settings per Steam account. The top level always holds one account's settings (the
   owner's), so an older version, a neutral host and a downgrade still read a plain
   document. The other accounts' own fields wait in `accountSettings.buckets`, under the
   salted key the account watch uses (the salt is never in the settings file, so the
   file cannot lead back to an account). */

// What belongs to an account: what its shelves and lists are made of. Everything
// else (look, behaviour, device fields) stays with the device.
export const ACCOUNT_FIELDS = [
  "shelves", "smartShelves", "allShelvesOrder", "savedFilters", "savedSmartFilters",
  "profiles", "activeProfileName", "syncTombstones", "showcaseShelfIds",
] as const;

// The settings that were on the device before they were kept per account, when
// the first account seen chose to start fresh.
export const LEGACY_BUCKET = "legacy";

export interface AccountSettings {
  mode?: "shared";
  owner?: string;
  buckets?: Record<string, Record<string, unknown>>;
}

export type AccountDecision = "none" | "assign" | "restore" | "ask-legacy" | "ask-new";
export type AccountChoice = "keep" | "fresh";

export function accountSettingsOf(s: Settings | null): AccountSettings {
  const raw = (s as any)?.accountSettings;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as AccountSettings : {};
}

export function isPerAccount(s: Settings | null): boolean {
  return accountSettingsOf(s).mode !== "shared";
}

export function otherAccountCount(s: Settings | null): number {
  const acc = accountSettingsOf(s);
  return Object.keys(acc.buckets ?? {}).filter((k) => k !== acc.owner).length;
}

/* What to do when `key` is signed in. `previous` is the account this device last
   saw before this start (from the account watch), if any. */
export function decideAccount(s: Settings | null, key: string, previous: string | undefined): AccountDecision {
  if (!s || !isPerAccount(s)) return "none";
  const acc = accountSettingsOf(s);
  if (acc.owner === key) return "none";
  // Settings from before they were kept per account: take them only when this
  // device was last used by this same account, else ask (they may be another's).
  if (!acc.owner) return previous === key ? "assign" : "ask-legacy";
  return acc.buckets?.[key] ? "restore" : "ask-new";
}

function pick(s: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of ACCOUNT_FIELDS) if ((s as any)[f] !== undefined) out[f] = (s as any)[f];
  return out;
}

function fill(s: Settings, fields: Record<string, unknown> | null): Settings {
  const blank = defaultSettings() as any;
  const next: any = { ...s };
  for (const f of ACCOUNT_FIELDS) next[f] = fields && f in fields ? fields[f] : blank[f];
  return next as Settings;
}

function withAccount(s: Settings, acc: AccountSettings): Settings {
  return { ...(s as any), accountSettings: acc } as Settings;
}

export function assignOwner(s: Settings, key: string): Settings {
  return withAccount(s, { ...accountSettingsOf(s), owner: key });
}

/* `key` signs in and its own settings are waiting: the owner's settings go to its
   bucket, and `key`'s come out of theirs. */
export function restoreAccount(s: Settings, key: string): Settings {
  const acc = accountSettingsOf(s);
  const buckets = { ...(acc.buckets ?? {}) };
  if (acc.owner) buckets[acc.owner] = pick(s);
  const mine = buckets[key] ?? null;
  delete buckets[key];
  return withAccount(fill(s, mine), { ...acc, owner: key, buckets });
}

/* The user's answer for an account with nothing of its own yet: keep what is shown
   (a copy for this account; the previous owner keeps its own) or start fresh (what
   is shown is put away for its owner, or as the device's earlier settings). */
export function chooseForAccount(s: Settings, key: string, choice: AccountChoice): Settings {
  const acc = accountSettingsOf(s);
  const buckets = { ...(acc.buckets ?? {}) };
  const holder = acc.owner ?? LEGACY_BUCKET;
  if (choice === "fresh" || acc.owner) buckets[holder] = pick(s);
  const next = choice === "fresh" ? fill(s, null) : s;
  return withAccount(next, { ...acc, owner: key, buckets });
}

// Sharing one set of settings between accounts (the behaviour before 3.4.1), or not.
export function setPerAccount(s: Settings, perAccount: boolean, currentKey: string | null): Settings {
  const acc = { ...accountSettingsOf(s) };
  if (perAccount) {
    delete acc.mode;
    if (currentKey) acc.owner = currentKey;
  } else {
    acc.mode = "shared";
  }
  return withAccount(s, acc);
}
