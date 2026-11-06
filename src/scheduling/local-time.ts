/**
 * Local-time helpers based on IANA time zones (Intl), with no extra dependencies.
 *
 * Appointments are stored as instants; business hours and service windows are
 * expressed in the business' local time ('HH:mm'), so comparisons need the
 * local weekday and minute-of-day of an instant in the business time zone.
 */

export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export interface LocalTimeParts {
  /** Local calendar date, YYYY-MM-DD */
  dateKey: string;
  weekday: DayOfWeek;
  /** Minutes since local midnight (0 - 1439) */
  minutes: number;
}

/** True when `timeZone` is a valid IANA time zone identifier (e.g. America/Tegucigalpa) */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** 'HH:mm' => minutes since midnight */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Building an Intl.DateTimeFormat is expensive and availability calls this thousands of times */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Local weekday, date and minute-of-day of an instant in the given time zone */
export function getLocalTimeParts(date: Date, timeZone: string): LocalTimeParts {
  const parts = formatterFor(timeZone).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)!.value;

  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday').toLowerCase() as DayOfWeek,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

/** The wall-clock reading of an instant in a zone, expressed as if it were UTC (to compare readings) */
function wallClockAsUtc(date: Date, timeZone: string): number {
  const { dateKey, minutes } = getLocalTimeParts(date, timeZone);
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day) + minutes * 60_000;
}

/**
 * The instant at which the clocks of `timeZone` read `dateKey` (YYYY-MM-DD) at `minutes` since
 * local midnight. Inverse of getLocalTimeParts. Corrects the first guess by the offset of the
 * zone (two passes cover a daylight saving change).
 */
export function localDateTimeToUtc(dateKey: string, minutes: number, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day) + minutes * 60_000;

  let guess = target;
  for (let pass = 0; pass < 3; pass++) {
    const difference = target - wallClockAsUtc(new Date(guess), timeZone);
    if (difference === 0) {
      break;
    }
    guess += difference;
  }
  return new Date(guess);
}

/** A local date (YYYY-MM-DD) moved by whole days; calendar arithmetic, no time zone involved */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The instant the local day of `instant` begins in `timeZone`, moved by `days` whole local days
 * (0 = today, 1 = tomorrow). The server's own zone plays no part: "today" is the business' today.
 */
export function startOfLocalDay(instant: Date, timeZone: string, days = 0): Date {
  const { dateKey } = getLocalTimeParts(instant, timeZone);
  return localDateTimeToUtc(addDays(dateKey, days), 0, timeZone);
}
