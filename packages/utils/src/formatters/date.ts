import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

export const SWEDEN_TZ = 'Europe/Stockholm';

/**
 * Parse an ISO string or Date to a Date object.
 */
export function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value;
}

/**
 * Format a date in Swedish short format: 2026-05-27
 */
export function formatDateShort(value: string | Date): string {
  return format(toDate(value), 'yyyy-MM-dd');
}

/**
 * Format a date in Swedish long format: 27 maj 2026
 */
export function formatDateLong(value: string | Date): string {
  return format(toDate(value), 'd MMMM yyyy', { locale: sv });
}

/**
 * Format a date with day name: måndag 27 maj 2026
 */
export function formatDateFull(value: string | Date): string {
  return format(toDate(value), 'EEEE d MMMM yyyy', { locale: sv });
}

/**
 * Format a time: 10:30
 */
export function formatTime(value: string | Date): string {
  return format(toDate(value), 'HH:mm');
}

/**
 * Format date + time: 2026-05-27 10:30
 */
export function formatDateTime(value: string | Date): string {
  return format(toDate(value), 'yyyy-MM-dd HH:mm');
}

/**
 * Human-readable relative time in Swedish: "för 2 timmar sedan"
 */
export function formatRelativeTime(value: string | Date): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true, locale: sv });
}

/**
 * Smart date label: "Idag", "Imorgon", "Igår", or formatted date
 */
export function formatSmartDate(value: string | Date): string {
  const date = toDate(value);
  if (isToday(date)) return 'Idag';
  if (isTomorrow(date)) return 'Imorgon';
  if (isYesterday(date)) return 'Igår';
  return formatDateLong(date);
}

/**
 * Format a month: Maj 2026
 */
export function formatMonth(value: string | Date): string {
  return format(toDate(value), 'MMMM yyyy', { locale: sv });
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
