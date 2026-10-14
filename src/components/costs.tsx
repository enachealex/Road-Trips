import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES } from '@/lib/categories';
import { formatMoney, paypalUrl, venmoUrl, type Transfer } from '@/lib/money';
import { sameName } from '@/lib/people';
import { copyText } from '@/lib/share';
import type { Expense, ExpenseCategory, PayHandles } from '@/lib/types';

import { Avatar } from './avatar';
import { Button } from './button';
import { Icon } from './icon';
import { IconTile, Row } from './layout';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/** "Paid by Mom · split 3 ways", "for Mom & Dad", or "Dad paid Mom back". */
export function expenseSummary(x: Expense, travelers: string[]): string {
  if (x.kind === 'payment') return `${x.paidBy} paid ${x.split[0]?.name ?? 'someone'} back`;
  const names = x.split.filter((s) => s.cents > 0).map((s) => s.name);
  const everyone =
    travelers.length > 1 && travelers.every((t) => names.some((n) => sameName(n, t))) && names.length === travelers.length;
  const who = everyone ? `split ${names.length} ways` : names.length === 1 ? `for ${names[0]}` : `for ${joinNames(names)}`;
  return `Paid by ${x.paidBy} · ${who}`;
}

export function ExpenseRow({ slug, expense, currency, travelers }: { slug: string; expense: Expense; currency: string; travelers: string[] }) {
  const c = useTheme();
  const cat = CATEGORIES[expense.category];
  const payment = expense.kind === 'payment';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trip/[slug]/expense/[expenseId]', params: { slug, expenseId: expense.id } })}
      accessibilityRole="link"
      accessibilityLabel={`${expense.description}, ${formatMoney(expense.amountCents, currency)}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.backgroundElement }]}>
      <IconTile icon={payment ? 'money' : cat.icon} color={payment ? c.primary : cat.color} size={38} />
      <View style={styles.body}>
        <ThemedText type="heading" numberOfLines={1}>
          {expense.description}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {expenseSummary(expense, travelers)}
        </ThemedText>
      </View>
      <ThemedText type="heading" style={payment ? { color: c.textSecondary } : undefined}>
        {formatMoney(expense.amountCents, currency)}
      </ThemedText>
    </Pressable>
  );
}

/** One suggested payment, with Pay buttons when the person being paid has shared a handle. */
export function TransferRow({
  transfer,
  currency,
  handles,
  tripName,
  onMarkPaid,
}: {
  transfer: Transfer;
  currency: string;
  /** The recipient's payment handles, if they shared any. */
  handles: PayHandles | undefined;
  tripName: string;
  onMarkPaid: () => void;
}) {
  const c = useTheme();
  const [copied, setCopied] = useState(false);
  const note = `${tripName} (Roadbook)`;
  return (
    <View style={styles.transfer}>
      <View style={styles.transferHead}>
        <Avatar name={transfer.from} size={28} />
        <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
          {transfer.from}
        </ThemedText>
        <Icon name="arrowRight" size={16} color={c.textSecondary} />
        <Avatar name={transfer.to} size={28} />
        <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
          {transfer.to}
        </ThemedText>
        <ThemedText type="heading">{formatMoney(transfer.cents, currency)}</ThemedText>
      </View>
      <Row>
        {handles?.venmo && currency === 'USD' ? (
          <Button label="Venmo" compact onPress={() => Linking.openURL(venmoUrl(handles.venmo!, transfer.cents, note))} />
        ) : null}
        {handles?.paypal ? (
          <Button
            label="PayPal"
            compact
            onPress={() => Linking.openURL(paypalUrl(handles.paypal!, transfer.cents, currency))}
          />
        ) : null}
        {handles?.zelle ? (
          <Button
            label={copied ? 'Copied' : `Zelle: ${handles.zelle}`}
            icon={copied ? 'check' : 'copy'}
            compact
            onPress={() => {
              void copyText(handles.zelle!).then((ok) => setCopied(ok));
            }}
          />
        ) : null}
        <Button label="Mark as paid" icon="check" compact variant="ghost" onPress={onMarkPaid} />
      </Row>
    </View>
  );
}

/** Spending per category as thin bars, biggest first; values are written out. */
export function CategoryBars({ totals, currency }: { totals: { category: ExpenseCategory; cents: number }[]; currency: string }) {
  const c = useTheme();
  const max = Math.max(1, ...totals.map((t) => t.cents));
  return (
    <View style={styles.bars} accessibilityRole="list">
      {totals.map((t) => {
        const cat = CATEGORIES[t.category];
        return (
          <View key={t.category} style={styles.barRow} accessibilityLabel={`${cat.label}: ${formatMoney(t.cents, currency)}`}>
            <Icon name={cat.icon} size={18} color={cat.color} />
            <View style={styles.barBody}>
              <View style={styles.barLabels}>
                <ThemedText type="small">{cat.label}</ThemedText>
                <ThemedText type="smallBold">{formatMoney(t.cents, currency)}</ThemedText>
              </View>
              <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
                <View style={[styles.fill, { backgroundColor: c.primary, width: `${Math.max(2, (t.cents / max) * 100)}%` }]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Per person: what they paid, their share, and where that leaves them. */
export function PersonTotals({ rows, currency }: { rows: { name: string; paid: number; share: number }[]; currency: string }) {
  const c = useTheme();
  return (
    <View>
      {rows.map((r, i) => {
        const net = r.paid - r.share;
        return (
          <View key={r.name} style={[styles.personRow, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Avatar name={r.name} size={28} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{r.name}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                Paid {formatMoney(r.paid, currency)} · Share {formatMoney(r.share, currency)}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" themeColor={net > 0 ? 'primary' : net < 0 ? 'danger' : 'textSecondary'}>
              {net === 0 ? 'Even' : `${net > 0 ? '+' : '−'}${formatMoney(Math.abs(net), currency)}`}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/** Lets someone share how to pay them. Visible to everyone with the trip link. */
export function PayHandlesForm({ initial, onSave }: { initial: PayHandles; onSave: (handles: PayHandles) => Promise<void> }) {
  const [venmo, setVenmo] = useState(initial.venmo ?? '');
  const [paypal, setPaypal] = useState(initial.paypal ?? '');
  const [zelle, setZelle] = useState(initial.zelle ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const clean = (v: string) => v.trim() || undefined;
      await onSave({ venmo: clean(venmo), paypal: clean(paypal), zelle: clean(zelle) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={styles.handles}>
      <View style={styles.handleGrid}>
        <TextField label="Venmo" hint="Optional" value={venmo} onChangeText={(v) => { setVenmo(v); setSaved(false); }} placeholder="@your-name" autoCapitalize="none" autoCorrect={false} autoComplete="off" containerStyle={styles.handleField} />
        <TextField label="PayPal.Me" hint="Optional" value={paypal} onChangeText={(v) => { setPaypal(v); setSaved(false); }} placeholder="yourname" autoCapitalize="none" autoCorrect={false} autoComplete="off" containerStyle={styles.handleField} />
        <TextField label="Zelle" hint="Phone or email" value={zelle} onChangeText={(v) => { setZelle(v); setSaved(false); }} placeholder="Optional" autoCapitalize="none" autoCorrect={false} autoComplete="off" containerStyle={styles.handleField} />
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        Anyone with the trip link can see these, so only add what you’re happy to share with the group.
      </ThemedText>
      <Button label={saved ? 'Saved' : 'Save payment details'} icon={saved ? 'check' : undefined} onPress={save} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
    maxWidth: '30%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  transfer: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  transferHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bars: {
    gap: Spacing.three - 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  barBody: {
    flex: 1,
    gap: 4,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  handles: {
    gap: Spacing.three - 4,
  },
  handleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
  },
  handleField: {
    flexGrow: 1,
    flexBasis: 160,
  },
});
