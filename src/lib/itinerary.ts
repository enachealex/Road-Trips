import { addDays, daysBetween, minutesOf } from './dates';
import type { Trip, TripEvent } from './types';

export interface ItineraryItem {
  key: string;
  /**
   * "start" is the event itself. "end" is its closing moment when that falls on a later
   * day: check-out, an overnight flight's arrival, returning a rental car.
   */
  part: 'start' | 'end';
  event: TripEvent;
  time: string | null;
}

export interface ItineraryDay {
  date: string;
  /** 1-based day of the trip, or null for a date outside the trip's range. */
  dayNumber: number | null;
  items: ItineraryItem[];
  /** Lodging booked for the night of this date. */
  tonight: TripEvent[];
}

export type TripStatus =
  | { phase: 'upcoming'; daysUntil: number }
  | { phase: 'ongoing'; dayNumber: number }
  | { phase: 'past' };

type TripDates = Pick<Trip, 'startDate' | 'endDate'>;

export function tripLength(trip: TripDates): number {
  return daysBetween(trip.startDate, trip.endDate) + 1;
}

export function tripStatus(trip: TripDates, today: string): TripStatus {
  if (today < trip.startDate) return { phase: 'upcoming', daysUntil: daysBetween(today, trip.startDate) };
  if (today > trip.endDate) return { phase: 'past' };
  return { phase: 'ongoing', dayNumber: daysBetween(trip.startDate, today) + 1 };
}

/** Events with no travelers listed apply to everyone. */
export function appliesTo(event: TripEvent, traveler: string | null): boolean {
  if (!traveler || event.travelers.length === 0) return true;
  const name = traveler.toLowerCase();
  return event.travelers.some((t) => t.toLowerCase() === name);
}

function sortKey(item: ItineraryItem): number {
  if (item.time) return minutesOf(item.time);
  if (item.part === 'end') return -2; // untimed check-out or arrival: first thing
  if (item.event.kind === 'lodging') return 24 * 60; // untimed check-in: end of the day
  return -1; // notes and all-day plans
}

/**
 * Lays the trip out day by day. Every date of the trip gets a day, even an empty one, so
 * gaps in the plan are visible. Events dated outside the trip get their own days too.
 */
export function buildItinerary(trip: Trip, events: TripEvent[], traveler: string | null = null): ItineraryDay[] {
  const days = new Map<string, ItineraryDay>();
  const dayFor = (date: string) => {
    let day = days.get(date);
    if (!day) {
      const inTrip = date >= trip.startDate && date <= trip.endDate;
      day = { date, dayNumber: inTrip ? daysBetween(trip.startDate, date) + 1 : null, items: [], tonight: [] };
      days.set(date, day);
    }
    return day;
  };

  for (let date = trip.startDate; date <= trip.endDate; date = addDays(date, 1)) dayFor(date);

  const visible = events.filter((e) => appliesTo(e, traveler));
  for (const event of visible) {
    dayFor(event.startDate).items.push({ key: event.id, part: 'start', event, time: event.startTime });
    if (event.endDate && event.endDate > event.startDate) {
      dayFor(event.endDate).items.push({ key: `${event.id}:end`, part: 'end', event, time: event.endTime });
    }
  }

  const lodging = visible.filter((e) => e.kind === 'lodging');
  for (const day of days.values()) {
    day.items.sort((a, b) => sortKey(a) - sortKey(b) || a.event.title.localeCompare(b.event.title));
    day.tonight = lodging.filter((e) =>
      e.endDate && e.endDate > e.startDate
        ? e.startDate <= day.date && day.date < e.endDate
        : e.startDate === day.date,
    );
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The next thing on the schedule from the viewer's current local date and time. */
export function findNextUp(
  days: ItineraryDay[],
  now: { date: string; time: string },
): { day: ItineraryDay; item: ItineraryItem } | null {
  for (const day of days) {
    if (day.date < now.date) continue;
    for (const item of day.items) {
      if (item.event.kind === 'note') continue;
      if (day.date > now.date || (item.time !== null && item.time >= now.time)) return { day, item };
    }
  }
  return null;
}
