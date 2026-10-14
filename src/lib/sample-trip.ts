import { addDays, nowLocal } from './dates';
import type { EventInput, TripInput } from './types';

/**
 * A 12-day coast road trip that started two days ago, so a fresh sample shows the
 * "today" and "next up" views straight away.
 */
export function buildSampleTrip(today: string = nowLocal().date): { trip: TripInput; events: EventInput[] } {
  const d = (offset: number) => addDays(today, offset - 2);
  const family = ['Mom', 'Dad', 'Maya', 'Leo'];

  const ev = (e: Partial<EventInput> & Pick<EventInput, 'kind' | 'title' | 'startDate'>): EventInput => ({
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
    updatedBy: 'Sample',
    ...e,
  });

  return {
    trip: {
      name: 'Pacific Coast Road Trip',
      startDate: d(0),
      endDate: d(11),
      travelers: [...family, 'Grandma'],
      notes:
        'San Francisco to Los Angeles down Highway 1.\n\nGrandma flies in separately on day 1 and heads home from LA on the last day. ' +
        'Emergency contact: Aunt Rosa (555) 201-4433.',
    },
    events: [
      ev({ kind: 'note', title: 'Pack layers, the coast is cold in the mornings', startDate: d(0) }),
      ev({
        kind: 'flight', title: 'AA 2311', startDate: d(0), startTime: '07:45', endDate: d(0), endTime: '09:20',
        location: 'DFW', endLocation: 'SFO', confirmation: 'QXR7TL', travelers: family,
        details: { airline: 'AA', flightNumber: '2311', seats: '22A–D', terminal: 'Terminal C' },
      }),
      ev({
        kind: 'flight', title: 'UA 1180', startDate: d(0), startTime: '10:05', endDate: d(0), endTime: '12:30',
        location: 'ORD', endLocation: 'SFO', confirmation: 'MM4K2P', travelers: ['Grandma'],
        details: { airline: 'UA', flightNumber: '1180', seats: '8C' },
        notes: 'Dad picks Grandma up at arrivals, door 9.',
      }),
      ev({
        kind: 'car_rental', title: 'Minivan from Hertz', startDate: d(0), startTime: '10:30', endDate: d(11), endTime: '09:00',
        location: 'SFO Rental Car Center', endLocation: 'LAX Rental Car Return', confirmation: 'H-55190823',
        phone: '(800) 654-3131', details: { company: 'Hertz', vehicle: 'Toyota Sienna or similar' },
        notes: 'One-way rental. Return with a full tank.',
      }),
      ev({
        kind: 'lodging', title: 'Hotel Zephyr', startDate: d(0), startTime: '15:00', endDate: d(2), endTime: '11:00',
        location: 'Hotel Zephyr', address: '250 Beach St, San Francisco, CA', confirmation: '88412-ZP',
        phone: '(415) 617-6565', notes: 'Two rooms, adjoining.',
      }),
      ev({
        kind: 'meal', title: 'Dinner at the wharf', startDate: d(0), startTime: '18:30',
        location: 'Scoma’s', address: '1965 Al Scoma Way, San Francisco, CA', notes: 'Reservation for 5 under Dad.',
      }),
      ev({
        kind: 'activity', title: 'Bike across the Golden Gate', startDate: d(1), startTime: '09:30', endTime: '13:00',
        location: 'Blazing Saddles', address: '2715 Hyde St, San Francisco, CA', confirmation: 'BS-30021',
        travelers: family, notes: 'Grandma meets us in Sausalito by ferry.',
      }),
      ev({
        kind: 'ferry', title: 'Sausalito ferry', startDate: d(1), startTime: '11:15', endTime: '11:45',
        location: 'Ferry Building', endLocation: 'Sausalito Ferry Terminal', travelers: ['Grandma'],
        details: { carrier: 'Golden Gate Ferry' },
      }),
      ev({
        kind: 'drive', title: 'Drive to Monterey', startDate: d(2), startTime: '11:30', endTime: '14:00',
        location: 'Hotel Zephyr, San Francisco', endLocation: 'Monterey, CA', details: { distance: '120 mi', driver: 'Mom' },
      }),
      ev({
        kind: 'activity', title: 'Monterey Bay Aquarium', startDate: d(2), startTime: '14:30', endTime: '17:30',
        location: 'Monterey Bay Aquarium', address: '886 Cannery Row, Monterey, CA', confirmation: 'Tickets in Dad’s email',
      }),
      ev({
        kind: 'lodging', title: 'Monterey Tides', startDate: d(2), startTime: '16:00', endDate: d(4), endTime: '11:00',
        location: 'Monterey Tides', address: '2600 Sand Dunes Dr, Monterey, CA', confirmation: 'MT-7731',
      }),
      ev({
        kind: 'activity', title: '17-Mile Drive & beach day', startDate: d(3),
        location: 'Carmel Beach', address: 'Carmel-by-the-Sea, CA',
      }),
      ev({
        kind: 'drive', title: 'Big Sur on Highway 1', startDate: d(4), startTime: '10:00', endTime: '16:00',
        location: 'Monterey, CA', endLocation: 'San Luis Obispo, CA', details: { distance: '140 mi', driver: 'Dad' },
        notes: 'No cell signal for most of Big Sur. Lunch stop at Nepenthe. Fill up the tank in Carmel.',
      }),
      ev({
        kind: 'lodging', title: 'Madonna Inn', startDate: d(4), endDate: d(5),
        location: 'Madonna Inn', address: '100 Madonna Rd, San Luis Obispo, CA', confirmation: '30019',
      }),
      ev({
        kind: 'drive', title: 'Drive to Santa Barbara', startDate: d(5), startTime: '10:30',
        location: 'San Luis Obispo, CA', endLocation: 'Santa Barbara, CA', details: { distance: '95 mi' },
      }),
      ev({
        kind: 'lodging', title: 'Beach house rental', startDate: d(5), startTime: '16:00', endDate: d(7), endTime: '10:00',
        location: 'Beach house', address: '15 Butterfly Ln, Santa Barbara, CA', notes: 'Door code is in the group chat.',
      }),
      ev({
        kind: 'drive', title: 'Drive to Los Angeles', startDate: d(7), startTime: '10:30', endTime: '13:00',
        location: 'Santa Barbara, CA', endLocation: 'Anaheim, CA', details: { distance: '125 mi', driver: 'Mom' },
      }),
      ev({
        kind: 'lodging', title: 'Disneyland Hotel', startDate: d(7), startTime: '15:00', endDate: d(10), endTime: '11:00',
        location: 'Disneyland Hotel', address: '1150 Magic Way, Anaheim, CA', confirmation: 'DL-448210',
      }),
      ev({
        kind: 'activity', title: 'Disneyland', startDate: d(8), startTime: '08:00', endDate: d(9), endTime: '22:00',
        location: 'Disneyland Park', address: '1313 Disneyland Dr, Anaheim, CA',
        notes: 'Two-day park hopper tickets for everyone.',
      }),
      ev({
        kind: 'lodging', title: 'Airport hotel', startDate: d(10), startTime: '16:00', endDate: d(11), endTime: '06:00',
        location: 'Hilton LAX', address: '5711 W Century Blvd, Los Angeles, CA',
      }),
      ev({
        kind: 'flight', title: 'AA 1452', startDate: d(11), startTime: '11:10', endDate: d(11), endTime: '16:25',
        location: 'LAX', endLocation: 'DFW', confirmation: 'QXR7TL', travelers: family,
        details: { airline: 'AA', flightNumber: '1452', terminal: 'Terminal 4' },
      }),
      ev({
        kind: 'flight', title: 'UA 2207', startDate: d(11), startTime: '12:40', endDate: d(11), endTime: '18:55',
        location: 'LAX', endLocation: 'ORD', confirmation: 'MM4K2P', travelers: ['Grandma'],
        details: { airline: 'UA', flightNumber: '2207' },
      }),
    ],
  };
}
