
import { logInfo } from './logger';
import { triggerShelfRefresh } from '../core/shelfRefresh';

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const POLL_INTERVAL_MS = 90 * 1000;
// "Recently played" lookback — apps where any friend had `m_nAppIDLastSeenPlaying`
// observed within the last N days. 14 days matches a casual play cadence
// without producing an unbounded set on accounts with many friends.
const RECENTLY_PLAYED_LOOKBACK_DAYS = 14;

export type FriendBrief = { name: string; avatar: string };

let _currentlyPlaying = new Set<number>();
let _recentlyPlayed = new Set<number>();
// appId -> friends in that app, for the "friends playing" card overlay.
let _playingByApp = new Map<number, FriendBrief[]>();
let _recentByApp = new Map<number, FriendBrief[]>();
let _pollTimer: number | null = null;
let _gameChangeReg: { Unregister?: () => void } | null = null;

function avatarUrl(hash: unknown): string {
  const h = typeof hash === "string" ? hash : "";
  return h ? `https://avatars.steamstatic.com/${h}_medium.jpg` : "";
}

function pushFriend(map: Map<number, FriendBrief[]>, appId: number, brief: FriendBrief): void {
  const list = map.get(appId);
  if (list) list.push(brief);
  else map.set(appId, [brief]);
}

function getFriendStore(): any {
  return (globalThis as any).friendStore ?? (window as any).friendStore;
}

/* Subscribe to Steam's live "friend changed game" event and prime persona
   states once, so the shelf updates the moment a friend starts/stops a game
   instead of on the next poll, and friends whose state was never requested
   this session still report m_unGamePlayedAppID. Event-driven, adds no timer;
   AddPlayerGameChangedCallback returns an { Unregister } handle (on-device). */
function subscribeGameChanges(): void {
  const inner = getFriendStore()?.m_FriendsUIFriendStore;
  if (!inner) return;
  try { inner.RequestFriendPersonaStates?.(); } catch {}
  try {
    if (typeof inner.AddPlayerGameChangedCallback === 'function') {
      _gameChangeReg = inner.AddPlayerGameChangedCallback(() => { try { refresh(); } catch {} });
    }
  } catch {}
}

function unsubscribeGameChanges(): void {
  try { _gameChangeReg?.Unregister?.(); } catch {}
  _gameChangeReg = null;
}

function refresh(): void {
  const fs = getFriendStore();
  if (!fs) return;
  let all: any[] = [];
  try {
    all = Array.isArray(fs.allFriends) ? fs.allFriends : [];
  } catch { return; }
  const now = Math.floor(Date.now() / 1000);
  const recentCutoff = now - RECENTLY_PLAYED_LOOKBACK_DAYS * 24 * 3600;
  const playing = new Set<number>();
  const recent = new Set<number>();
  const playingByApp = new Map<number, FriendBrief[]>();
  const recentByApp = new Map<number, FriendBrief[]>();
  for (const f of all) {
    try {
      const brief: FriendBrief = { name: String(f?.m_persona?.m_strPlayerName ?? ""), avatar: avatarUrl(f?.m_persona?.m_strAvatarHash) };
      // Live "in game now": m_persona.m_unGamePlayedAppID is non-zero
      // while the friend is actively in a game on Steam.
      const live = Number(f?.m_persona?.m_unGamePlayedAppID ?? f?.m_persona?.m_gameid ?? 0);
      if (live > 0) {
        playing.add(live);
        recent.add(live);
        pushFriend(playingByApp, live, brief);
        pushFriend(recentByApp, live, brief);
      }
      // Historical "last seen playing": friend was observed in this app at
      // some point. Steam includes a coarse timestamp via m_dtLastSeenPlaying;
      // include only when the timestamp is recent.
      const lastApp = Number(f?.m_nAppIDLastSeenPlaying ?? 0);
      if (lastApp > 0 && lastApp !== live) {
        const lastTs = Number(f?.m_dtLastSeenPlaying ?? 0);
        if (!lastTs || lastTs >= recentCutoff) {
          recent.add(lastApp);
          pushFriend(recentByApp, lastApp, brief);
        }
      }
    } catch {}
  }
  // Re-resolve friends-playing shelves + the card overlay only when the set
  // actually changed (polled ~every 90s, so this fires rarely — no debounce
  // needed). This is what makes the shelf appear once the first poll lands.
  const changed = !setsEqual(playing, _currentlyPlaying) || !setsEqual(recent, _recentlyPlayed);
  _currentlyPlaying = playing;
  _recentlyPlayed = recent;
  _playingByApp = playingByApp;
  _recentByApp = recentByApp;
  if (changed) {
    try { triggerShelfRefresh(); } catch {}
  }
}

export function installFriendsState(): () => void {
  if (_pollTimer !== null) {
    try { clearInterval(_pollTimer); } catch {}
    _pollTimer = null;
  }
  unsubscribeGameChanges();
  // First refresh deferred to idle so the boot path stays responsive.
  // The friend list isn't usually ready yet at plugin boot anyway.
  const schedule = (globalThis as any).requestIdleCallback ?? ((cb: any) => setTimeout(cb, 2000));
  schedule(() => { try { subscribeGameChanges(); refresh(); } catch {} });
  _pollTimer = window.setInterval(() => {
    try { refresh(); } catch {}
  }, POLL_INTERVAL_MS);
  logInfo('RUNTIME', 'friends state subscription installed');
  return () => {
    if (_pollTimer !== null) {
      try { clearInterval(_pollTimer); } catch {}
      _pollTimer = null;
    }
    unsubscribeGameChanges();
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

// Friends in a given app for the card overlay. `includeRecent` widens the set
// to friends seen playing within the lookback window (not just live).
export function getFriendsInApp(appId: number, includeRecent: boolean): FriendBrief[] {
  if (!appId) return [];
  return (includeRecent ? _recentByApp : _playingByApp).get(appId) ?? [];
}

export function refreshFriendsState(): void {
  try { refresh(); } catch {}
}
