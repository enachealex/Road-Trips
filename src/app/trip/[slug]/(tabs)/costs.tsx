import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useConfirm } from '@/components/confirm-dialog';
import { CategoryBars, ExpenseRow, PayHandlesForm, PersonTotals, TransferRow } from '@/components/costs';
import { Icon } from '@/components/icon';
import { BottomDock, Card, Fab, Screen, SectionTitle, Segmented, Toast } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLong, nowLocal } from '@/lib/dates';
import {
  balances,
  categoryTotals,
  formatMoney,
  householdBalances,
  personTotals,
  settleUp,
  totalSpent,
  unitOf,
  type Transfer,
} from '@/lib/money';
import { sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';
import { useLoadedTrip } from '@/lib/trip-context';
import type { Expense, Household, PayHandles } from '@/lib/types';

function groupByDate(expenses: Expense[]): { date: string; items: Expense[] }[] {
  const groups: { date: string; items: Expense[] }[] = [];
  for (const x of expenses) {
    const last = groups[groups.length - 1];
    if (last?.date === x.date) last.items.push(x);
    else groups.push({ date: x.date, items: [x] });
  }
  return groups;
}

/** A household settles through one of its members; prefer the one using this device. */
function representative(unit: string, households: Household[], me: string | null, people: Record<string, PayHandles>) {
  const household = households.find((h) => sameName(h.name, unit));
  if (!household || household.members.length === 0) return unit;
  if (me && household.members.some((m) => sameName(m, me))) return me;
  return household.members.find((m) => people[m] && Object.values(people[m]).some(Boolean)) ?? household.members[0];
}

/** Shared costs: what was spent, who paid, and how to even up. */
export default function CostsScreen() {
  const c = useTheme();
  const confirm = useConfirm();
  const { slug, bundle, me, refresh, refreshing, saveExpense, updateTrip } = useLoadedTrip();
  const { trip } = bundle;
  const currency = trip.currency ?? 'USD';
  const households = trip.households ?? [];
  const people = trip.people ?? {};
  const expenses = bundle.expenses ?? [];
  // Families usually settle up as a household, so start there when households are set.
  const [mode, setMode] = useState<'people' | 'households'>(() =>
    (trip.households ?? []).length > 0 ? 'households' : 'people',
  );
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const byHousehold = mode === 'households' && households.length > 0;
  const personal = balances(expenses);
  const balance = byHousehold ? householdBalances(personal, households) : personal;
  const transfers = settleUp(balance);
  const myUnit = me ? (byHousehold ? unitOf(me, households) : me) : null;
  const mine = myUnit ? ([...balance].find(([k]) => sameName(k, myUnit))?.[1] ?? 0) : null;
  const spent = totalSpent(expenses);
  const costCount = expenses.filter((x) => x.kind === 'expense').length;

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  };

  const markPaid = async (t: Transfer) => {
    const from = byHousehold ? representative(t.from, households, me, people) : t.from;
    const to = byHousehold ? representative(t.to, households, null, people) : t.to;
    const ok = await confirm({
      title: `Record that ${t.from} paid ${t.to}?`,
      message: `${formatMoney(t.cents, currency)}. Everyone’s balances update straight away.`,
      confirmLabel: 'Record payment',
    });
    if (!ok) return;
    setFailure(null);
    try {
      await saveExpense({
        kind: 'payment',
        description: `Payment to ${to}`,
        amountCents: t.cents,
        category: 'other',
        paidBy: from,
        split: [{ name: to, cents: t.cents }],
        splitMode: 'exact',
        splitInput: {},
        date: nowLocal().date,
        eventId: null,
        notes: '',
      });
      flash('Payment recorded');
    } catch (e) {
      setFailure(errorMessage(e));
    }
  };

  const recipientHandles = (unit: string) => {
    const name = byHousehold ? representative(unit, households, null, people) : unit;
    return Object.entries(people).find(([k]) => sameName(k, name))?.[1];
  };

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      footer={
        <>
          <BottomDock>
            <Fab label="Add cost" onPress={() => router.push({ pathname: '/trip/[slug]/expense/new', params: { slug } })} />
          </BottomDock>
          <Toast message={toast} />
        </>
      }>
      <Card>
        <ThemedText type="label" themeColor="textSecondary">
          Spent so far
        </ThemedText>
        <ThemedText type="title">{formatMoney(spent, currency)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {costCount === 0 ? 'No costs yet' : `${costCount} ${costCount === 1 ? 'cost' : 'costs'} · ${currency}`}
        </ThemedText>
        {mine !== null && expenses.length > 0 ? (
          <View style={[styles.mine, { backgroundColor: mine > 0 ? c.primarySoft : mine < 0 ? c.warningSoft : c.backgroundElement }]}>
            <Icon name="money" size={18} color={mine > 0 ? c.primary : mine < 0 ? c.warning : c.textSecondary} />
            <ThemedText type="smallBold">
              {byHousehold && myUnit !== me
                ? mine > 0
                  ? `Your household (${myUnit}) is owed ${formatMoney(mine, currency)}`
                  : mine < 0
                    ? `Your household (${myUnit}) owes ${formatMoney(-mine, currency)}`
                    : `Your household (${myUnit}) is all square`
                : mine > 0
                  ? `You’re owed ${formatMoney(mine, currency)}`
                  : mine < 0
                    ? `You owe ${formatMoney(-mine, currency)}`
                    : 'You’re all square'}
            </ThemedText>
          </View>
        ) : null}
      </Card>

      {expenses.length > 0 ? (
        <>
          <SectionTitle>Settle up</SectionTitle>
          <Card>
            {households.length > 0 ? (
              <Segmented
                options={[
                  { value: 'people', label: 'By person' },
                  { value: 'households', label: 'By household' },
                ]}
                value={mode}
                onChange={setMode}
              />
            ) : null}
            {transfers.length === 0 ? (
              <View style={styles.square}>
                <Icon name="check" size={20} color={c.primary} />
                <ThemedText type="smallBold" themeColor="primary">
                  Everyone is even. Nothing to settle.
                </ThemedText>
              </View>
            ) : (
              transfers.map((t, i) => (
                <View key={`${t.from}-${t.to}`} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border } : undefined}>
                  <TransferRow
                    transfer={t}
                    currency={currency}
                    handles={recipientHandles(t.to)}
                    tripName={trip.name}
                    onMarkPaid={() => void markPaid(t)}
                  />
                </View>
              ))
            )}
            {failure ? (
              <ThemedText type="caption" themeColor="danger">
                {failure}
              </ThemedText>
            ) : null}
          </Card>
        </>
      ) : (
        <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
          <ThemedText type="heading">Track shared costs</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Add what each person pays for (gas, hotels, groceries) and who it was for. Roadbook keeps a running tally
            and works out the fewest payments to even everyone up.
            {households.length === 0 ? ' Families can settle up as a household: set households in Share & settings.' : ''}
          </ThemedText>
        </Card>
      )}

      {groupByDate(expenses).map((g) => (
        <View key={g.date} style={styles.group}>
          <SectionTitle>{formatDayLong(g.date)}</SectionTitle>
          <Card style={styles.listCard}>
            {g.items.map((x, i) => (
              <View key={x.id}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                <ExpenseRow slug={slug} expense={x} currency={currency} travelers={trip.travelers} />
              </View>
            ))}
          </Card>
        </View>
      ))}

      {costCount > 0 ? (
        <>
          <SectionTitle>Where the money went</SectionTitle>
          <Card>
            <CategoryBars totals={categoryTotals(expenses)} currency={currency} />
          </Card>
          <SectionTitle>By person</SectionTitle>
          <Card>
            <PersonTotals rows={personTotals(expenses)} currency={currency} />
          </Card>
        </>
      ) : null}

      {me ? (
        <>
          <SectionTitle>How people can pay you</SectionTitle>
          <Card>
            <PayHandlesForm
              initial={Object.entries(people).find(([k]) => sameName(k, me))?.[1] ?? {}}
              onSave={async (handles) => {
                const others = Object.fromEntries(Object.entries(people).filter(([k]) => !sameName(k, me)));
                const hasAny = Object.values(handles).some(Boolean);
                await updateTrip({ people: hasAny ? { ...others, [me]: handles } : others });
              }}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: 12,
  },
  square: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  group: {
    gap: Spacing.two,
  },
  listCard: {
    padding: Spacing.one,
    gap: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 38 + Spacing.three * 2 - 4,
  },
});
