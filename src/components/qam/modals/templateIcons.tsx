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
}

// Calendar with X — game sitting untouched for years
const Forgotten = mk(<><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 10.5l4-2.5M6 8l4 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>)
// Coffee cup with steam — short-session play during breaks
const Coffee = mk(<><path d="M3 5h8v6a3 3 0 01-3 3H6a3 3 0 01-3-3V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M11 6.5h1a1.5 1.5 0 110 3h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5.5 3.5c0-1 1-1 1-2M8 3.5c0-1 1-1 1-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>)

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
}
