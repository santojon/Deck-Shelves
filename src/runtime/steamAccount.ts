/* Which Steam account is signed in, to notice a switch: settings belong to the device,
   while collections, libraries and the cloud copy belong to the account. Kept only as a
   salted hash in local storage; the backend keeps the salt beside the settings file (never
   in it) with a mirror here, one restoring the other, and it never reaches a snapshot, an
   export, a profile, the cloud copy or a report. An unknown or unsteady reading is never a switch. */
import { createSafetySnapshot } from "../store/settingsStore";
import { call } from "./host/decky";
import { logInfo } from "./logger";

const STORE_KEY = "deck-shelves-account-v1";
const STEAM_ID = /^7656119\d{10}$/;
const CHECK_GAP_MS = 5000;
const MAX_CHECKS = 4;
const SALT = /^[0-9a-f]{32}$/;
const BACKEND_WAIT_MS = 5000;

type AccountState = { salt: string; last?: string; synced?: string; switched?: boolean };

let currentKey: string | null = null;
let syncHeld = false;
let ready: Promise<void> = Promise.resolve();
// A salt the backend could not keep at start, written back once the start has settled.
let unkeptSalt: string | null = null;
const resumeListeners = new Set<() => void>();

export function readSteamId(): string | null {
  try {
    const app = (globalThis as any).App;
    const user = app?.GetCurrentUser?.() ?? app?.m_CurrentUser;
    const id = user?.strSteamID;
    return typeof id === "string" && STEAM_ID.test(id) ? id : null;
  } catch { return null; }
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The local record: null when it holds no salt, undefined when this device's storage cannot be used.
function loadState(): AccountState | null | undefined {
  let raw: string | null;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return undefined;
    raw = storage.getItem(STORE_KEY);
  } catch { return undefined; }
  try {
    const parsed = JSON.parse(raw ?? "null");
    return parsed && typeof parsed.salt === "string" && SALT.test(parsed.salt) ? (parsed as AccountState) : null;
  } catch { return null; }
}

function saveState(state: AccountState): void {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// The salt the backend keeps (the first one it kept stays); null when it cannot answer.
async function keepSaltInBackend(candidate: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), BACKEND_WAIT_MS); });
  try {
    const raw = await Promise.race([call<[unknown], { salt?: unknown }>("keep_account_salt", { salt: candidate }), timeout]);
    const salt = raw?.salt;
    return typeof salt === "string" && SALT.test(salt) ? salt : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// Without a local copy the backend gets a second try before a new salt is used.
async function askBackend(candidate: string, retry: boolean, wait: (ms: number) => Promise<void>): Promise<string | null> {
  const kept = await keepSaltInBackend(candidate);
  if (kept || !retry) return kept;
  await wait(CHECK_GAP_MS);
  return keepSaltInBackend(candidate);
}

/* The salt for this start. The backend's copy wins and restores a missing or different
   local one; while the backend cannot answer the local one stands in (written back later);
   a new one is made only when neither has it. */
async function resolveSalt(local: AccountState | null, wait: (ms: number) => Promise<void>): Promise<AccountState> {
  const candidate = local?.salt ?? randomSalt();
  const kept = await askBackend(candidate, !local, wait);
  unkeptSalt = kept ? null : candidate;
  const salt = kept ?? candidate;
  if (local?.salt === salt) return local;
  // Keys taken with another salt (the last account, the synced one) cannot match any more.
  const next: AccountState = local?.switched ? { salt, switched: true } : { salt };
  saveState(next);
  return next;
}

async function writeBackSalt(): Promise<void> {
  const salt = unkeptSalt;
  if (salt && (await keepSaltInBackend(salt))) unkeptSalt = null;
}

// 16 hex characters of SHA-256(salt + id); null when the platform cannot hash.
export async function accountKey(id: string, salt: string): Promise<string | null> {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + id));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  } catch { return null; }
}

// Two equal readings in a row, a few seconds apart, or null.
async function steadyAccountId(read: () => string | null, wait: (ms: number) => Promise<void>): Promise<string | null> {
  let previous = read();
  for (let i = 1; i < MAX_CHECKS; i++) {
    await wait(CHECK_GAP_MS);
    const now = read();
    if (now && now === previous) return now;
    previous = now;
  }
  return null;
}

// The signed-in account, and the one this device saw last before this start (if any).
export interface KnownAccount { key: string; previous: string | undefined }

export interface AccountWatchOptions {
  onSwitch: () => void;
  // Runs once the account is known; the cloud sync waits for it (settings per account decide here).
  onKnown?: (account: KnownAccount) => Promise<void> | void;
  read?: () => string | null;
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function settle(local: AccountState | null, opts: AccountWatchOptions, isDisposed: () => boolean): Promise<void> {
  const wait = opts.wait ?? sleep;
  const [id, state] = await Promise.all([steadyAccountId(opts.read ?? readSteamId, wait), resolveSalt(local, wait)]);
  const key = id && !isDisposed() ? await accountKey(id, state.salt) : null;
  if (!key || isDisposed()) return;
  await recordAccount(state, key, opts);
  if (!isDisposed()) await opts.onKnown?.({ key, previous: state.last });
}

async function recordAccount(state: AccountState, key: string, opts: AccountWatchOptions): Promise<void> {
  currentKey = key;
  // The cloud copy belongs to the account: a copy last synced under another one waits for the user.
  syncHeld = !!state.synced && state.synced !== key;
  if (state.last && state.last !== key) {
    logInfo("RUNTIME", "Steam account changed on this device");
    await createSafetySnapshot("account");
    saveState({ ...state, last: key, switched: true });
    opts.onSwitch();
    return;
  }
  if (state.last !== key) saveState({ ...state, last: key });
}

export function installSteamAccountWatch(opts: AccountWatchOptions): () => void {
  let disposed = false;
  const local = loadState();
  if (local === undefined) return () => {};
  ready = settle(local, opts, () => disposed).catch(() => {});
  void ready.then(() => (disposed ? undefined : writeBackSalt())).catch(() => {});
  return () => { disposed = true; };
}

// Resolves once the signed-in account is known (or found unknown); at once when nothing watches it.
export function accountReady(): Promise<void> {
  return ready;
}

export function isCloudSyncHeldForAccount(): boolean {
  return syncHeld;
}

export function currentAccountKey(): string | null {
  return currentKey;
}

// While the settings shown may belong to another account (a choice is pending), the sync waits.
export function holdCloudSyncForAccount(): void {
  syncHeld = true;
}

// The user chose to sync this device's settings with this account's cloud copy.
export function resumeCloudSyncForAccount(): void {
  if (!syncHeld) return;
  syncHeld = false;
  markCloudSyncedAccount();
  for (const listener of [...resumeListeners]) { try { listener(); } catch {} }
}

export function onCloudSyncResumed(listener: () => void): () => void {
  resumeListeners.add(listener);
  return () => { resumeListeners.delete(listener); };
}

// After a sync: the cloud copy now matches this account.
export function markCloudSyncedAccount(): void {
  if (!currentKey || syncHeld) return;
  const state = loadState();
  if (state && state.synced !== currentKey) saveState({ ...state, synced: currentKey });
}

// For diagnostics: whether this device has ever seen a different account sign in (yes/no, never which).
export function accountSwitchSeen(): boolean {
  try { return JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? "null")?.switched === true; } catch { return false; }
}
