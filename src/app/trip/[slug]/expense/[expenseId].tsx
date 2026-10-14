import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { ExpenseForm } from '@/components/expense-form';
import { Card, Screen } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import { formatRelative } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { costPeople } from '@/lib/people';
import { useLoadedTrip } from '@/lib/trip-context';

export default function EditExpenseScreen() {
  const confirm = useConfirm();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const { slug, bundle, me, saveExpense, deleteExpense } = useLoadedTrip();
  // Keep editing what was opened even if a refresh arrives mid-edit.
  const [expense] = useState(() => (bundle.expenses ?? []).find((x) => x.id === expenseId));
  const currency = bundle.trip.currency ?? 'USD';

  const done = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/trip/[slug]/costs', params: { slug } });

  if (!expense) {
    return (
      <Screen>
        <Card>
          <ThemedText type="subtitle">This cost isn’t in the trip</ThemedText>
          <ThemedText themeColor="textSecondary">Someone may have deleted it.</ThemedText>
          <Button label="Back to costs" onPress={done} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ExpenseForm
        initial={expense}
        people={costPeople(bundle.trip.travelers, me)}
        households={bundle.trip.households ?? []}
        currency={currency}
        events={bundle.events}
        submitLabel="Save changes"
        onCancel={done}
        onSubmit={async (input) => {
          await saveExpense({ ...input, id: expense.id });
          done();
        }}
        onDelete={async () => {
          const ok = await confirm({
            title: `Delete “${expense.description}”?`,
            message: `${formatMoney(expense.amountCents, currency)}. Everyone’s balances update straight away.`,
            confirmLabel: 'Delete',
            destructive: true,
          });
          if (!ok) return;
          await deleteExpense(expense.id);
          done();
        }}
      />
      <ThemedText type="caption" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Added by {expense.createdBy || 'someone'} {formatRelative(expense.createdAt)}
        {expense.updatedBy && expense.updatedAt !== expense.createdAt
          ? ` · changed by ${expense.updatedBy} ${formatRelative(expense.updatedAt)}`
          : ''}
      </ThemedText>
    </Screen>
  );
}
