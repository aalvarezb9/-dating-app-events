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

/** Local weekday, date and minute-of-day of an instant in the given time zone */
export function getLocalTimeParts(date: Date, timeZone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)!.value;

  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday').toLowerCase() as DayOfWeek,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}
