/**
 * Friends presence runtime probe.
 *
 * Reads `friendStore.allFriends` (Steam's runtime cache of the user's friend
 * list, populated by the client whenever the user is signed in + online) and
 * exposes two sets of appids:
 *   - currentlyPlaying: friends in-game RIGHT NOW (`m_persona.m_unGamePlayedAppID`).
 *   - recentlyPlayed:   union of every friend's most recent
 *                       `m_nAppIDLastSeenPlaying` value, capped by recency.
 *
 * Update strategy: friend presence is push-driven by Steam itself, but the
 * `OnPersonaStateChanged` hook isn't easy to wrap from outside `friendStore`.
 * Instead we poll on a coarse cadence (90 s) when the home is visible —
 * cheap (synchronous Map iteration over ~50–200 friends) and avoids the
 * fragility of monkey-patching a frequently-replaced internal method.
 *
 * Graceful degradation: when `friendStore` isn't available (offline / older
 * SteamOS / dev environment), both getters return empty sets and the
 * friends_playing smart-shelf template renders empty (consistent with other
 * online-gated paths).
 *
 * Privacy posture: this module makes ZERO network calls and ZERO writes to
 * disk. It only READS data the Steam client has already cached locally.
 * Gating by `onlineFeaturesEnabled` happens at the template resolver level
 * (returns empty when off) so the user controls visibility of friend data
 * via the same master toggle as wishlist / store.
 */

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

/** Installs the polling subscription. Idempotent: a second call replaces the
 *  previous timer. Returns a cleanup function. */
export function installFriendsState(): () => void {
  if (_pollTimer !== null) {
    try { clearInterval(_pollTimer); } catch {}
    _pollTimer = null;
  }
  // Immediate first refresh so the resolver doesn't render empty on the
  // first home render. Wrapped in try/catch — if friendStore isn't ready
  // yet, the next tick will catch it.
  try { refresh(); } catch {}
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

/** Returns the set of appids any friend is playing RIGHT NOW. */
export function getFriendsPlayingAppIds(): Set<number> {
  return _currentlyPlaying;
}

/** Returns the set of appids any friend played within the last
 *  RECENTLY_PLAYED_LOOKBACK_DAYS. Superset of `getFriendsPlayingAppIds`. */
export function getFriendsRecentlyPlayedAppIds(): Set<number> {
  return _recentlyPlayed;
}

/** Forces an immediate re-scan. Useful from the smart-shelf refresh action
 *  so the user gets fresh data without waiting for the next poll tick. */
export function refreshFriendsState(): void {
  try { refresh(); } catch {}
}
