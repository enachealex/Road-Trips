import type { SymbolViewProps } from 'expo-symbols';

type SymbolName = Exclude<SymbolViewProps['name'], string>;

const icon = (ios: NonNullable<SymbolName['ios']>, material: NonNullable<SymbolName['web']>): SymbolName => ({
  ios,
  android: material,
  web: material,
});

/** SF Symbols on iOS, Material Symbols on Android and web. */
export const Icons = {
  // Event kinds
  flight: icon('airplane', 'flight'),
  drive: icon('car.fill', 'directions_car'),
  train: icon('tram.fill', 'train'),
  bus: icon('bus.fill', 'directions_bus'),
  ferry: icon('ferry.fill', 'directions_boat'),
  carRental: icon('key.fill', 'car_rental'),
  transit: icon('arrow.left.arrow.right', 'local_taxi'),
  lodging: icon('bed.double.fill', 'hotel'),
  activity: icon('ticket.fill', 'local_activity'),
  meal: icon('fork.knife', 'restaurant'),
  note: icon('note.text', 'sticky_note_2'),

  // Costs and lists
  fuel: icon('fuelpump.fill', 'local_gas_station'),
  cart: icon('cart.fill', 'shopping_cart'),
  bag: icon('bag.fill', 'shopping_bag'),
  receipt: icon('doc.text', 'receipt_long'),
  money: icon('dollarsign.circle', 'payments'),
  checklist: icon('checklist', 'checklist'),
  boxEmpty: icon('square', 'check_box_outline_blank'),
  boxChecked: icon('checkmark.square.fill', 'check_box'),
  arrowRight: icon('arrow.right', 'arrow_forward'),

  // Interface
  add: icon('plus', 'add'),
  back: icon('chevron.left', 'arrow_back'),
  calendar: icon('calendar', 'calendar_today'),
  call: icon('phone.fill', 'call'),
  chat: icon('bubble.left.and.bubble.right.fill', 'forum'),
  check: icon('checkmark', 'check'),
  chevronDown: icon('chevron.down', 'expand_more'),
  chevronRight: icon('chevron.right', 'chevron_right'),
  clock: icon('clock', 'schedule'),
  close: icon('xmark', 'close'),
  copy: icon('doc.on.doc', 'content_copy'),
  delete: icon('trash', 'delete'),
  directions: icon('arrow.triangle.turn.up.right.diamond.fill', 'directions'),
  download: icon('arrow.down.circle', 'download'),
  duplicate: icon('plus.square.on.square', 'library_add'),
  edit: icon('pencil', 'edit'),
  history: icon('clock.arrow.circlepath', 'history'),
  home: icon('house', 'home'),
  link: icon('link', 'link'),
  map: icon('map', 'map'),
  minus: icon('minus', 'remove'),
  moon: icon('moon.fill', 'bedtime'),
  offline: icon('wifi.slash', 'wifi_off'),
  openExternal: icon('arrow.up.right.square', 'open_in_new'),
  people: icon('person.2.fill', 'group'),
  person: icon('person.fill', 'person'),
  pin: icon('mappin.and.ellipse', 'location_on'),
  refresh: icon('arrow.clockwise', 'refresh'),
  restore: icon('arrow.uturn.backward', 'undo'),
  send: icon('paperplane.fill', 'send'),
  settings: icon('gearshape', 'settings'),
  share: icon('square.and.arrow.up', 'share'),
  sparkles: icon('sparkles', 'auto_awesome'),
  warning: icon('exclamationmark.triangle.fill', 'warning'),
} satisfies Record<string, SymbolName>;

export type IconName = keyof typeof Icons;
