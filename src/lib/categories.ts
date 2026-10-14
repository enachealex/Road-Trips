import type { IconName } from '@/constants/icons';

import type { EventKind, ExpenseCategory } from './types';

export const CATEGORIES: Record<ExpenseCategory, { label: string; icon: IconName; color: string }> = {
  lodging: { label: 'Lodging', icon: 'lodging', color: '#4B53BC' },
  transport: { label: 'Transport', icon: 'flight', color: '#2F6FDB' },
  fuel: { label: 'Gas', icon: 'fuel', color: '#C95A22' },
  food: { label: 'Food', icon: 'meal', color: '#C03A67' },
  groceries: { label: 'Groceries', icon: 'cart', color: '#2E7D4F' },
  activities: { label: 'Activities', icon: 'activity', color: '#7C4DCC' },
  shopping: { label: 'Shopping', icon: 'bag', color: '#A86B12' },
  other: { label: 'Other', icon: 'receipt', color: '#56606E' },
};

export const CATEGORY_ORDER: ExpenseCategory[] = [
  'lodging', 'fuel', 'food', 'groceries', 'activities', 'transport', 'shopping', 'other',
];

/** A sensible category for a cost added from a plan item. */
export function categoryForKind(kind: EventKind): ExpenseCategory {
  switch (kind) {
    case 'lodging':
      return 'lodging';
    case 'drive':
      return 'fuel';
    case 'meal':
      return 'food';
    case 'activity':
      return 'activities';
    case 'note':
      return 'other';
    default:
      return 'transport';
  }
}
