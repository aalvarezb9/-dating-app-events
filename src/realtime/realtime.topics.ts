import { getLocalTimeParts } from '../scheduling/local-time';

/**
 * Names of the real-time signals that reach the UI over SSE.
 *
 * A topic is a dotted name of lowercase segments (`agenda.salon-angel.no-team.2030-06-20`). A subscriber
 * asks for a PATTERN: a segment can be a literal, `*` (any one segment) or, as the last one, `#` (the rest).
 * The same rules are used by whoever emits (to refuse a malformed name) and by the hub that fans the signals
 * out (to refuse a malformed or abusive subscription).
 */

/** One segment: lowercase letters, digits and hyphens (a subdomain, a UUID, a date, `no-team`…) */
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const MAX_TOPIC_SEGMENTS = 8;
export const MAX_TOPIC_LENGTH = 200;
export const WILDCARD_ONE = '*';
export const WILDCARD_REST = '#';

/** The signals about the agenda of a business: a booking was made, cancelled or moved */
export const AGENDA_NAMESPACE = 'agenda';
/** The segment of a booking that has no team member */
export const NO_TEAM = 'no-team';

/**
 * What an agenda signal says. It is a HINT: the UI answers it by asking the API again (availability, list…),
 * which decides what each person may see. It therefore carries no customer, no appointment id, no price.
 */
export interface AgendaSignal {
  /** `booked`: a slot was taken; `cancelled`: a slot is free; `moved`: it changed place; `updated`: same slot, new status */
  type: 'booked' | 'cancelled' | 'moved' | 'updated';
  memberId: string | null;
  /** ISO instants of the slot the signal is about */
  startsAt: string;
  endsAt: string;
}

const segmentsOf = (name: string): string[] => name.split('.');

/** Why a topic cannot be emitted, or null when it is a valid concrete topic */
export function validateTopic(topic: unknown): string | null {
  if (typeof topic !== 'string' || topic.length === 0) {
    return 'the topic is required';
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return `the topic is longer than ${MAX_TOPIC_LENGTH} characters`;
  }
  const segments = segmentsOf(topic);
  if (segments.length < 2 || segments.length > MAX_TOPIC_SEGMENTS) {
    return `a topic has between 2 and ${MAX_TOPIC_SEGMENTS} segments`;
  }
  if (!segments.every((segment) => SEGMENT.test(segment))) {
    return 'every segment is lowercase letters, digits and hyphens';
  }
  return null;
}

/** Why a pattern cannot be subscribed to, or null when it is valid */
export function validatePattern(pattern: unknown): string | null {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return 'the pattern is required';
  }
  if (pattern.length > MAX_TOPIC_LENGTH) {
    return `the pattern is longer than ${MAX_TOPIC_LENGTH} characters`;
  }
  const segments = segmentsOf(pattern);
  if (segments.length < 2 || segments.length > MAX_TOPIC_SEGMENTS) {
    return `a pattern has between 2 and ${MAX_TOPIC_SEGMENTS} segments`;
  }
  const lastIndex = segments.length - 1;
  for (const [index, segment] of segments.entries()) {
    if (segment === WILDCARD_REST) {
      if (index !== lastIndex) return '# can only be the last segment';
    } else if (segment !== WILDCARD_ONE && !SEGMENT.test(segment)) {
      return 'every segment is lowercase letters, digits and hyphens, or * or #';
    }
  }
  return null;
}

/** Whether a concrete topic matches a (valid) pattern */
export function topicMatches(pattern: string, topic: string): boolean {
  const wanted = segmentsOf(pattern);
  const actual = segmentsOf(topic);

  for (const [index, segment] of wanted.entries()) {
    if (segment === WILDCARD_REST) {
      return actual.length > index; // the rest: at least one more segment
    }
    if (index >= actual.length) return false;
    if (segment !== WILDCARD_ONE && segment !== actual[index]) return false;
  }
  return wanted.length === actual.length;
}

/**
 * Whether anyone (the public) may subscribe to this pattern: it has to be an agenda pattern that NAMES the
 * business. `agenda.*` or `agenda.#` would be a firehose of every business, so they are refused.
 */
export function isPublicAgendaPattern(pattern: string): boolean {
  if (validatePattern(pattern) !== null) return false;
  const [namespace, business] = segmentsOf(pattern);
  return namespace === AGENDA_NAMESPACE && business !== WILDCARD_ONE && business !== WILDCARD_REST;
}

/** `agenda.<subdomain>.<member|no-team>.<YYYY-MM-DD>` */
export function agendaTopic(subdomain: string, memberId: string | null, dateKey: string): string {
  return [AGENDA_NAMESPACE, subdomain.toLowerCase(), (memberId ?? NO_TEAM).toLowerCase(), dateKey].join('.');
}

const SIX_HOURS_MS = 6 * 3_600_000;

/**
 * The topics an appointment touches: one per local day (in the time zone of the business) between its start and
 * its end. A slot that crosses midnight is announced for both days, so a viewer of either one hears about it.
 */
export function agendaTopics(slot: { subdomain: string; memberId: string | null; startsAt: Date; endsAt: Date; timeZone: string }): string[] {
  const days = new Set<string>();
  const last = slot.endsAt.getTime() - 1;
  for (let t = slot.startsAt.getTime(); t < slot.endsAt.getTime(); t += SIX_HOURS_MS) {
    days.add(getLocalTimeParts(new Date(t), slot.timeZone).dateKey);
  }
  days.add(getLocalTimeParts(new Date(Math.max(last, slot.startsAt.getTime())), slot.timeZone).dateKey);
  return [...days].map((day) => agendaTopic(slot.subdomain, slot.memberId, day));
}
