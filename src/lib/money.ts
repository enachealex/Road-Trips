import { sameName } from './people';
import type { Expense, ExpenseCategory, Household, Share } from './types';

// Money is kept in whole minor units ("cents"; for yen that is whole yen) so sums are exact.

export const CURRENCIES = ['USD', 'CAD', 'MXN', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK'];

export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatMoney(cents: number, currency = 'USD'): string {
  const digits = currencyDigits(currency);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 10 ** digits);
  } catch {
    return `${(cents / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** The amount as typed in a form field, e.g. "12.50". */
export function amountToInput(cents: number, currency = 'USD'): string {
  const digits = currencyDigits(currency);
  return (cents / 10 ** digits).toFixed(digits);
}

/**
 * Reads an amount typed by a person: "12", "12.5", "$1,234.56", "1.234,56" or "12,50".
 * The last "." or "," followed by one or two digits is the decimal point. Returns minor
 * units, or null when it isn't a positive amount.
 */
export function parseAmount(input: string, currency = 'USD'): number | null {
  const cleaned = input.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const digits = currencyDigits(currency);
  const m = /^(.*?)[.,](\d{1,2})$/.exec(cleaned);
  const whole = (m ? m[1] : cleaned).replace(/[.,]/g, '');
  const fraction = m ? m[2] : '';
  if (!/^\d*$/.test(whole) || (whole === '' && fraction === '')) return null;
  const value = Number(`${whole || '0'}.${fraction || '0'}`);
  const minor = Math.round(value * 10 ** digits);
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}

/**
 * Splits a total by weights (1 each for an equal split). Shares are whole cents that add up
 * exactly; leftover cents go to the largest remainders, then in the order given.
 */
export function splitByShares(total: number, weights: Record<string, number>): Share[] {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (!sum) return [];
  const parts = entries.map(([name, w]) => {
    const exact = (total * w) / sum;
    return { name, cents: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = total - parts.reduce((s, p) => s + p.cents, 0);
  const order = parts.map((_, i) => i).sort((a, b) => parts[b].rem - parts[a].rem || a - b);
  for (const i of order) {
    if (left <= 0) break;
    parts[i].cents += 1;
    left -= 1;
  }
  return parts.map(({ name, cents }) => ({ name, cents }));
}

export function splitEqual(total: number, names: string[]): Share[] {
  return splitByShares(total, Object.fromEntries(names.map((n) => [n, 1])));
}

/** Adds to a name-keyed map, matching names case-insensitively and keeping the first spelling. */
function addTo(map: Map<string, number>, name: string, cents: number) {
  for (const key of map.keys()) {
    if (sameName(key, name)) {
      map.set(key, map.get(key)! + cents);
      return;
    }
  }
  map.set(name.trim(), cents);
}

/**
 * Who is up and who is down. Positive means the group owes them; negative means they owe.
 * Paying for something (or paying someone back) raises your balance; each share lowers it.
 */
export function balances(expenses: Expense[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of expenses) {
    addTo(out, x.paidBy, x.amountCents);
    for (const s of x.split) addTo(out, s.name, -s.cents);
  }
  return out;
}

/** The household someone belongs to, or their own name. */
export function unitOf(name: string, households: Household[]): string {
  return households.find((h) => h.members.some((m) => sameName(m, name)))?.name ?? name;
}

/** Balances rolled up so each household settles as one. */
export function householdBalances(personal: Map<string, number>, households: Household[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [name, cents] of personal) addTo(out, unitOf(name, households), cents);
  return out;
}

export interface Transfer {
  from: string;
  to: string;
  cents: number;
}

/** A short list of payments that evens everyone out: biggest debts paid to biggest credits first. */
export function settleUp(balance: Map<string, number>): Transfer[] {
  const creditors = [...balance].filter(([, c]) => c > 0).map(([name, c]) => ({ name, c })).sort((a, b) => b.c - a.c);
  const debtors = [...balance].filter(([, c]) => c < 0).map(([name, c]) => ({ name, c: -c })).sort((a, b) => b.c - a.c);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].c, creditors[j].c);
    if (pay > 0) out.push({ from: debtors[i].name, to: creditors[j].name, cents: pay });
    debtors[i].c -= pay;
    creditors[j].c -= pay;
    if (debtors[i].c === 0) i++;
    if (creditors[j].c === 0) j++;
  }
  return out;
}

/** Spending by category, biggest first. Payments between people aren't spending. */
export function categoryTotals(expenses: Expense[]): { category: ExpenseCategory; cents: number }[] {
  const totals = new Map<ExpenseCategory, number>();
  for (const x of expenses) {
    if (x.kind === 'expense') totals.set(x.category, (totals.get(x.category) ?? 0) + x.amountCents);
  }
  return [...totals].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
}

/** For each person: what they paid for and what their share of the spending was. */
export function personTotals(expenses: Expense[]): { name: string; paid: number; share: number }[] {
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const x of expenses) {
    if (x.kind !== 'expense') continue;
    addTo(paid, x.paidBy, x.amountCents);
    for (const s of x.split) addTo(share, s.name, s.cents);
  }
  const names = [...paid.keys()];
  for (const n of share.keys()) if (!names.some((m) => sameName(m, n))) names.push(n);
  const get = (map: Map<string, number>, n: string) => [...map].find(([k]) => sameName(k, n))?.[1] ?? 0;
  return names
    .map((name) => ({ name, paid: get(paid, name), share: get(share, name) }))
    .sort((a, b) => b.share - a.share);
}

export function totalSpent(expenses: Expense[]): number {
  return expenses.reduce((s, x) => s + (x.kind === 'expense' ? x.amountCents : 0), 0);
}

const handle = (h: string) => encodeURIComponent(h.trim().replace(/^@/, ''));

/** Venmo's documented payment link (venmo.com/<user>?txn=pay&amount=…&note=…). */
export function venmoUrl(user: string, cents: number, note: string): string {
  return `https://venmo.com/${handle(user)}?txn=pay&amount=${(cents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
}

/** PayPal.Me with the amount; the payer confirms it on PayPal. */
export function paypalUrl(user: string, cents: number, currency: string): string {
  const digits = currencyDigits(currency);
  return `https://paypal.me/${handle(user)}/${(cents / 10 ** digits).toFixed(digits)}`;
}
