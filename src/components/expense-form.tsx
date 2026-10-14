import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, CATEGORY_ORDER } from '@/lib/categories';
import { formatDayShort, isValidDate } from '@/lib/dates';
import { KINDS } from '@/lib/kinds';
import { amountToInput, formatMoney, parseAmount, splitByShares, splitEqual } from '@/lib/money';
import { sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';
import type { Expense, ExpenseCategory, ExpenseInput, Household, Share, TripEvent } from '@/lib/types';

import { Avatar } from './avatar';
import { Button, IconButton } from './button';
import { DateInput } from './date-time-input';
import { Banner, Card, Chip, Row, SectionTitle, Segmented } from './layout';
import { Sheet } from './sheet';
import { FieldLabel, TextField } from './text-field';
import { ThemedText } from './themed-text';

type Mode = Expense['splitMode'];

export interface ExpenseFormProps {
  initial: ExpenseInput;
  people: string[];
  households: Household[];
  currency: string;
  events: TripEvent[];
  submitLabel: string;
  onSubmit: (input: ExpenseInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const c = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: c.border }]}>
      <IconButton icon="minus" size={16} onPress={() => onChange(Math.max(0, value - 1))} accessibilityLabel={`Fewer shares for ${label}`} />
      <ThemedText type="smallBold" style={styles.stepValue}>
        {value}
      </ThemedText>
      <IconButton icon="add" size={16} onPress={() => onChange(value + 1)} accessibilityLabel={`More shares for ${label}`} />
    </View>
  );
}

export function ExpenseForm({
  initial,
  people,
  households,
  currency,
  events,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: ExpenseFormProps) {
  const c = useTheme();
  const isPayment0 = initial.kind === 'payment';
  const [kind, setKind] = useState<Expense['kind']>(initial.kind);
  const [description, setDescription] = useState(isPayment0 ? '' : initial.description);
  const [amountText, setAmountText] = useState(initial.amountCents ? amountToInput(initial.amountCents, currency) : '');
  const [category, setCategory] = useState<ExpenseCategory>(initial.category);
  const [paidBy, setPaidBy] = useState(initial.paidBy);
  const [paidTo, setPaidTo] = useState(isPayment0 ? (initial.split[0]?.name ?? '') : '');
  const [mode, setMode] = useState<Mode>(initial.splitMode);
  const [included, setIncluded] = useState<string[]>(() =>
    isPayment0 || initial.split.length === 0 ? people : initial.split.filter((s) => s.cents > 0 || initial.splitMode !== 'exact').map((s) => s.name),
  );
  const [shares, setShares] = useState<Record<string, number>>(() =>
    initial.splitMode === 'shares' ? initial.splitInput : Object.fromEntries(people.map((p) => [p, 1])),
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    initial.splitMode === 'exact'
      ? Object.fromEntries(initial.split.map((s) => [s.name, amountToInput(s.cents, currency)]))
      : {},
  );
  const [date, setDate] = useState(initial.date);
  const [eventId, setEventId] = useState<string | null>(initial.eventId);
  const [notes, setNotes] = useState(initial.notes);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Everyone who could be involved, including names no longer on the trip.
  const names = [...people];
  for (const n of [initial.paidBy, ...initial.split.map((s) => s.name)]) {
    if (n && !names.some((m) => sameName(m, n))) names.push(n);
  }

  const amount = parseAmount(amountText, currency);
  const isIncluded = (n: string) => included.some((m) => sameName(m, n));
  const toggle = (n: string) => setIncluded((cur) => (isIncluded(n) ? cur.filter((m) => !sameName(m, n)) : [...cur, n]));
  const toggleHousehold = (h: Household) => {
    const all = h.members.every((m) => isIncluded(m));
    setIncluded((cur) =>
      all ? cur.filter((m) => !h.members.some((x) => sameName(x, m))) : [...cur, ...h.members.filter((m) => !cur.some((x) => sameName(x, m)))],
    );
  };

  const chosen = names.filter(isIncluded);
  let split: Share[] = [];
  let remaining = 0;
  if (kind === 'payment') {
    split = paidTo && amount ? [{ name: paidTo, cents: amount }] : [];
  } else if (amount) {
    if (mode === 'equal') split = splitEqual(amount, chosen);
    else if (mode === 'shares') split = splitByShares(amount, Object.fromEntries(chosen.map((n) => [n, shares[n] ?? 1])));
    else {
      split = chosen.map((n) => ({ name: n, cents: parseAmount(exact[n] ?? '', currency) ?? 0 }));
      remaining = amount - split.reduce((s, x) => s + x.cents, 0);
    }
  }
  const linked = eventId ? events.find((e) => e.id === eventId) : undefined;

  const submit = async () => {
    setFailure(null);
    if (!amount) return setFailure('Enter how much it was.');
    if (kind === 'expense' && !description.trim()) return setFailure('Say what it was for.');
    if (!paidBy) return setFailure('Pick who paid.');
    if (kind === 'payment' && (!paidTo || sameName(paidTo, paidBy))) return setFailure('Pick who was paid back.');
    if (kind === 'expense' && chosen.length === 0) return setFailure('Pick who it was for.');
    if (kind === 'expense' && mode === 'exact' && remaining !== 0) {
      return setFailure(
        remaining > 0
          ? `${formatMoney(remaining, currency)} still needs to be assigned to someone.`
          : `The amounts add up to ${formatMoney(-remaining, currency)} more than the total.`,
      );
    }
    if (kind === 'expense' && split.length === 0) return setFailure('Give at least one person a share.');
    if (!isValidDate(date)) return setFailure('Pick a date.');

    setSaving(true);
    try {
      await onSubmit({
        id: initial.id,
        kind,
        description: kind === 'payment' ? `Payment to ${paidTo}` : description.trim(),
        amountCents: amount,
        category: kind === 'payment' ? 'other' : category,
        paidBy,
        split: split.filter((s) => s.cents > 0 || mode === 'exact'),
        splitMode: kind === 'payment' ? 'exact' : mode,
        splitInput:
          kind === 'payment' ? {} : mode === 'shares' ? Object.fromEntries(chosen.map((n) => [n, shares[n] ?? 1])) : Object.fromEntries(chosen.map((n) => [n, 1])),
        date,
        eventId,
        notes: notes.trim(),
      });
    } catch (e) {
      setFailure(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Segmented
        options={[
          { value: 'expense', label: 'A cost' },
          { value: 'payment', label: 'Paying someone back' },
        ]}
        value={kind}
        onChange={setKind}
      />

      <Card>
        {kind === 'expense' ? (
          <TextField
            label="What for"
            value={description}
            onChangeText={setDescription}
            placeholder="Gas, Hotel Zephyr, Groceries…"
            maxLength={200}
          />
        ) : null}
        <View style={styles.amountRow}>
          <View style={styles.amountField}>
            <FieldLabel label="Amount" hint={currency} />
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0.00"
              placeholderTextColor={c.textSecondary}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount"
              style={[styles.amountInput, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
            />
          </View>
          <View style={styles.dateField}>
            <FieldLabel label="Date" />
            <DateInput value={date} onChange={setDate} accessibilityLabel="Date" />
          </View>
        </View>
        {kind === 'expense' ? (
          <View style={styles.field}>
            <FieldLabel label="Category" />
            <Row>
              {CATEGORY_ORDER.map((cat) => (
                <Chip
                  key={cat}
                  label={CATEGORIES[cat].label}
                  icon={CATEGORIES[cat].icon}
                  color={CATEGORIES[cat].color}
                  selected={category === cat}
                  onPress={() => setCategory(cat)}
                />
              ))}
            </Row>
          </View>
        ) : null}
      </Card>

      <SectionTitle>{kind === 'payment' ? 'Who paid whom' : 'Who paid'}</SectionTitle>
      <Card>
        <View style={styles.field}>
          {kind === 'payment' ? <FieldLabel label="Paid by" /> : null}
          <Row>
            {names.map((n) => (
              <Chip key={n} label={n} selected={sameName(paidBy, n)} onPress={() => setPaidBy(n)} />
            ))}
          </Row>
        </View>
        {kind === 'payment' ? (
          <View style={styles.field}>
            <FieldLabel label="Paid to" />
            <Row>
              {names
                .filter((n) => !sameName(n, paidBy))
                .map((n) => (
                  <Chip key={n} label={n} selected={sameName(paidTo, n)} onPress={() => setPaidTo(n)} />
                ))}
            </Row>
          </View>
        ) : null}
      </Card>

      {kind === 'expense' ? (
        <>
          <SectionTitle>Split between</SectionTitle>
          <Card>
            <Segmented
              options={[
                { value: 'equal', label: 'Equally' },
                { value: 'exact', label: 'Amounts' },
                { value: 'shares', label: 'Shares' },
              ]}
              value={mode}
              onChange={setMode}
            />
            {households.length > 0 ? (
              <Row>
                {households.map((h) => (
                  <Chip
                    key={h.name}
                    label={h.name}
                    icon="people"
                    selected={h.members.length > 0 && h.members.every((m) => isIncluded(m))}
                    onPress={() => toggleHousehold(h)}
                  />
                ))}
              </Row>
            ) : null}
            <View>
              {names.map((n, i) => {
                const share = split.find((s) => sameName(s.name, n));
                const on = isIncluded(n);
                return (
                  <View
                    key={n}
                    style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                    <Pressable
                      onPress={() => toggle(n)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={n}
                      style={styles.personName}>
                      <Avatar name={n} size={28} />
                      <ThemedText type="smallBold" style={on ? undefined : { color: c.textSecondary }}>
                        {n}
                      </ThemedText>
                    </Pressable>
                    {on && mode === 'exact' ? (
                      <TextInput
                        value={exact[n] ?? ''}
                        onChangeText={(v) => setExact((e) => ({ ...e, [n]: v }))}
                        placeholder="0.00"
                        placeholderTextColor={c.textSecondary}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Amount for ${n}`}
                        style={[styles.exactInput, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                      />
                    ) : null}
                    {on && mode === 'shares' ? (
                      <Stepper value={shares[n] ?? 1} onChange={(v) => setShares((s) => ({ ...s, [n]: v }))} label={n} />
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary" style={styles.shareValue}>
                      {on ? (share ? formatMoney(share.cents, currency) : '—') : 'Not included'}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
            {mode === 'exact' && amount ? (
              <ThemedText type="caption" themeColor={remaining === 0 ? 'primary' : 'warning'}>
                {remaining === 0
                  ? 'All assigned'
                  : remaining > 0
                    ? `${formatMoney(remaining, currency)} left to assign`
                    : `${formatMoney(-remaining, currency)} over the total`}
              </ThemedText>
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle>More</SectionTitle>
      <Card>
        <View style={styles.field}>
          <FieldLabel label="Plan item" hint="Optional" />
          {linked ? (
            <View style={[styles.linked, { backgroundColor: c.backgroundElement }]}>
              <ThemedText type="small" style={styles.flex} numberOfLines={1}>
                {KINDS[linked.kind].label}: {linked.title} · {formatDayShort(linked.startDate)}
              </ThemedText>
              <IconButton icon="close" size={16} onPress={() => setEventId(null)} accessibilityLabel="Unlink" />
            </View>
          ) : (
            <Button label="Link to a flight, stay or plan" icon="link" compact onPress={() => setPicking(true)} />
          )}
        </View>
        <TextField label="Notes" hint="Optional" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
      </Card>

      {failure ? (
        <Banner icon="warning" tone="danger">
          {failure}
        </Banner>
      ) : null}
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} style={styles.flex} />
        <Button label={submitLabel} variant="primary" onPress={submit} loading={saving} style={styles.flex} />
      </View>
      {onDelete ? <Button label="Delete" icon="delete" variant="danger" onPress={() => void onDelete()} /> : null}

      {picking ? (
        <Sheet visible title="Link to a plan item" onClose={() => setPicking(false)}>
          {events.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing in the plan yet.
            </ThemedText>
          ) : (
            events.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => {
                  setEventId(e.id);
                  setPicking(false);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.pick, { borderColor: c.border }, pressed && { backgroundColor: c.backgroundElement }]}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {e.title}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {KINDS[e.kind].label} · {formatDayShort(e.startDate)}
                </ThemedText>
              </Pressable>
            ))
          )}
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  form: {
    gap: Spacing.three - 4,
  },
  field: {
    gap: Spacing.two,
  },
  amountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
  },
  amountField: {
    flexGrow: 1,
    flexBasis: 150,
    gap: Spacing.one + 2,
  },
  amountInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 4,
    fontSize: 24,
    fontWeight: '700',
  },
  dateField: {
    flexGrow: 1,
    flexBasis: 170,
    gap: Spacing.one + 2,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 50,
    paddingVertical: Spacing.one,
  },
  personName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exactInput: {
    width: 100,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.small + 2,
    paddingHorizontal: Spacing.two,
    fontSize: 16,
    textAlign: 'right',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.pill,
  },
  stepValue: {
    minWidth: 20,
    textAlign: 'center',
  },
  shareValue: {
    minWidth: 84,
    textAlign: 'right',
  },
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    marginTop: Spacing.two,
  },
  pick: {
    gap: 2,
    padding: Spacing.three - 4,
    borderWidth: 1,
    borderRadius: Radius.medium,
  },
});
