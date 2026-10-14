import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ExpenseForm } from '@/components/expense-form';
import { Screen } from '@/components/layout';
import { categoryForKind } from '@/lib/categories';
import { nowLocal } from '@/lib/dates';
import { costPeople } from '@/lib/people';
import { useLoadedTrip } from '@/lib/trip-context';
import type { ExpenseInput } from '@/lib/types';

export default function NewExpenseScreen() {
  const { slug, bundle, me, saveExpense } = useLoadedTrip();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const people = costPeople(bundle.trip.travelers, me);

  const [initial] = useState<ExpenseInput>(() => {
    const event = params.eventId ? bundle.events.find((e) => e.id === params.eventId) : undefined;
    return {
      kind: 'expense',
      description: event?.title ?? '',
      amountCents: 0,
      category: event ? categoryForKind(event.kind) : 'other',
      paidBy: me ?? people[0] ?? '',
      split: [],
      splitMode: 'equal',
      splitInput: {},
      date: event?.startDate ?? nowLocal().date,
      eventId: event?.id ?? null,
      notes: '',
    };
  });

  const done = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/trip/[slug]/costs', params: { slug } });

  return (
    <Screen>
      <ExpenseForm
        initial={initial}
        people={people}
        households={bundle.trip.households ?? []}
        currency={bundle.trip.currency ?? 'USD'}
        events={bundle.events}
        submitLabel="Add cost"
        onCancel={done}
        onSubmit={async (input) => {
          await saveExpense(input);
          done();
        }}
      />
    </Screen>
  );
}
