import { formatDistanceToNow, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

export const SWEDEN_TZ = 'Europe/Stockholm';

/**
 * Convert a wall-clock date + time — e.g. what a user picks in a date/time
 * picker, always meant as Europe/Stockholm local time regardless of the
 * viewer's own device timezone — into a UTC ISO string for the API.
 * Inverse of formatTime/formatDateTime: those always render stored UTC
 * instants as Stockholm time on the way out; this is the single point that
 * must anchor to Stockholm on the way in, so the two stay symmetric.
 * `date` is "yyyy-MM-dd", `time` is "HH:mm".
 */
export function stockholmToUtcIso(date: string, time: string): string {
  return fromZonedTime(`${date}T${time}:00`, SWEDEN_TZ).toISOString();
}

/**
 * Parse an ISO string or Date to a Date object.
 */
export function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value;
}

/**
 * Format a date in Swedish short format: 2026-05-27
 * Always rendered in Europe/Stockholm, regardless of viewer's device timezone.
 */
export function formatDateShort(value: string | Date): string {
  return formatInTimeZone(toDate(value), SWEDEN_TZ, 'yyyy-MM-dd');
}

/**
 * Format a date in Swedish long format: 27 maj 2026
 * Always rendered in Europe/Stockholm, regardless of viewer's device timezone.
 */
export function formatDateLong(value: string | Date): string {
  return formatInTimeZone(toDate(value), SWEDEN_TZ, 'd MMMM yyyy', { locale: sv });
}

/**
 * Format a date with day name: måndag 27 maj 2026
 * Always rendered in Europe/Stockholm, regardless of viewer's device timezone.
 */
export function formatDateFull(value: string | Date): string {
  return formatInTimeZone(toDate(value), SWEDEN_TZ, 'EEEE d MMMM yyyy', { locale: sv });
}

/**
 * Format a time: 10:30
 * Always rendered in Europe/Stockholm, regardless of viewer's device timezone.
 */
export function formatTime(value: string | Date): string {
  return formatInTimeZone(toDate(value), SWEDEN_TZ, 'HH:mm');
}

/**
 * Format date + time: 2026-05-27 10:30
 * Always rendered in Europe/Stockholm, regardless of viewer's device timezone.
 */
export function formatDateTime(value: string | Date): string {
  return formatInTimeZone(toDate(value), SWEDEN_TZ, 'yyyy-MM-dd HH:mm');
}

/**
 * Human-readable relative time in Swedish: "för 2 timmar sedan"
 */
export function formatRelativeTime(value: string | Date): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true, locale: sv });
}

/**
 * Smart date label: "Idag", "Imorgon", "Igår", or formatted date
 * Compares against "today" in Europe/Stockholm, not the viewer's device timezone.
 */
export function formatSmartDate(value: string | Date): string {
  const zoned = toZonedTime(toDate(value), SWEDEN_TZ);
  const zonedNow = toZonedTime(new Date(), SWEDEN_TZ);
  const tomorrowZoned = new Date(zonedNow);
  tomorrowZoned.setDate(tomorrowZoned.getDate() + 1);
  const yesterdayZoned = new Date(zonedNow);
  yesterdayZoned.setDate(yesterdayZoned.getDate() - 1);

  if (zoned.toDateString() === zonedNow.toDateString()) return 'Idag';
  if (zoned.toDateString() === tomorrowZoned.toDateString()) return 'Imorgon';
  if (zoned.toDateString() === yesterdayZoned.toDateString()) return 'Igår';
  return formatDateLong(value);
}

/**
 * Format a month: Maj 2026
 * Always rendered in Europe/Stockholm, regardless of viewer's device timezone.
 */
export function formatMonth(value: string | Date): string {
  return formatInTimeZone(toDate(value), SWEDEN_TZ, 'MMMM yyyy', { locale: sv });
}

/**
 * Format a duration in minutes as hours and minutes: "1 tim 30 min"
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} tim`;
  return `${hours} tim ${remaining} min`;
}
