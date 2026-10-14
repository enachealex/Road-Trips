import { describe, expect, it } from 'vitest';

import {
  balances,
  categoryTotals,
  householdBalances,
  parseAmount,
  personTotals,
  settleUp,
  splitByShares,
  splitEqual,
  totalSpent,
  venmoUrl,
} from './money';
import type { Expense } from './types';

const x = (e: Partial<Expense> & Pick<Expense, 'paidBy' | 'amountCents' | 'split'>): Expense => ({
  id: Math.random().toString(36),
  kind: 'expense',
  description: 'x',
  category: 'other',
  splitMode: 'equal',
  splitInput: {},
  date: '2027-07-01',
  eventId: null,
  notes: '',
  createdBy: '',
  updatedBy: '',
  createdAt: '',
  updatedAt: '',
  ...e,
});

describe('parseAmount', () => {
  it('reads the ways people type money', () => {
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('$1,234.56')).toBe(123456);
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('12,50')).toBe(1250);
    expect(parseAmount('1,234')).toBe(123400);
    expect(parseAmount('.99')).toBe(99);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1500', 'JPY')).toBe(1500);
  });
});

describe('splitting', () => {
  it('splits to the cent and always adds up', () => {
    expect(splitEqual(1000, ['A', 'B', 'C'])).toEqual([
      { name: 'A', cents: 334 },
      { name: 'B', cents: 333 },
      { name: 'C', cents: 333 },
    ]);
    const shares = splitByShares(10001, { Adults: 2, Kid: 1 });
    expect(shares).toEqual([
      { name: 'Adults', cents: 6667 },
      { name: 'Kid', cents: 3334 },
    ]);
    expect(shares.reduce((s, p) => s + p.cents, 0)).toBe(10001);
    expect(splitByShares(500, { A: 0, B: 1 })).toEqual([{ name: 'B', cents: 500 }]);
  });
});

describe('balances and settling up', () => {
  const expenses = [
    x({ paidBy: 'Mom', amountCents: 9000, category: 'lodging', split: splitEqual(9000, ['Mom', 'Dad', 'Gran']) }),
    x({ paidBy: 'Gran', amountCents: 3000, category: 'food', split: splitEqual(3000, ['Mom', 'Dad', 'Gran']) }),
    x({ paidBy: 'dad', amountCents: 600, category: 'fuel', split: [{ name: 'Dad', cents: 600 }] }),
    x({ kind: 'payment', paidBy: 'Dad', amountCents: 1000, split: [{ name: 'Mom', cents: 1000 }] }),
  ];

  it('works out who is owed and who owes', () => {
    const b = balances(expenses);
    expect(Object.fromEntries(b)).toEqual({ Mom: 4000, Dad: -3000, Gran: -1000 });
    expect([...b.values()].reduce((s, c) => s + c, 0)).toBe(0);
  });

  it('suggests payments that even everyone out', () => {
    expect(settleUp(balances(expenses))).toEqual([
      { from: 'Dad', to: 'Mom', cents: 3000 },
      { from: 'Gran', to: 'Mom', cents: 1000 },
    ]);
  });

  it('lets households settle as one', () => {
    const households = [{ name: 'The Smiths', members: ['Mom', 'Dad'] }];
    const b = householdBalances(balances(expenses), households);
    expect(Object.fromEntries(b)).toEqual({ 'The Smiths': 1000, Gran: -1000 });
    expect(settleUp(b)).toEqual([{ from: 'Gran', to: 'The Smiths', cents: 1000 }]);
  });

  it('totals spending, leaving out payments', () => {
    expect(totalSpent(expenses)).toBe(12600);
    expect(categoryTotals(expenses)).toEqual([
      { category: 'lodging', cents: 9000 },
      { category: 'food', cents: 3000 },
      { category: 'fuel', cents: 600 },
    ]);
    expect(personTotals(expenses).find((p) => p.name === 'Mom')).toEqual({ name: 'Mom', paid: 9000, share: 4000 });
  });
});

describe('payment links', () => {
  it('builds a Venmo link with the amount and a note', () => {
    expect(venmoUrl('@mom-s', 4250, 'Pacific trip')).toBe(
      'https://venmo.com/mom-s?txn=pay&amount=42.50&note=Pacific%20trip',
    );
  });
});
