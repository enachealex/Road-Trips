import { splitEqual } from './money';
import { rememberTrip } from './my-trips';
import { buildSampleTrip } from './sample-trip';
import { store } from './store';
import type { Trip } from './types';

/** Creates the sample road trip (plan, chat, lists and costs) in the current store. */
export async function createSampleTrip(): Promise<Trip> {
  const sample = buildSampleTrip();
  const trip = await store.createTrip(sample.trip, sample.organizer);
  const slug = trip.slug;

  const saved = await Promise.all(sample.events.map((e) => store.saveEvent(slug, e)));
  const idByTitle = new Map(saved.map((e) => [e.title, e.id]));
  const eventId = (title?: string) => (title ? (idByTitle.get(title) ?? null) : null);

  for (const m of sample.messages) {
    await store.postMessage(slug, { body: m.body, by: m.by, eventId: eventId(m.about) });
  }

  await store.updateTrip(slug, { households: sample.households, people: sample.people }, sample.organizer);

  const lists = (await store.getTrip(slug))?.lists ?? [];
  for (const l of sample.lists) {
    const list = lists.find((x) => x.kind === l.kind);
    if (!list) continue;
    await Promise.all(
      l.items.map((item, n) =>
        store.saveListItem(
          slug,
          {
            listId: list.id,
            text: item.text,
            assignee: item.assignee ?? null,
            dueDate: item.dueDate ?? null,
            done: !!item.doneBy,
            position: n + 1,
          },
          item.doneBy ?? sample.organizer,
        ),
      ),
    );
  }

  await Promise.all(
    sample.expenses.map((x) =>
      store.saveExpense(
        slug,
        {
          kind: x.paidTo ? 'payment' : 'expense',
          description: x.description,
          amountCents: x.cents,
          category: x.category,
          paidBy: x.paidBy,
          split: x.paidTo ? [{ name: x.paidTo, cents: x.cents }] : splitEqual(x.cents, x.between ?? sample.trip.travelers),
          splitMode: x.paidTo ? 'exact' : 'equal',
          splitInput: {},
          date: x.date,
          eventId: eventId(x.about),
          notes: '',
        },
        x.paidBy,
      ),
    ),
  );

  rememberTrip(trip);
  return trip;
}
