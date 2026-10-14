import { describe, expect, it } from 'vitest';

import { buildIcs, icsFilename } from './ics';
import { fallbackTitle } from './kinds';
import { slugFromInput } from './links';
import { buildSampleTrip } from './sample-trip';
import type { Trip, TripEvent } from './types';

const sample = buildSampleTrip('2027-07-03');
const trip: Trip = { ...sample.trip, slug: 'abc', createdAt: '', updatedAt: '' };
const events: TripEvent[] = sample.events.map((e, i) => ({
  ...e,
  id: `id${i}`,
  createdAt: '2027-01-01T00:00:00Z',
  updatedAt: '2027-01-02T10:00:00Z',
  deletedAt: null,
}));
const eventUrl = (e: TripEvent) => `https://x/trip/abc/event/${e.id}`;

describe('calendar export', () => {
  const ics = buildIcs(trip, events, { traveler: null, eventUrl });
  const lines = ics.split('\r\n');

  it('is a well-formed calendar with folded lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines.every((l) => l.length <= 75)).toBe(true);
  });

  it('splits multi-day stays and rentals into start and end entries', () => {
    const lodging = events.filter((e) => e.kind === 'lodging').length;
    const rentals = events.filter((e) => e.kind === 'car_rental').length;
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(events.length + lodging + rentals);
    expect(ics).toContain('SUMMARY:Check-in: Hotel Zephyr');
    expect(ics).toContain('SUMMARY:Check out: Hotel Zephyr');
    expect(ics).toContain('SUMMARY:Return car: Minivan from Hertz');
  });

  it('writes floating local times and all-day dates', () => {
    expect(ics).toContain('DTSTART:20270701T074500\r\nDTEND:20270701T092000');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270701\r\nDTEND;VALUE=DATE:20270702');
    expect(ics).toContain('DTSTART:20270709T080000\r\nDTEND:20270710T220000');
  });

  it('escapes commas', () => {
    expect(ics).toContain(String.raw`LOCATION:250 Beach St\, San Francisco\, CA`);
  });

  it('exports one person’s plan', () => {
    const grandma = buildIcs(trip, events, { traveler: 'Grandma', eventUrl });
    expect(grandma).toContain('UA 1180');
    expect(grandma).not.toContain('AA 2311');
    expect(grandma).toContain('X-WR-CALNAME:Pacific Coast Road Trip (Grandma)');
    expect(icsFilename(trip, 'Grandma')).toBe('pacific-coast-road-trip-grandma.ics');
  });
});

describe('helpers', () => {
  it('titles events saved without one', () => {
    const base = { details: {}, location: '', endLocation: '' };
    expect(fallbackTitle({ ...base, kind: 'flight', details: { airline: 'DL', flightNumber: '88' } })).toBe('DL 88');
    expect(fallbackTitle({ ...base, kind: 'drive', endLocation: 'Moab' })).toBe('Drive to Moab');
    expect(fallbackTitle({ ...base, kind: 'car_rental', details: { company: 'Hertz' } })).toBe('Hertz rental');
    expect(fallbackTitle({ ...base, kind: 'lodging' })).toBe('Lodging');
  });

  it('reads trip codes out of pasted links', () => {
    expect(slugFromInput('https://roadtrip.thejumpvault.com/trip/f9a2708a2e560dd3/event/x')).toBe('f9a2708a2e560dd3');
    expect(slugFromInput(' f9a2708a2e560dd3 ')).toBe('f9a2708a2e560dd3');
    expect(slugFromInput('hello world')).toBeNull();
  });
});
