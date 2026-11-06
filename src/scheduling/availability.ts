import { DateRangeContract, DayBreakContract } from '../contracts/catalog.contracts';
import { DayOfWeek, getLocalTimeParts, timeToMinutes } from './local-time';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Hours per weekday, by shape: the contract (`WeeklyHoursContract`) and the types of each service's own
 * entities both fit, whether they index by any string or name the seven days.
 */
export type WeeklyHoursInput = {
  [day in DayOfWeek]?: { open: string; close: string; closed: boolean; breaks?: DayBreakContract[] } | undefined;
};

export interface AvailabilityCheck {
  /** Appointment start (instant) */
  start: Date;
  durationMinutes: number;
  /** Business IANA time zone, e.g. America/Tegucigalpa */
  timeZone: string;
  /** Business hours per weekday. null/undefined or a missing day => not configured, no restriction */
  businessHours?: WeeklyHoursInput | null;
  /** Days the whole business is closed (holidays, vacations) */
  closures?: DateRangeContract[] | null;
  /** Service availability window ('HH:mm'). Both empty => the service is available all day */
  serviceStartTime?: string | null;
  serviceEndTime?: string | null;
  /** The person who attends: their own days, hours, breaks and leave. null/undefined => the business agenda */
  member?: { workingHours?: WeeklyHoursInput | null; timeOff?: DateRangeContract[] | null } | null;
}

/** Why an appointment does not fit; each service turns it into its own error key */
export type AvailabilityViolation =
  | 'BUSINESS_CLOSED'
  | 'OUTSIDE_BUSINESS_HOURS'
  | 'DURING_BREAK'
  | 'OUTSIDE_SERVICE_WINDOW'
  | 'MEMBER_ON_TIME_OFF'
  | 'MEMBER_NOT_WORKING'
  | 'MEMBER_OUTSIDE_WORKING_HOURS';

const isInside = (dateKey: string, ranges?: DateRangeContract[] | null): boolean =>
  !!ranges?.some((range) => dateKey >= range.from && dateKey <= range.to);

/** The appointment [start, end) overlaps a pause of the day (touching its edges is fine) */
const overlapsBreak = (start: number, end: number, breaks?: DayBreakContract[]): boolean =>
  !!breaks?.some((pause) => start < timeToMinutes(pause.end) && end > timeToMinutes(pause.start));

/**
 * The first rule the appointment breaks, or null when it fits. THE rule of the agenda, shared by
 * whoever takes a booking (business-owner, a quick answer for the owner) and by the arbiter
 * (schedule, the answer that counts), so both say the same:
 * - not on a day the business is closed (holidays, vacations) nor inside the hours of its weekday,
 *   and not across a break of that day;
 * - inside the service availability window, when the service defines one;
 * - when a member attends: on a day, inside the hours and outside the breaks and leave of that member.
 *
 * Every constraint applies together: a service window or a member can only narrow the business hours.
 * Only configured limits are enforced: with no hours and no window nothing is rejected.
 * An appointment that runs past midnight can never fit a same-day closing time or window,
 * so it is rejected by those limits (there is no separate rule for it).
 */
export function findAvailabilityViolation(check: AvailabilityCheck): AvailabilityViolation | null {
  const { start, durationMinutes, timeZone, businessHours, serviceStartTime, serviceEndTime } = check;

  const local = getLocalTimeParts(start, timeZone);
  const startMinutes = local.minutes;
  const endMinutes = startMinutes + durationMinutes;

  if (isInside(local.dateKey, check.closures)) {
    return 'BUSINESS_CLOSED';
  }

  const dayHours = businessHours?.[local.weekday];
  if (dayHours) {
    if (dayHours.closed) {
      return 'BUSINESS_CLOSED';
    }

    const open = timeToMinutes(dayHours.open);
    // '00:00' as closing time means "until midnight"
    const close = dayHours.close === '00:00' ? MINUTES_PER_DAY : timeToMinutes(dayHours.close);

    if (startMinutes < open || endMinutes > close) {
      return 'OUTSIDE_BUSINESS_HOURS';
    }

    if (overlapsBreak(startMinutes, endMinutes, dayHours.breaks)) {
      return 'DURING_BREAK';
    }
  }

  if (serviceStartTime && serviceEndTime) {
    if (startMinutes < timeToMinutes(serviceStartTime) || endMinutes > timeToMinutes(serviceEndTime)) {
      return 'OUTSIDE_SERVICE_WINDOW';
    }
  }

  return findMemberViolation(check.member, local, endMinutes);
}

/** The member's own agenda: a day they do not work, hours outside theirs, a break of theirs or leave */
function findMemberViolation(
  member: AvailabilityCheck['member'],
  local: ReturnType<typeof getLocalTimeParts>,
  endMinutes: number,
): AvailabilityViolation | null {
  if (!member) {
    return null;
  }

  if (isInside(local.dateKey, member.timeOff)) {
    return 'MEMBER_ON_TIME_OFF';
  }

  const memberDay = member.workingHours?.[local.weekday];
  if (!memberDay) {
    return null; // no entry for that weekday: the business hours rule
  }

  if (memberDay.closed) {
    return 'MEMBER_NOT_WORKING';
  }

  const open = timeToMinutes(memberDay.open);
  const close = memberDay.close === '00:00' ? MINUTES_PER_DAY : timeToMinutes(memberDay.close);
  if (local.minutes < open || endMinutes > close) {
    return 'MEMBER_OUTSIDE_WORKING_HOURS';
  }

  if (overlapsBreak(local.minutes, endMinutes, memberDay.breaks)) {
    return 'DURING_BREAK';
  }

  return null;
}
