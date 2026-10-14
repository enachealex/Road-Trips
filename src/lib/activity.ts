import { CATEGORIES } from './categories';
import { formatDayShort, formatTime, isValidDate, isValidTime } from './dates';
import { KINDS } from './kinds';
import { formatMoney } from './money';
import { sameName } from './people';
import type { ActivityChange, ActivityEntry, EventKind, Expense, ExpenseCategory, Share, Trip, TripEvent } from './types';

// The activity log: who added, changed, deleted or restored what. The database records the
// changed fields (roadbook.event_changes in supabase/schema.sql); eventChanges/tripChanges
// below produce the same shape for demo mode.

const EVENT_FIELDS = [
  'title', 'kind', 'startDate', 'startTime', 'endDate', 'endTime', 'location', 'address',
  'endLocation', 'endAddress', 'travelers', 'confirmation', 'phone', 'url',
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function eventChanges(o: TripEvent, n: TripEvent): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const f of EVENT_FIELDS) if (!same(o[f], n[f])) out.push({ field: f, from: o[f] ?? null, to: n[f] ?? null });
  const keys = [...new Set([...Object.keys(o.details), ...Object.keys(n.details)])].sort();
  for (const k of keys) {
    if (!same(o.details[k], n.details[k])) {
      out.push({ field: `details.${k}`, from: o.details[k] ?? null, to: n.details[k] ?? null });
    }
  }
  if (o.notes !== n.notes) out.push({ field: 'notes', from: null, to: null });
  return out;
}

export function tripChanges(o: Trip, n: Trip): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const f of ['name', 'startDate', 'endDate', 'travelers'] as const) {
    if (!same(o[f], n[f])) out.push({ field: f, from: o[f], to: n[f] });
  }
  const oc = o.currency ?? 'USD';
  const nc = n.currency ?? 'USD';
  if (oc !== nc) out.push({ field: 'currency', from: oc, to: nc });
  if (!same(o.households ?? [], n.households ?? [])) {
    out.push({ field: 'households', from: o.households ?? [], to: n.households ?? [] });
  }
  if (o.notes !== n.notes) out.push({ field: 'notes', from: null, to: null });
  return out;
}

/** Same shape as roadbook.expense_changes in the schema. */
export function expenseChanges(o: Expense, n: Expense): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const f of ['description', 'amountCents', 'category', 'paidBy', 'split', 'date'] as const) {
    if (!same(o[f], n[f])) out.push({ field: f, from: o[f], to: n[f] });
  }
  if (o.notes !== n.notes) out.push({ field: 'notes', from: null, to: null });
  return out;
}

const isBlank = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function show(v: unknown): string {
  if (typeof v === 'string' && isValidDate(v)) return formatDayShort(v);
  if (typeof v === 'string' && isValidTime(v)) return formatTime(v);
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function line(label: string, from: unknown, to: unknown): string {
  if (isBlank(from)) return `${label}: ${show(to)}`;
  if (isBlank(to)) return `${label} removed`;
  return `${label}: ${show(from)} → ${show(to)}`;
}

function peopleLine(label: string, from: unknown, to: unknown, emptyMeans: string): string {
  const a = Array.isArray(from) ? (from as string[]) : [];
  const b = Array.isArray(to) ? (to as string[]) : [];
  return `${label}: ${a.length ? a.join(', ') : emptyMeans} → ${b.length ? b.join(', ') : emptyMeans}`;
}

function describeEventChange(c: ActivityChange, kind: EventKind | null): string {
  const k = KINDS[kind ?? 'note'];
  if (c.field.startsWith('details.')) {
    const key = c.field.slice('details.'.length);
    const label = Object.values(KINDS).flatMap((x) => x.details).find((d) => d.key === key)?.label ?? key;
    return line(label, c.from, c.to);
  }
  switch (c.field) {
    case 'title':
      return `Renamed from “${show(c.from)}”`;
    case 'kind':
      return `Type: ${KINDS[c.from as EventKind]?.label ?? c.from} → ${KINDS[c.to as EventKind]?.label ?? c.to}`;
    case 'startDate':
      return line(`${k.startLabel} date`, c.from, c.to);
    case 'startTime':
      return line(`${k.startLabel} time`, c.from, c.to);
    case 'endDate':
      return line(`${k.endLabel} date`, c.from, c.to);
    case 'endTime':
      return line(`${k.endLabel} time`, c.from, c.to);
    case 'location':
      return line(k.places === 'route' ? k.fromLabel : 'Place', c.from, c.to);
    case 'endLocation':
      return line(k.toLabel, c.from, c.to);
    case 'address':
      return line('Address', c.from, c.to);
    case 'endAddress':
      return line('Arrival address', c.from, c.to);
    case 'travelers':
      return peopleLine('Who', c.from, c.to, 'Everyone');
    case 'confirmation':
      return line('Confirmation #', c.from, c.to);
    case 'phone':
      return line('Phone', c.from, c.to);
    case 'url':
      return line('Link', c.from, c.to);
    case 'notes':
      return 'Updated the notes';
    default:
      return line(c.field, c.from, c.to);
  }
}

const amountOf = (entry: ActivityEntry) => {
  const c = entry.changes.find((x) => x.field === 'amountCents');
  return (c?.to ?? c?.from ?? null) as number | null;
};

const names = (v: unknown) => (Array.isArray(v) ? (v as Share[]).map((s) => s.name) : []);

function joinNames(list: string[]): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
}

function describeExpenseChange(c: ActivityChange, currency: string): string {
  switch (c.field) {
    case 'description':
      return `Renamed from “${show(c.from)}”`;
    case 'amountCents':
      return `Amount: ${formatMoney(c.from as number, currency)} → ${formatMoney(c.to as number, currency)}`;
    case 'category':
      return `Category: ${CATEGORIES[c.from as ExpenseCategory]?.label ?? c.from} → ${
        CATEGORIES[c.to as ExpenseCategory]?.label ?? c.to
      }`;
    case 'paidBy':
      return `Paid by: ${show(c.from)} → ${show(c.to)}`;
    case 'split': {
      const a = names(c.from);
      const b = names(c.to);
      const sameP = a.length === b.length && a.every((n) => b.some((m) => sameName(m, n)));
      return sameP ? 'Changed how it’s split' : `Split between ${joinNames(b)} (was ${joinNames(a)})`;
    }
    case 'date':
      return line('Date', c.from, c.to);
    case 'notes':
      return 'Updated the notes';
    default:
      return line(c.field, c.from, c.to);
  }
}

function describeTripChange(c: ActivityChange): string {
  switch (c.field) {
    case 'currency':
      return `Currency: ${show(c.from)} → ${show(c.to)}`;
    case 'households':
      return 'Updated the households';
    case 'name':
      return `Renamed from “${show(c.from)}” to “${show(c.to)}”`;
    case 'startDate':
      return line('First day', c.from, c.to);
    case 'endDate':
      return line('Last day', c.from, c.to);
    case 'travelers': {
      const a = (c.from as string[]) ?? [];
      const b = (c.to as string[]) ?? [];
      const added = b.filter((x) => !a.some((y) => sameName(x, y)));
      const removed = a.filter((x) => !b.some((y) => sameName(x, y)));
      return [added.length ? `Added ${added.join(', ')}` : '', removed.length ? `Removed ${removed.join(', ')}` : '']
        .filter(Boolean)
        .join(' · ') || 'Reordered the travelers';
    }
    case 'notes':
      return 'Updated the trip notes';
    default:
      return line(c.field, c.from, c.to);
  }
}

/** "Dad changed Dinner" plus one line per changed field. Amounts use the trip's currency. */
export function describeActivity(entry: ActivityEntry, currency = 'USD'): { text: string; details: string[] } {
  const who = entry.actor || 'Someone';
  const amount = amountOf(entry);
  const money = amount !== null ? ` · ${formatMoney(amount, currency)}` : '';
  switch (entry.action) {
    case 'expense_added':
      return { text: `${who} added the cost ${entry.title}${money}`, details: [] };
    case 'expense_updated':
      return {
        text: `${who} changed the cost ${entry.title}`,
        details: entry.changes.map((c) => describeExpenseChange(c, currency)),
      };
    case 'expense_deleted':
      return { text: `${who} deleted the cost ${entry.title}${money}`, details: [] };
    case 'payment_recorded': {
      const [from, to] = entry.title.split(' → ');
      return { text: `${who} recorded that ${from} paid ${to ?? 'someone'}${money}`, details: [] };
    }
    case 'list_added':
      return { text: `${who} added the list ${entry.title}`, details: [] };
    case 'list_deleted':
      return { text: `${who} deleted the list ${entry.title}`, details: [] };
    case 'trip_created':
      return { text: `${who} created the trip`, details: [] };
    case 'trip_updated':
      return { text: `${who} updated the trip details`, details: entry.changes.map(describeTripChange) };
    case 'event_added':
      return { text: `${who} added ${entry.title}`, details: [] };
    case 'event_updated':
      return { text: `${who} changed ${entry.title}`, details: entry.changes.map((c) => describeEventChange(c, entry.kind)) };
    case 'event_deleted':
      return { text: `${who} deleted ${entry.title}`, details: [] };
    case 'event_restored':
      return { text: `${who} restored ${entry.title}`, details: [] };
  }
}

/** Changes other people made since this device last looked. */
export function unseenActivity(activity: ActivityEntry[], lastSeen: string | null, me: string | null): ActivityEntry[] {
  if (!lastSeen) return [];
  return activity.filter((a) => a.at > lastSeen && !(me && sameName(a.actor, me)));
}
