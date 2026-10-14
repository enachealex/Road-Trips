// Trip dates are plain calendar strings ("2027-07-04") and times are "HH:MM" in the local
// time of wherever the event happens. Nothing is ever converted between time zones: a
// flight that leaves at 9:00 AM in Denver and lands at 2:30 PM in Boston shows exactly
// that, whoever is looking and wherever they are. All arithmetic runs on UTC midnights so
// daylight-saving changes cannot shift a day.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = parseDate(value);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]);
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const d = parseDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** The viewer's current local date and time, in the same string formats as trip data. */
export function nowLocal(now: Date = new Date()): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

function fmt(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(parseDate(value));
}

/** "Wed, Jul 8" */
export function formatDayShort(value: string): string {
  return fmt(value, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Wednesday, July 8, 2027" */
export function formatDayLong(value: string): string {
  return fmt(value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Jul 8, 2027" */
export function formatDateMedium(value: string): string {
  return fmt(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jul 1 – 14, 2027", "Jun 28 – Jul 3, 2027" or "Dec 28, 2026 – Jan 4, 2027". */
export function formatDateRange(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  if (start === end) return formatDateMedium(start);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${formatDateMedium(start)} – ${formatDateMedium(end)}`;
  }
  const year = a.getUTCFullYear();
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${fmt(start, { month: 'short', day: 'numeric' })} – ${b.getUTCDate()}, ${year}`;
  }
  return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric' })}, ${year}`;
}

/** "2:15 PM" (or "14:15" where the viewer's locale uses a 24-hour clock). */
export function formatTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(1970, 0, 1, h, m)),
  );
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * A real moment (an edit time, not a trip time) in the viewer's own zone:
 * "just now", "5 min ago", "3 hours ago", then "Jul 8, 2:15 PM".
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(then);
}

/** "3 days", "1 day" */
export function pluralDays(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
