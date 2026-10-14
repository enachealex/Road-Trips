import { describe, expect, it } from 'vitest';

import { buildCompleted, buildItinerary, findNextUp, finishesAt, isCompleted, tripLength, tripStatus } from './itinerary';
import type { Trip, TripEvent } from './types';

const trip: Trip = {
  slug: 's',
  name: 'T',
  startDate: '2027-07-01',
  endDate: '2027-07-05',
  travelers: ['Alex', 'Mom'],
  notes: '',
  createdAt: '',
  updatedAt: '',
};

const ev = (e: Partial<TripEvent> & Pick<TripEvent, 'id' | 'kind' | 'title' | 'startDate'>): TripEvent => ({
  startTime: null,
  endDate: null,
  endTime: null,
  location: '',
  address: '',
  endLocation: '',
  endAddress: '',
  confirmation: '',
  url: '',
  phone: '',
  notes: '',
  travelers: [],
  details: {},
  updatedBy: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...e,
});

const events = [
  ev({ id: 'hotel', kind: 'lodging', title: 'Hotel', startDate: '2027-07-01', endDate: '2027-07-03', endTime: '11:00' }),
  ev({ id: 'cabin', kind: 'lodging', title: 'Cabin', startDate: '2027-07-03', endDate: '2027-07-05' }),
  ev({
    id: 'redeye',
    kind: 'flight',
    title: 'Red-eye',
    startDate: '2027-07-01',
    startTime: '22:00',
    endDate: '2027-07-02',
    endTime: '06:10',
    travelers: ['Alex'],
  }),
  ev({ id: 'note', kind: 'note', title: 'Pack', startDate: '2027-07-01' }),
  ev({ id: 'drive', kind: 'drive', title: 'Drive', startDate: '2027-07-03', startTime: '09:00' }),
  ev({ id: 'early', kind: 'activity', title: 'Pre-trip dinner', startDate: '2027-06-28', startTime: '18:00' }),
];

describe('buildItinerary', () => {
  const days = buildItinerary(trip, events);

  it('has every trip day, plus days for events outside the trip', () => {
    expect(days.map((d) => [d.date, d.dayNumber])).toEqual([
      ['2027-06-28', null],
      ['2027-07-01', 1],
      ['2027-07-02', 2],
      ['2027-07-03', 3],
      ['2027-07-04', 4],
      ['2027-07-05', 5],
    ]);
  });

  it('orders a day: untimed notes first, timed items, untimed check-in last', () => {
    expect(days[1].items.map((i) => i.key)).toEqual(['note', 'redeye', 'hotel']);
    expect(days[3].items.map((i) => i.key)).toEqual(['drive', 'hotel:end', 'cabin']);
  });

  it('puts the end of multi-day events on their last day', () => {
    expect(days[2].items.map((i) => i.key)).toEqual(['redeye:end']);
    expect(days[5].items[0].key).toBe('cabin:end');
  });

  it('knows where everyone sleeps each night', () => {
    expect(days.map((d) => d.tonight.map((e) => e.id).join(','))).toEqual(['', 'hotel', 'hotel', 'cabin', 'cabin', '']);
  });

  it('filters to one person, case-insensitively', () => {
    const mom = buildItinerary(trip, events, 'mom');
    expect(mom.some((d) => d.items.some((i) => i.event.id === 'redeye'))).toBe(false);
    const alex = buildItinerary(trip, events, 'ALEX');
    expect(alex[1].items.some((i) => i.key === 'redeye')).toBe(true);
  });
});

describe('completed', () => {
  it('knows when each kind of event is over', () => {
    const at = (date: string, time: string) => ({ date, time });
    const hotel = events.find((e) => e.id === 'hotel')!; // checks out Jul 3, 11:00
    expect(isCompleted(hotel, at('2027-07-03', '10:59'))).toBe(false);
    expect(isCompleted(hotel, at('2027-07-03', '11:00'))).toBe(true);
    const drive = events.find((e) => e.id === 'drive')!; // 09:00, no end: done an hour later
    expect(finishesAt(drive)).toEqual({ date: '2027-07-03', time: '10:00' });
    expect(isCompleted(drive, at('2027-07-03', '09:30'))).toBe(false);
    const note = events.find((e) => e.id === 'note')!; // untimed: done once the day is over
    expect(isCompleted(note, at('2027-07-01', '23:59'))).toBe(false);
    expect(isCompleted(note, at('2027-07-02', '00:00'))).toBe(true);
    const cabin = events.find((e) => e.id === 'cabin')!; // untimed multi-day: end of its last day
    expect(finishesAt(cabin)).toEqual({ date: '2027-07-05', time: null });
  });

  it('lists what has happened, most recent day first', () => {
    const done = buildCompleted(trip, events, { date: '2027-07-03', time: '12:00' });
    expect(done.map((d) => [d.date, d.dayNumber, d.events.map((e) => e.id)])).toEqual([
      ['2027-07-03', 3, ['drive']],
      ['2027-07-01', 1, ['note', 'redeye', 'hotel']],
      ['2027-06-28', null, ['early']],
    ]);
    const forMom = buildCompleted(trip, events, { date: '2027-07-03', time: '12:00' }, 'Mom');
    expect(forMom.flatMap((d) => d.events.map((e) => e.id))).not.toContain('redeye');
  });
});

describe('trip status and next up', () => {
  it('reports upcoming, ongoing and past', () => {
    expect(tripStatus(trip, '2027-06-20')).toEqual({ phase: 'upcoming', daysUntil: 11 });
    expect(tripStatus(trip, '2027-07-03')).toEqual({ phase: 'ongoing', dayNumber: 3 });
    expect(tripStatus(trip, '2027-07-06')).toEqual({ phase: 'past' });
    expect(tripLength(trip)).toBe(5);
  });

  it('finds the next thing after the current time', () => {
    const days = buildItinerary(trip, events);
    expect(findNextUp(days, { date: '2027-07-01', time: '12:00' })?.item.key).toBe('redeye');
    expect(findNextUp(days, { date: '2027-07-01', time: '23:00' })?.item.key).toBe('redeye:end');
    expect(findNextUp(days, { date: '2027-07-03', time: '10:00' })?.item.key).toBe('hotel:end');
    expect(findNextUp(days, { date: '2027-07-06', time: '10:00' })).toBeNull();
  });
});
