
import { logInfo } from './logger';
import { STEAM_AVATARS_BASE } from '../constants';
import { triggerShelfRefresh } from '../core/shelfRefresh';

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const POLL_INTERVAL_MS = 90 * 1000;
const RECENTLY_PLAYED_LOOKBACK_DAYS = 14;

export type FriendBrief = { name: string; avatar: string };

let _currentlyPlaying = new Set<number>();
let _recentlyPlayed = new Set<number>();
let _playingByApp = new Map<number, FriendBrief[]>();
let _recentByApp = new Map<number, FriendBrief[]>();
let _pollTimer: number | null = null;

// Cards read friends during render, so this lets one opt in to re-render on a real change.
const _listeners = new Set<() => void>();
export function subscribeFriendsChanged(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function avatarUrl(hash: unknown): string {
  const h = typeof hash === "string" ? hash : "";
  return h ? `${STEAM_AVATARS_BASE}/${h}_medium.jpg` : "";
}

function pushFriend(map: Map<number, FriendBrief[]>, appId: number, brief: FriendBrief): void {
  const list = map.get(appId);
  if (list) list.push(brief);
  else map.set(appId, [brief]);
}

function getFriendStore(): any {
  return (globalThis as any).friendStore ?? (window as any).friendStore;
}

function friendBriefOf(f: any): FriendBrief {
  return { name: String(f?.m_persona?.m_strPlayerName ?? ""), avatar: avatarUrl(f?.m_persona?.m_strAvatarHash) };
}

function liveAppIdOf(f: any): number {
  return Number(f?.m_persona?.m_unGamePlayedAppID ?? f?.m_persona?.m_gameid ?? 0);
}

function recordLiveFriend(
  live: number,
  brief: FriendBrief,
  playing: Set<number>,
  recent: Set<number>,
  playingByApp: Map<number, FriendBrief[]>,
  recentByApp: Map<number, FriendBrief[]>,
): void {
  if (live <= 0) return;
  playing.add(live);
  recent.add(live);
  pushFriend(playingByApp, live, brief);
  pushFriend(recentByApp, live, brief);
}

function recordHistoricalFriend(
  f: any,
  live: number,
  recentCutoff: number,
  brief: FriendBrief,
  recent: Set<number>,
  recentByApp: Map<number, FriendBrief[]>,
): void {
  const lastApp = Number(f?.m_nAppIDLastSeenPlaying ?? 0);
  if (lastApp <= 0 || lastApp === live) return;
  const lastTs = Number(f?.m_dtLastSeenPlaying ?? 0);
  if (lastTs && lastTs < recentCutoff) return;
  recent.add(lastApp);
  pushFriend(recentByApp, lastApp, brief);
}

// Per friend, so one malformed entry can't drop the rest of the poll.
function processFriendIntoSets(
  f: any,
  recentCutoff: number,
  playing: Set<number>,
  recent: Set<number>,
  playingByApp: Map<number, FriendBrief[]>,
  recentByApp: Map<number, FriendBrief[]>,
): void {
  try {
    const brief = friendBriefOf(f);
    const live = liveAppIdOf(f);
    recordLiveFriend(live, brief, playing, recent, playingByApp, recentByApp);
    recordHistoricalFriend(f, live, recentCutoff, brief, recent, recentByApp);
  } catch {}
}

// Returns whether it read anything, so the caller retries only while the friend store isn't ready.
function refresh(): boolean {
  const fs = getFriendStore();
  if (!fs) return false;
  let all: any[] = [];
  try {
    all = Array.isArray(fs.allFriends) ? fs.allFriends : [];
  } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  const recentCutoff = now - RECENTLY_PLAYED_LOOKBACK_DAYS * 24 * 3600;
  const playing = new Set<number>();
  const recent = new Set<number>();
  const playingByApp = new Map<number, FriendBrief[]>();
  const recentByApp = new Map<number, FriendBrief[]>();
  for (const f of all) processFriendIntoSets(f, recentCutoff, playing, recent, playingByApp, recentByApp);
  const changed = !setsEqual(playing, _currentlyPlaying) || !setsEqual(recent, _recentlyPlayed);
  _currentlyPlaying = playing;
  _recentlyPlayed = recent;
  _playingByApp = playingByApp;
  _recentByApp = recentByApp;
  if (changed) {
    try { triggerShelfRefresh({ deps: ['friends'] }); } catch {}
  }
  // Unconditional: a card can mount between the refresh and its own subscription and miss the change.
  for (const l of _listeners) { try { l(); } catch {} }
  return true;
}

// The friend list can hydrate after the first attempt, so retry a few times before the next poll.
const FIRST_REFRESH_RETRY_MS = 4000;
const FIRST_REFRESH_MAX_ATTEMPTS = 6;

export function installFriendsState(): () => void {
  if (_pollTimer !== null) {
    try { clearInterval(_pollTimer); } catch {}
    _pollTimer = null;
  }
  let stopped = false;
  let retryTimer: number | null = null;
  const attemptFirstRefresh = (attempt: number) => {
    if (stopped) return;
    let ok = false;
    try { ok = refresh(); } catch {}
    if (ok || attempt >= FIRST_REFRESH_MAX_ATTEMPTS) return;
    retryTimer = window.setTimeout(() => attemptFirstRefresh(attempt + 1), FIRST_REFRESH_RETRY_MS);
  };
  const ric = (globalThis as any).requestIdleCallback;
  const schedule = ric ? (cb: () => void) => ric(cb, { timeout: 5000 }) : (cb: () => void) => setTimeout(cb, 2000);
  schedule(() => attemptFirstRefresh(1));
  _pollTimer = window.setInterval(() => {
    try { refresh(); } catch {}
  }, POLL_INTERVAL_MS);
  logInfo('RUNTIME', 'friends state subscription installed');
  return () => {
    stopped = true;
    if (retryTimer !== null) { try { window.clearTimeout(retryTimer); } catch {} }
    if (_pollTimer !== null) {
      try { clearInterval(_pollTimer); } catch {}
      _pollTimer = null;
    }
    _currentlyPlaying = new Set();
    _recentlyPlayed = new Set();
    _playingByApp = new Map();
    _recentByApp = new Map();
  };
}

export function getFriendsPlayingAppIds(): Set<number> {
  return _currentlyPlaying;
}

export function getFriendsRecentlyPlayedAppIds(): Set<number> {
  return _recentlyPlayed;
}

export function getFriendsInApp(appId: number, includeRecent: boolean): FriendBrief[] {
  if (!appId) return [];
  return (includeRecent ? _recentByApp : _playingByApp).get(appId) ?? [];
}

