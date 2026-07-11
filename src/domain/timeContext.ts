// Pure time-context predicates for Visibility Rules v2 (Sprint 4). No side
// effects, no I/O — evaluated during render like the other visibility kinds.

type Rule = { kind?: string } & Record<string, any>;

export const TIME_CONTEXT_KINDS = ['weekend', 'timeOfDayPeriod', 'season', 'holiday'] as const;

export function isTimeContextKind(kind: string): boolean {
  return (TIME_CONTEXT_KINDS as readonly string[]).includes(kind);
}

// Hour ranges per period [start, end); "night" wraps past midnight.
const PERIODS: Record<string, [number, number]> = {
  morning: [5, 12],
  afternoon: [12, 17],
  evening: [17, 21],
  night: [21, 5],
};

function inRange(value: number, start: number, end: number): boolean {
  return start <= end ? value >= start && value < end : value >= start || value < end;
}

function matchesPeriod(period: unknown, hour: number): boolean {
  const range = PERIODS[String(period)];
  return range ? inRange(hour, range[0], range[1]) : true;
}

// Meteorological seasons by month (0 = Jan); the southern hemisphere is offset
// by six months.
function seasonOf(month: number, hemisphere: unknown): string {
  const m = hemisphere === 'south' ? (month + 6) % 12 : month;
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/* A holiday range is { start:'MM-DD', end:'MM-DD' } recurring yearly; `end` may
   wrap past year-end (e.g. 12-27 → 01-02). Lexical MM-DD compare works because
   the format is zero-padded and fixed-width. */
function inHolidayRange(mmdd: string, start: string, end: string): boolean {
  return start <= end ? mmdd >= start && mmdd <= end : mmdd >= start || mmdd <= end;
}

function matchesHoliday(ranges: unknown, now: Date): boolean {
  if (!Array.isArray(ranges) || ranges.length === 0) return true;
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return ranges.some(
    (r: any) => typeof r?.start === 'string' && typeof r?.end === 'string' && inHolidayRange(mmdd, r.start, r.end),
  );
}

function matchesWeekend(rule: Rule, now: Date): boolean {
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  return rule?.value === 'weekday' ? !weekend : weekend;
}

function matchesSeason(rule: Rule, now: Date): boolean {
  return rule?.season ? seasonOf(now.getMonth(), rule?.hemisphere) === String(rule.season) : true;
}

/* Evaluate one time-context VisibilityRule. Unknown kinds fail open (return true).
   Kinds: weekend (value 'weekend'|'weekday'), timeOfDayPeriod (period), season
   (season + hemisphere), holiday (ranges of MM-DD). */
export function evalTimeContextRule(rule: Rule, now: Date = new Date()): boolean {
  switch (String(rule?.kind || '')) {
    case 'weekend':
      return matchesWeekend(rule, now);
    case 'timeOfDayPeriod':
      return matchesPeriod(rule?.period, now.getHours());
    case 'season':
      return matchesSeason(rule, now);
    case 'holiday':
      return matchesHoliday(rule?.ranges, now);
    default:
      return true;
  }
}
