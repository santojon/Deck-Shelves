
import { logInfo } from './logger';

const POLL_INTERVAL_MS = 90 * 1000;
// "Recently played" lookback — apps where any friend had `m_nAppIDLastSeenPlaying`
// observed within the last N days. 14 days matches a casual play cadence
// without producing an unbounded set on accounts with many friends.
const RECENTLY_PLAYED_LOOKBACK_DAYS = 14;

let _currentlyPlaying = new Set<number>();
let _recentlyPlayed = new Set<number>();
let _pollTimer: number | null = null;

function getFriendStore(): any {
  return (globalThis as any).friendStore ?? (window as any).friendStore;
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
  for (const f of all) {
    try {
      // Live "in game now": m_persona.m_unGamePlayedAppID is non-zero
      // while the friend is actively in a game on Steam.
      const live = Number(f?.m_persona?.m_unGamePlayedAppID ?? f?.m_persona?.m_gameid ?? 0);
      if (live > 0) {
        playing.add(live);
        recent.add(live);
      }
      // Historical "last seen playing": friend was observed in this app at
      // some point. Steam includes a coarse timestamp via m_dtLastSeenPlaying;
      // include only when the timestamp is recent.
      const lastApp = Number(f?.m_nAppIDLastSeenPlaying ?? 0);
      if (lastApp > 0) {
        const lastTs = Number(f?.m_dtLastSeenPlaying ?? 0);
        if (!lastTs || lastTs >= recentCutoff) recent.add(lastApp);
      }
    } catch {}
  }
  _currentlyPlaying = playing;
  _recentlyPlayed = recent;
}

export function installFriendsState(): () => void {
  if (_pollTimer !== null) {
    try { clearInterval(_pollTimer); } catch {}
    _pollTimer = null;
  }
  // First refresh deferred to idle so the boot path stays responsive.
  // The friend list isn't usually ready yet at plugin boot anyway.
  const schedule = (globalThis as any).requestIdleCallback ?? ((cb: any) => setTimeout(cb, 2000));
  schedule(() => { try { refresh(); } catch {} });
  _pollTimer = window.setInterval(() => {
    try { refresh(); } catch {}
  }, POLL_INTERVAL_MS);
  logInfo('RUNTIME', 'friends state subscription installed');
  return () => {
    if (_pollTimer !== null) {
      try { clearInterval(_pollTimer); } catch {}
      _pollTimer = null;
    }
    _currentlyPlaying = new Set();
    _recentlyPlayed = new Set();
  };
}

export function getFriendsPlayingAppIds(): Set<number> {
  return _currentlyPlaying;
}

export function getFriendsRecentlyPlayedAppIds(): Set<number> {
  return _recentlyPlayed;
}

export function refreshFriendsState(): void {
  try { refresh(); } catch {}
}
