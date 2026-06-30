import React from 'react'

const S: React.CSSProperties = { display: 'inline-block', verticalAlign: 'text-bottom', flexShrink: 0 }

function mk(children: React.ReactNode): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 16 16" fill="none" style={S} aria-hidden="true">
      {children}
    </svg>
  )
}

const Plus = mk(<path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>)
const Star = mk(<path d="M8 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 9.6l-3.2 1.8.6-3.6L2.8 5.3l3.6-.5z" fill="currentColor"/>)
const Clock = mk(<><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3.2l1.8 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
const Download = mk(<><path d="M8 2v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
const Trophy = mk(<><path d="M5 2h6v5a3 3 0 01-6 0V2z" stroke="currentColor" strokeWidth="1.5"/><path d="M5 4H3a2 2 0 002 2M11 4h2a2 2 0 01-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 11v2M10 11v2M5 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
const CalPlus = mk(<><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 9.5v3M6.5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
const ArrowUp = mk(<path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>)
const Gamepad = mk(<><rect x="2" y="5" width="12" height="7" rx="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5.5 8.5H7M6.25 7.75v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10.5" cy="8" r="0.8" fill="currentColor"/><circle cx="9.5" cy="9.5" r="0.8" fill="currentColor"/></>)
const Hourglass = mk(<><path d="M4 2h8M4 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 2l3 5 3-5M5 14l3-5 3 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></>)
const CalDot = mk(<><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="11" r="1.5" fill="currentColor"/></>)
const Shield = mk(<><path d="M8 2L3 4.2v3.8C3 11 5.3 13.5 8 14c2.7-.5 5-3 5-6V4.2L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>)
const PlayCircle = mk(<><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 5.5l5 2.5-5 2.5z" fill="currentColor"/></>)
const Dice = mk(<><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="10.5" cy="5.5" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="5.5" cy="10.5" r="1" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1" fill="currentColor"/></>)
const Box = mk(<><path d="M2 5.5l6-3.5 6 3.5v5l-6 3.5-6-3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M2 5.5l6 3.5 6-3.5M8 9v5" stroke="currentColor" strokeWidth="1.5"/></>)
const Lightning = mk(<path d="M9.5 2L4 9h4.5L6.5 14l5.5-7H8L9.5 2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>)
const Pause = mk(<><rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor"/></>)
const SunMoon = mk(<><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M8 2v1M8 13v1M2 8h1M13 8h1M4.2 4.2l.7.7M11.1 11.1l.7.7M11.1 4.9l-.7.7M4.9 11.1l-.7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
const Refresh = mk(<><path d="M13 8A5 5 0 103 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>)
// Cloud — Steam Cloud saves
const Cloud = mk(<path d="M5 12a3 3 0 010-6 4 4 0 017.5-.5A3 3 0 1112 12H5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>)
// Shield with checkmark — Deck Verified
const ShieldCheck = mk(<><path d="M8 2L3 4.2v3.8C3 11 5.3 13.5 8 14c2.7-.5 5-3 5-6V4.2L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>)
// Thumbs up — top reviewed
const ThumbsUp = mk(<><path d="M5 14V8h2l3-5a1.5 1.5 0 011.5 1.5V7h2.5a2 2 0 012 2.3l-1 5a2 2 0 01-2 1.7H7l-2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><rect x="2.5" y="8" width="2.5" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.4"/></>)
const Bookmark = mk(<><path d="M4 2h8a1 1 0 011 1v10l-5-3-5 3V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></>)
const Tag = mk(<><path d="M2 2h6l6 6-6 6L2 8V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/></>)
const Gift = mk(<><rect x="2" y="7" width="12" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M14 10H2M8 7V14M8 7c0-2 2-4 3-2s-1 2-3 2M8 7c0-2-2-4-3-2s1 2 3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>)
const Fire = mk(<><path d="M8 14c-3 0-5-2-5-5 0-2 1-3.5 2.5-4.5 0 1.5 1 2.5 1 2.5 0-2 1-4 3-5 0 2 1 3 2 3.5C12 6.5 13 8 13 9c0 3-2 5-5 5z" fill="currentColor" opacity="0.8"/><path d="M8 12c-1.5 0-2.5-1-2.5-2 0-1 .5-1.5 1.5-2 0 .8.5 1.5 1 1.5 0-1 .5-2 1.5-2.5-.5 1 0 2 .5 2.5.5-.5 1-.5 1 .5C11 11 9.5 12 8 12z" fill="currentColor"/></>)

export const SHELF_TPL_ICON: Record<string, React.ReactElement> = {
  blank: Plus,
  favorites: Star,
  recent: Clock,
  installed: Download,
  most_played: Trophy,
  recently_added: CalPlus,
  awaiting_update: ArrowUp,
  non_steam: Gamepad,
  long_session: Hourglass,
  steam_cloud: Cloud,
  deck_verified: ShieldCheck,
  deck_playable: Shield,
  never_played: Pause,
  top_reviewed: ThumbsUp,
  wishlist: Bookmark,
  wishlist_on_sale: Tag,
  free_wishlist: Gift,
  free_now: Fire,
}

// Calendar with X — game sitting untouched for years
const Forgotten = mk(<><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 10.5l4-2.5M6 8l4 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
// Coffee cup with steam — short-session play during breaks
const Coffee = mk(<><path d="M3 5h8v6a3 3 0 01-3 3H6a3 3 0 01-3-3V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M11 6.5h1a1.5 1.5 0 110 3h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5.5 3.5c0-1 1-1 1-2M8 3.5c0-1 1-1 1-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>)
// Backlog rescue — upward arrow lifting a stacked-rectangle pile
const BacklogRescue = mk(<><rect x="3" y="11" width="10" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><rect x="4" y="8.5" width="8" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 6V2M5.5 4.5L8 2l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></>)
// Forgotten gems — diamond / gem
const Gem = mk(<><path d="M4 5l4-3 4 3-4 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M4 5h8M8 2v3M8 5l-4 9M8 5l4 9" stroke="currentColor" strokeWidth="1.2"/></>)
// Rotation — circular arrow with calendar
const RotateCal = mk(<><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M11.5 5.5l1.5-1V7M11.5 5.5A4.5 4.5 0 008 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8" cy="8" r="1" fill="currentColor"/></>)
// Battery low + lightning — short battery
const Battery = mk(<><rect x="2" y="5" width="11" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="13" y="7" width="1.5" height="2" rx="0.4" fill="currentColor"/><path d="M7.5 6.5L5.5 9h2L6 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></>)
// Moon + clock — long session at night
const MoonClock = mk(<><path d="M11 3a5 5 0 100 10c-2.5 0-4-2-4-5s1.5-5 4-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="4.5" cy="10" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 9v1.2l.8.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>)
// Suitcase — travel mode
const Suitcase = mk(<><rect x="2.5" y="5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M5.5 5V3.5A1 1 0 016.5 2.5h3a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2.5 9.5h11" stroke="currentColor" strokeWidth="1.3"/></>)
// Hidden gem — magnifying glass over diamond
const HiddenGem = mk(<><circle cx="6.5" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9 9l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 5.5l1.5-1.5 1.5 1.5L6.5 8z" fill="currentColor"/></>)
// Trophy + dust — never touched classic
const ClassicTrophy = mk(<><path d="M5 2h6v5a3 3 0 01-6 0V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M5 4H3a2 2 0 002 2M11 4h2a2 2 0 01-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M5 13h6M6 11v2M10 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 14.5l1-1M14 14.5l-1-1M2.5 11l1-0.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/></>)
// Download + sparkle — recent hidden installs
const RecentInstall = mk(<><path d="M5 2v6M3 6l2 2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M12 3l.7 1.5L14 5l-1.3.5L12 7l-.7-1.5L10 5l1.3-.5z" fill="currentColor"/><path d="M11.5 10l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" fill="currentColor"/></>)
// Battery low — low battery mode (battery outline + low fill)
const BatteryLow = mk(<><rect x="2" y="5" width="11" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="13" y="7" width="1.5" height="2" rx="0.4" fill="currentColor"/><rect x="3.5" y="6.5" width="2.5" height="3" fill="currentColor"/><path d="M9 6.5L7 9h2L8 11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></>)
// Trophy + progress — almost finished
const AlmostDone = mk(<><path d="M5 2h6v5a3 3 0 01-6 0V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M5 4H3a2 2 0 002 2M11 4h2a2 2 0 01-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M6 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="14.5" r="0.8" fill="currentColor"/></>)
// Two controllers — couch gaming
const TwoPads = mk(<><rect x="1" y="6" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="8" y="6" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="4" cy="8.5" r="0.6" fill="currentColor"/><circle cx="12" cy="8.5" r="0.6" fill="currentColor"/></>)
// Two figures holding hands — coop
const Coop = mk(<><circle cx="5" cy="4" r="1.3" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="4" r="1.3" stroke="currentColor" strokeWidth="1.2"/><path d="M3 13v-3a2 2 0 012-2 2 2 0 012 2v3M9 13v-3a2 2 0 012-2 2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7 9.5l2 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>)
// Confetti — party games
const Party = mk(<><path d="M3 13l3-8M5 13l3-8M7 13l3-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="11" cy="4" r="0.7" fill="currentColor"/><circle cx="13" cy="6" r="0.7" fill="currentColor"/><circle cx="11.5" cy="8" r="0.7" fill="currentColor"/><circle cx="14" cy="10" r="0.7" fill="currentColor"/></>)
// Friend silhouette with play arrow — friends playing now
const FriendPlay = mk(<><circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M2 13v-1.5A3.5 3.5 0 015.5 8h1A3.5 3.5 0 0110 11.5V13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M11 5.5l4 2.5-4 2.5z" fill="currentColor"/></>)

export const SMART_TPL_ICON: Record<string, React.ReactElement> = {
  daily_pick: CalDot,
  deck_picks: Shield,
  on_deck: PlayCircle,
  recently_played: Clock,
  long_session: Hourglass,
  random_pick: Dice,
  not_started: Box,
  best_unplayed: Star,
  quick_play: Lightning,
  interrupted: Pause,
  non_steam: Gamepad,
  time_of_day: SunMoon,
  rediscover: Refresh,
  forgotten: Forgotten,
  spare_time: Coffee,
  // v2 heuristic templates.
  backlog_rescue: BacklogRescue,
  forgotten_gems: Gem,
  weekly_rotation: RotateCal,
  // Second-wave heuristic templates.
  short_battery: Battery,
  long_session_night: MoonClock,
  travel_mode: Suitcase,
  hidden_gems: HiddenGem,
  never_touched_classics: ClassicTrophy,
  recent_hidden_installs: RecentInstall,
  monthly_spotlight: RotateCal,
  seasonal_rotation: RotateCal,
  // Runtime-aware templates.
  low_battery_mode: BatteryLow,
  almost_finished: AlmostDone,
  couch_gaming: TwoPads,
  coop_ready: Coop,
  party_games: Party,
  friends_playing: FriendPlay,
}
