import { subscribeAppStart } from "./sessionState";
import { triggerShelfRefresh } from "../core/shelfRefresh";
import { qaOverrideActive } from "../qa/harness";

/* Per-device game lists behind the "Manual" sources and the Custom tags
   filter: pinned games, play history, the session queue (until Steam restarts),
   the temporary queue (a game leaves it when launched) and tags per game.
   Stored in localStorage; the queues and tags also sit on globals another
   plugin may write, so every read checks the global first. */

const PINNED_KEY = "ds-pinned-games-v1";
const HISTORY_KEY = "ds-history-v1";
const TEMP_QUEUE_KEY = "ds-temp-queue-v1";
const TAGS_KEY = "ds-custom-tags-v1";
const HISTORY_MAX = 100;
const TAGS_PER_GAME_MAX = 20;
const TAG_MAX_LEN = 40;

const g = (): any => globalThis as any;

// A QA build keeps its list edits in memory: the device's own lists stay as they were.
const qaLists = new Map<string, string>();

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = qaLists.get(key) ?? g().localStorage?.getItem?.(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function writeJson(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (qaOverrideActive) qaLists.set(key, raw);
    else g().localStorage?.setItem?.(key, raw);
  } catch {}
}

function idList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

function toggled(ids: number[], appid: number): number[] {
  return ids.includes(appid) ? ids.filter((id) => id !== appid) : [...ids, appid];
}

export function pinnedIds(): number[] { return idList(readJson(PINNED_KEY, [])); }
export function historyIds(): number[] { return idList(readJson(HISTORY_KEY, [])); }
export function sessionQueueIds(): number[] { return idList(g().__ds_session_queue); }

export function temporaryQueueIds(): number[] {
  if (!Array.isArray(g().__ds_temp_queue)) g().__ds_temp_queue = idList(readJson(TEMP_QUEUE_KEY, []));
  return idList(g().__ds_temp_queue);
}

function allCustomTags(): Record<string, string[]> {
  const cur = g().__ds_custom_tags_v1;
  if (cur && typeof cur === "object" && !Array.isArray(cur)) return cur;
  const stored = readJson<Record<string, string[]>>(TAGS_KEY, {});
  g().__ds_custom_tags_v1 = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return g().__ds_custom_tags_v1;
}

export function customTagsFor(appid: number): string[] {
  const tags = allCustomTags()[String(appid)];
  return Array.isArray(tags) ? tags.map(String) : [];
}

export function togglePinned(appid: number): void {
  writeJson(PINNED_KEY, toggled(pinnedIds(), appid));
  triggerShelfRefresh();
}

export function toggleSessionQueue(appid: number): void {
  g().__ds_session_queue = toggled(sessionQueueIds(), appid);
  triggerShelfRefresh();
}

function setTemporaryQueue(ids: number[]): void {
  g().__ds_temp_queue = ids;
  writeJson(TEMP_QUEUE_KEY, ids);
}

export function toggleTemporaryQueue(appid: number): void {
  setTemporaryQueue(toggled(temporaryQueueIds(), appid));
  triggerShelfRefresh();
}

// Trimmed, case-insensitively unique, bounded in count and length.
export function cleanTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const tag = String(r).trim().slice(0, TAG_MAX_LEN);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out.slice(0, TAGS_PER_GAME_MAX);
}

export function setCustomTags(appid: number, tags: readonly string[]): void {
  const all = { ...allCustomTags() };
  const clean = cleanTags(tags);
  if (clean.length) all[String(appid)] = clean;
  else delete all[String(appid)];
  g().__ds_custom_tags_v1 = all;
  writeJson(TAGS_KEY, all);
  triggerShelfRefresh();
}

// A launch moves the game to the front of the history and takes it off the temporary queue.
export function noteLaunch(appid: number): void {
  writeJson(HISTORY_KEY, [appid, ...historyIds().filter((id) => id !== appid)].slice(0, HISTORY_MAX));
  const queue = temporaryQueueIds();
  if (queue.includes(appid)) setTemporaryQueue(queue.filter((id) => id !== appid));
}

export function installGameLists(): () => void {
  return subscribeAppStart(noteLaunch);
}
