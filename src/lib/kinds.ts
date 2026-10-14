import type { IconName } from '@/constants/icons';

import type { EventInput, EventKind, TripEvent } from './types';

export interface DetailField {
  key: string;
  label: string;
  placeholder?: string;
}

export interface KindConfig {
  label: string;
  icon: IconName;
  color: string;
  /** "route" kinds go from one place to another; "place" kinds happen at one place. */
  places: 'route' | 'place' | 'none';
  startLabel: string;
  endLabel: string;
  /** Shown on the later day when an event spans days, e.g. "Check out". */
  endItemLabel: string;
  fromLabel: string;
  toLabel: string;
  /** Lodging uses its title as the place name, so it only asks for an address. */
  askPlaceName: boolean;
  askPhone: boolean;
  askConfirmation: boolean;
  titlePlaceholder: string;
  details: readonly DetailField[];
}

const base = {
  places: 'place',
  startLabel: 'Starts',
  endLabel: 'Ends',
  endItemLabel: 'Ends',
  fromLabel: 'From',
  toLabel: 'To',
  askPlaceName: true,
  askPhone: false,
  askConfirmation: true,
  details: [],
} as const;

const transport = {
  ...base,
  places: 'route',
  startLabel: 'Departs',
  endLabel: 'Arrives',
  endItemLabel: 'Arrives',
} as const;

export const KINDS: Record<EventKind, KindConfig> = {
  flight: {
    ...transport,
    label: 'Flight',
    icon: 'flight',
    color: '#2F6FDB',
    endItemLabel: 'Lands',
    fromLabel: 'From airport',
    toLabel: 'To airport',
    titlePlaceholder: 'Leave blank to use the flight number',
    details: [
      { key: 'airline', label: 'Airline', placeholder: 'AA' },
      { key: 'flightNumber', label: 'Flight number', placeholder: '2311' },
      { key: 'terminal', label: 'Terminal / gate', placeholder: 'Terminal C' },
      { key: 'seats', label: 'Seats', placeholder: '22A–D' },
    ],
  },
  drive: {
    ...transport,
    label: 'Drive',
    icon: 'drive',
    color: '#C95A22',
    startLabel: 'Leave',
    endLabel: 'Arrive',
    endItemLabel: 'Arrive',
    askConfirmation: false,
    titlePlaceholder: 'Leave blank for “Drive to …”',
    details: [
      { key: 'driver', label: 'Driver', placeholder: 'Mom' },
      { key: 'distance', label: 'Distance', placeholder: '140 mi' },
    ],
  },
  train: {
    ...transport,
    label: 'Train',
    icon: 'train',
    color: '#7C4DCC',
    titlePlaceholder: 'Leave blank for “Train to …”',
    details: [
      { key: 'carrier', label: 'Railway', placeholder: 'Amtrak' },
      { key: 'number', label: 'Train number', placeholder: '5' },
      { key: 'seats', label: 'Seats / car', placeholder: 'Car 3, seats 12–15' },
    ],
  },
  bus: {
    ...transport,
    label: 'Bus',
    icon: 'bus',
    color: '#0F8584',
    titlePlaceholder: 'Leave blank for “Bus to …”',
    details: [
      { key: 'carrier', label: 'Company', placeholder: 'Greyhound' },
      { key: 'seats', label: 'Seats', placeholder: '' },
    ],
  },
  ferry: {
    ...transport,
    label: 'Ferry',
    icon: 'ferry',
    color: '#1A86B5',
    titlePlaceholder: 'Leave blank for “Ferry to …”',
    details: [
      { key: 'carrier', label: 'Operator', placeholder: 'Washington State Ferries' },
      { key: 'seats', label: 'Cabin / vehicle', placeholder: '' },
    ],
  },
  car_rental: {
    ...transport,
    label: 'Car rental',
    icon: 'carRental',
    color: '#A86B12',
    startLabel: 'Pick up',
    endLabel: 'Return',
    endItemLabel: 'Return car',
    fromLabel: 'Pick-up location',
    toLabel: 'Return location',
    askPhone: true,
    titlePlaceholder: 'Leave blank to use the company name',
    details: [
      { key: 'company', label: 'Company', placeholder: 'Hertz' },
      { key: 'vehicle', label: 'Vehicle', placeholder: 'Minivan' },
    ],
  },
  transit: {
    ...transport,
    label: 'Other transport',
    icon: 'transit',
    color: '#56606E',
    titlePlaceholder: 'Shuttle to the hotel',
    details: [{ key: 'provider', label: 'Provider', placeholder: 'Uber, taxi, shuttle…' }],
  },
  lodging: {
    ...base,
    label: 'Lodging',
    icon: 'lodging',
    color: '#4B53BC',
    startLabel: 'Check-in',
    endLabel: 'Check-out',
    endItemLabel: 'Check out',
    askPlaceName: false,
    askPhone: true,
    titlePlaceholder: 'Hotel, rental or campground name',
  },
  activity: {
    ...base,
    label: 'Activity',
    icon: 'activity',
    color: '#2E7D4F',
    askPhone: true,
    titlePlaceholder: 'Aquarium visit',
  },
  meal: {
    ...base,
    label: 'Meal',
    icon: 'meal',
    color: '#C03A67',
    askPhone: true,
    titlePlaceholder: 'Dinner reservation',
  },
  note: {
    ...base,
    places: 'none',
    label: 'Note',
    icon: 'note',
    color: '#77705F',
    startLabel: 'Date',
    endLabel: 'Until',
    askConfirmation: false,
    titlePlaceholder: 'Pack swimsuits',
  },
};

export const KIND_ORDER: EventKind[] = [
  'flight', 'drive', 'lodging', 'car_rental', 'activity', 'meal',
  'train', 'bus', 'ferry', 'transit', 'note',
];

/** A title for events saved without one, e.g. "AA 2311" or "Drive to Monterey". */
export function fallbackTitle(e: Pick<EventInput, 'kind' | 'details' | 'location' | 'endLocation'>): string {
  const k = KINDS[e.kind];
  const d = e.details;
  if (e.kind === 'flight') {
    const code = [d.airline, d.flightNumber].filter(Boolean).join(' ');
    if (code) return code;
  }
  if (e.kind === 'car_rental' && d.company) return `${d.company} rental`;
  if (k.places === 'route' && e.endLocation) return `${k.label} to ${e.endLocation}`;
  if (k.places === 'place' && e.location) return e.location;
  return k.label;
}

/** One line under the title: "DFW → SFO" or the place. */
export function eventSubtitle(e: TripEvent): string {
  const k = KINDS[e.kind];
  if (k.places === 'route') {
    if (e.location && e.endLocation) return `${e.location} → ${e.endLocation}`;
    return e.endLocation ? `To ${e.endLocation}` : e.location;
  }
  if (k.places === 'place') {
    return e.location && e.location !== e.title ? e.location : e.address;
  }
  return '';
}

/** What to search for on a map for a single-place event. */
export function mapQuery(e: TripEvent): string {
  if (e.address) return e.location && e.location !== e.title ? `${e.location}, ${e.address}` : `${e.title}, ${e.address}`;
  return e.location || e.title;
}
