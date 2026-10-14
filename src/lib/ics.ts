import { addDays, minutesOf } from './dates';
import { appliesTo } from './itinerary';
import { eventSubtitle, KINDS } from './kinds';
import type { Trip, TripEvent } from './types';

// iCalendar export. Times are written as "floating" local times (no time zone), which is
// exactly how the trip stores them: a 9:00 AM departure stays 9:00 AM in any calendar.

interface Entry {
  uid: string;
  summary: string;
  date: string;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string;
  description: string;
  stamp: string;
}

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Lines longer than 75 characters continue on the next line after a space (RFC 5545). */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(rest);
  return parts.join('\r\n ');
}

const icsDate = (date: string) => date.replace(/-/g, '');
const icsDateTime = (date: string, time: string) => `${icsDate(date)}T${time.replace(':', '')}00`;
const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function plusMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const total = minutesOf(time) + minutes;
  const days = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: addDays(date, days), time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}` };
}

function describe(event: TripEvent, eventUrl: string): string {
  const k = KINDS[event.kind];
  const lines = [k.label];
  const subtitle = eventSubtitle(event);
  if (subtitle) lines.push(subtitle);
  if (event.travelers.length) lines.push(`For: ${event.travelers.join(', ')}`);
  for (const field of k.details) {
    const value = event.details[field.key];
    if (value) lines.push(`${field.label}: ${value}`);
  }
  if (event.confirmation) lines.push(`Confirmation: ${event.confirmation}`);
  if (event.phone) lines.push(`Phone: ${event.phone}`);
  if (event.notes) lines.push('', event.notes);
  lines.push('', eventUrl);
  return lines.join('\n');
}

function entriesFor(event: TripEvent, eventUrl: string): Entry[] {
  const k = KINDS[event.kind];
  const where = event.address || event.location;
  const common = { description: describe(event, eventUrl), stamp: event.updatedAt || new Date().toISOString() };
  const spansDays = !!event.endDate && event.endDate > event.startDate;

  // A three-night hotel stay reads better as "Check-in" and "Check out" than as one long block.
  if (spansDays && (event.kind === 'lodging' || event.kind === 'car_rental')) {
    return [
      {
        ...common,
        uid: `${event.id}-start@roadbook`,
        summary: `${k.startLabel}: ${event.title}`,
        date: event.startDate,
        time: event.startTime,
        endDate: null,
        endTime: null,
        location: where,
      },
      {
        ...common,
        uid: `${event.id}-end@roadbook`,
        summary: `${k.endItemLabel}: ${event.title}`,
        date: event.endDate!,
        time: event.endTime,
        endDate: null,
        endTime: null,
        location: k.places === 'route' ? event.endAddress || event.endLocation || where : where,
      },
    ];
  }

  return [
    {
      ...common,
      uid: `${event.id}@roadbook`,
      summary: event.title,
      date: event.startDate,
      time: event.startTime,
      endDate: event.endDate,
      endTime: event.endTime,
      location: where,
    },
  ];
}

function vevent(e: Entry): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${icsStamp(e.stamp)}`];
  if (e.time) {
    lines.push(`DTSTART:${icsDateTime(e.date, e.time)}`);
    let end = e.endTime ? { date: e.endDate ?? e.date, time: e.endTime } : plusMinutes(e.date, e.time, 60);
    if (`${end.date}T${end.time}` <= `${e.date}T${e.time}`) end = plusMinutes(e.date, e.time, 60);
    lines.push(`DTEND:${icsDateTime(end.date, end.time)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(e.endDate && e.endDate > e.date ? e.endDate : e.date, 1))}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  lines.push(`DESCRIPTION:${escapeText(e.description)}`, 'END:VEVENT');
  return lines;
}

export function buildIcs(
  trip: Trip,
  events: TripEvent[],
  options: { traveler: string | null; eventUrl: (event: TripEvent) => string },
): string {
  const name = options.traveler ? `${trip.name} (${options.traveler})` : trip.name;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Roadbook//Trip itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const event of events) {
    if (!appliesTo(event, options.traveler)) continue;
    for (const entry of entriesFor(event, options.eventUrl(event))) lines.push(...vevent(entry));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsFilename(trip: Trip, traveler: string | null): string {
  const base = `${trip.name}${traveler ? ` ${traveler}` : ''}`
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base || 'trip'}.ics`;
}
