/**
 * Civil dates.
 *
 * A "civil date" is a calendar day in the user's own timezone, represented as
 * `YYYY-MM-DD`. It is *not* an instant. Arise does all scheduling arithmetic on
 * civil dates, in UTC space, then converts to the user's timezone only when
 * resolving which day "now" falls on.
 *
 * Why this matters: a habit completed at 11:30 PM in Asia/Kolkata belongs to
 * that user's local date, not to the UTC date. Working purely in instants makes
 * that class of bug almost impossible to avoid; working purely in civil dates
 * makes it impossible to express at all. Daylight-saving transitions never
 * change the length of a civil day for our purposes — `addDays` adds one
 * *calendar* day, never 24 hours.
 */

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD`, guaranteed valid. */
export type CivilDate = string & { readonly __brand: 'CivilDate' };

export interface YearMonthDay {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

const partsToCivil = ({ year, month, day }: YearMonthDay): CivilDate =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CivilDate;

/* -------------------------------------------------------------------------- */
/* Parsing & construction                                                      */
/* -------------------------------------------------------------------------- */

export const isValidCivilDate = (value: unknown): value is CivilDate => {
  if (typeof value !== 'string') return false;
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return false;

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1) return false;

  // Reject overflow such as 2026-02-30 by round-tripping through Date.UTC.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === m && probe.getUTCDate() === d
  );
};

/** Parse, or throw. Use `isValidCivilDate` first at trust boundaries. */
export const parseCivilDate = (value: string): CivilDate => {
  if (!isValidCivilDate(value)) {
    throw new TypeError(`Not a valid civil date: ${JSON.stringify(value)}`);
  }
  return value;
};

/** Parse leniently, returning null instead of throwing. */
export const toCivilDate = (value: string | null | undefined): CivilDate | null =>
  isValidCivilDate(value) ? value : null;

const toEpochDay = (date: CivilDate): number => {
  const { year, month, day } = decompose(date);
  // Date.UTC maps years 0–99 onto 1900–1999, so route via setUTCFullYear.
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(0, 0, 0, 0);
  return Math.floor(probe.getTime() / 86_400_000);
};

const fromEpochDay = (epochDay: number): CivilDate => {
  const probe = new Date(epochDay * 86_400_000);
  return partsToCivil({
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  });
};

function decompose(date: CivilDate): YearMonthDay {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/* -------------------------------------------------------------------------- */
/* "Now" in the user's timezone                                                */
/* -------------------------------------------------------------------------- */

const civilDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getCivilDateFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = civilDateFormatterCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  });
  civilDateFormatterCache.set(timeZone, created);
  return created;
};
/** `true` when the runtime recognises the zone (e.g. `Asia/Kolkata`). */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};

/** The runtime's own zone. Used to pre-select the setting on first run. */
export const detectTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * The user's current calendar day. Falls back to UTC if the runtime rejects
 * the stored timezone, so a bad profile value can never blank the dashboard.
 */
export const todayIn = (timeZone: string, now: Date = new Date()): CivilDate => {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  // Assembled from parts rather than sliced out of `format()`: a runtime that
  // falls back from en-CA to a different numeric order would otherwise yield a
  // value that fails validation, and the user would silently get the UTC date.
  const parts = getCivilDateFormatter(zone).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return partsToCivil({
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
  });
};

/**
 * The application's logical daily date.
 * Enforces Asia/Kolkata and a 02:00 AM daily boundary.
 */
export const getLogicalDate = (now: Date = new Date()): CivilDate => {
  const zone = 'Asia/Kolkata';
  
  // Shift the clock back 2 hours:
  // 01:59 AM -> 23:59 PM (previous day)
  // 02:00 AM -> 00:00 AM (current day)
  const logicalInstant = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const parts = getCivilDateFormatter(zone).formatToParts(logicalInstant);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return partsToCivil({
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
  });
};

/** The current instant, decomposed into the user's local wall clock. */
export interface LocalTime {
  hours: number;
  minutes: number;
  /** 0 = Sunday … 6 = Saturday, in the user's timezone. */
  weekday: number;
}

const SUNDAY_FIRST = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const readLocalTime = (timeZone: string, instant: Date): LocalTime => {
  // `formatToParts` rather than parsing `format()`: the order and separator of
  // the output is locale-dependent (en-GB yields "Tue 23:00", others "23:00,
  // Tue"), so a string split is a silent NaN waiting to happen.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(instant);

  let hours = 0;
  let minutes = 0;
  let weekdayToken = '';
  for (const part of parts) {
    if (part.type === 'hour') hours = Number(part.value);
    else if (part.type === 'minute') minutes = Number(part.value);
    else if (part.type === 'weekday') weekdayToken = part.value;
  }

  const weekday = SUNDAY_FIRST.indexOf(weekdayToken.trim().slice(0, 3) as (typeof SUNDAY_FIRST)[number]);
  return {
    // Some engines emit "24" for midnight even under h23; normalise it away.
    hours: hours % 24,
    minutes,
    weekday: weekday < 0 ? 0 : weekday,
  };
};

export const localTimeIn = (timeZone: string, instant: Date = new Date()): LocalTime => {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return readLocalTime(zone, instant);
};

/** Local hour of day, used to pick the greeting. */
export const hourOfDayIn = (timeZone: string, now: Date = new Date()): number =>
  localTimeIn(timeZone, now).hours;

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                 */
/* -------------------------------------------------------------------------- */

export const addDays = (date: CivilDate, amount: number): CivilDate =>
  fromEpochDay(toEpochDay(date) + amount);

export const addMonths = (date: CivilDate, amount: number): CivilDate => {
  const { year, month, day } = decompose(date);
  const zeroBased = month - 1 + amount;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1;
  const lastDay = daysInMonth(targetYear, targetMonth);
  return partsToCivil({
    year: targetYear,
    month: targetMonth,
    // Clamp so 31 Jan + 1 month lands on 28/29 Feb rather than rolling over.
    day: Math.min(day, lastDay),
  });
};

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export const diffDays = (from: CivilDate, to: CivilDate): number => toEpochDay(to) - toEpochDay(from);

export const compareCivil = (a: CivilDate, b: CivilDate): number =>
  a < b ? -1 : a > b ? 1 : 0;

export const isSameCivil = (a: CivilDate, b: CivilDate): boolean => a === b;
export const isAfter = (a: CivilDate, b: CivilDate): boolean => a > b;
export const isBefore = (a: CivilDate, b: CivilDate): boolean => a < b;
export const isOnOrAfter = (a: CivilDate, b: CivilDate): boolean => a >= b;
export const isOnOrBefore = (a: CivilDate, b: CivilDate): boolean => a <= b;

/** ISO weekday: Monday = 1 … Sunday = 7. */
export const isoDayOf = (date: CivilDate): 1 | 2 | 3 | 4 | 5 | 6 | 7 => {
  const day = new Date(toEpochDay(date) * 86_400_000).getUTCDay(); // 0 = Sunday
  return (day === 0 ? 7 : day) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const startOfMonth = (date: CivilDate): CivilDate =>
  partsToCivil({ ...decompose(date), day: 1 });

export const endOfMonth = (date: CivilDate): CivilDate => {
  const { year, month, day } = decompose(date);
  return partsToCivil({ year, month, day: Math.min(day, daysInMonth(year, month)) });
};

/** First day of the week containing `date`, honouring the user's week start. */
export const startOfWeek = (date: CivilDate, weekStartsOn: 1 | 7): CivilDate => {
  const iso = isoDayOf(date);
  // `iso % 7` maps Sun→0, Mon→1 … Sat→6, which is exactly how far back the
  // enclosing Sunday is. Monday-start is the same shape shifted by one.
  const offset = weekStartsOn === 1 ? iso - 1 : iso % 7;
  return addDays(date, -offset);
};

export const endOfWeek = (date: CivilDate, weekStartsOn: 1 | 7): CivilDate =>
  addDays(startOfWeek(date, weekStartsOn), 6);

/** Inclusive range walk. Safe for long ranges: each step is O(1). */
export const eachDay = (from: CivilDate, to: CivilDate): CivilDate[] => {
  const out: CivilDate[] = [];
  const span = diffDays(from, to);
  for (let i = 0; i <= span; i += 1) out.push(addDays(from, i));
  return out;
};

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

const MONTH_LABELS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_LABELS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const monthLabelLong = (month: number): string => MONTH_LABELS_LONG[month - 1] ?? '';
export const monthLabelShort = (month: number): string => MONTH_LABELS_SHORT[month - 1] ?? '';

/**
 * Formatters run against a UTC instant built from the civil date, with an
 * explicit `UTC` timezone. Without both halves the value shifts a day for
 * anyone west of Greenwich.
 */
const asUTCInstant = (date: CivilDate): Date => new Date(toEpochDay(date) * 86_400_000);

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const cachedFormatter = (key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options });
  formatterCache.set(key, created);
  return created;
};

export const formatDateLong = (date: CivilDate): string =>
  cachedFormatter('long', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    asUTCInstant(date),
  );

export const formatDateMedium = (date: CivilDate): string =>
  cachedFormatter('medium', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    asUTCInstant(date),
  );

export const formatDateShort = (date: CivilDate): string =>
  cachedFormatter('short', { day: 'numeric', month: 'short' }).format(asUTCInstant(date));

export const formatDateNumeric = (date: CivilDate): string =>
  cachedFormatter('numeric', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(asUTCInstant(date));

export const formatMonthYear = (date: CivilDate): string => {
  const { year, month } = decompose(date);
  return `${monthLabelLong(month)} ${year}`;
};

/** `HH:MM` → `11:00 PM`. Returns the input unchanged if it is malformed. */
export const formatClock = (time: string | null | undefined): string => {
  const match = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!match) return time ?? '';
  const hours = Number(match[1]);
  const minutes = match[2] ?? '00';
  const suffix = hours < 12 ? 'AM' : 'PM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
};

/** `HH:MM` → `11:00 pm`, for inline, low-emphasis mentions. */
export const formatClockCompact = (time: string | null | undefined): string =>
  formatClock(time).toLowerCase();
