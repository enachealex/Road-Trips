import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateRange, formatDayShort } from '@/lib/dates';
import { getMyTrips } from '@/lib/my-trips';
import { sameName } from '@/lib/people';
import { errorMessage, store } from '@/lib/store';
import type { ListItem, ListKind, TripList } from '@/lib/types';

import { Avatar } from './avatar';
import { Button } from './button';
import { DateInput } from './date-time-input';
import { Icon } from './icon';
import { Chip, Row } from './layout';
import { Sheet } from './sheet';
import { FieldLabel, TextField } from './text-field';
import { ThemedText } from './themed-text';

export const LIST_KINDS: { value: ListKind; label: string }[] = [
  { value: 'packing', label: 'Packing' },
  { value: 'todo', label: 'To-do' },
  { value: 'other', label: 'Other' },
];

export function ListItemRow({
  item,
  today,
  onToggle,
  onEdit,
}: {
  item: ListItem;
  today: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const c = useTheme();
  const overdue = !item.done && !!item.dueDate && item.dueDate < today;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        accessibilityLabel={item.text}
        hitSlop={8}
        style={({ pressed }) => [styles.box, pressed && { opacity: 0.6 }]}>
        <Icon name={item.done ? 'boxChecked' : 'boxEmpty'} size={24} color={item.done ? c.primary : c.textSecondary} />
      </Pressable>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.text}`}
        style={({ pressed }) => [styles.body, pressed && { opacity: 0.7 }]}>
        <ThemedText
          style={item.done ? { color: c.textSecondary, textDecorationLine: 'line-through' } : undefined}
          numberOfLines={3}>
          {item.text}
        </ThemedText>
        {item.assignee || item.dueDate || (item.done && item.doneBy) ? (
          <View style={styles.meta}>
            {item.assignee ? (
              <View style={styles.metaPart}>
                <Avatar name={item.assignee} size={18} />
                <ThemedText type="caption" themeColor="textSecondary">
                  {item.assignee}
                </ThemedText>
              </View>
            ) : null}
            {item.dueDate ? (
              <View
                style={[
                  styles.due,
                  { backgroundColor: overdue ? c.dangerSoft : c.backgroundElement },
                ]}>
                <Icon name="calendar" size={12} color={overdue ? c.danger : c.textSecondary} />
                <ThemedText type="caption" style={{ color: overdue ? c.danger : c.textSecondary }}>
                  {overdue ? `Overdue · ${formatDayShort(item.dueDate)}` : `Due ${formatDayShort(item.dueDate)}`}
                </ThemedText>
              </View>
            ) : null}
            {item.done && item.doneBy ? (
              <ThemedText type="caption" themeColor="textSecondary">
                ✓ {item.doneBy}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Edit an item's text, who it's for and (on to-do lists) when it's due. */
export function ItemEditor({
  item,
  kind,
  travelers,
  onSave,
  onDelete,
  onClose,
}: {
  item: ListItem;
  kind: ListKind;
  travelers: string[];
  onSave: (changes: Pick<ListItem, 'text' | 'assignee' | 'dueDate'>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(item.text);
  const [assignee, setAssignee] = useState<string | null>(item.assignee);
  const [dueDate, setDueDate] = useState(item.dueDate ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const names = [...travelers, ...(assignee && !travelers.some((t) => sameName(t, assignee)) ? [assignee] : [])];

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setFailure(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet visible title="Edit item" onClose={onClose}>
      <TextField label="Item" value={text} onChangeText={setText} maxLength={300} autoFocus />
      {names.length > 0 ? (
        <View style={styles.field}>
          <FieldLabel label="For" />
          <Row>
            <Chip label="Anyone" icon="people" selected={!assignee} onPress={() => setAssignee(null)} />
            {names.map((n) => (
              <Chip key={n} label={n} selected={sameName(assignee, n)} onPress={() => setAssignee(n)} />
            ))}
          </Row>
        </View>
      ) : null}
      {kind === 'todo' ? (
        <View style={styles.field}>
          <FieldLabel label="Due" hint="Optional" />
          <View style={styles.dueRow}>
            <View style={styles.flex}>
              <DateInput value={dueDate} onChange={setDueDate} accessibilityLabel="Due date" />
            </View>
            {dueDate ? <Button label="Clear" compact variant="ghost" onPress={() => setDueDate('')} /> : null}
          </View>
        </View>
      ) : null}
      {failure ? (
        <ThemedText type="caption" themeColor="danger">
          {failure}
        </ThemedText>
      ) : null}
      <Row>
        <Button label="Delete" icon="delete" variant="danger" onPress={() => run(onDelete)} disabled={busy} />
        <Button
          label="Save"
          variant="primary"
          loading={busy}
          disabled={!text.trim()}
          style={styles.flex}
          onPress={() => run(() => onSave({ text: text.trim(), assignee, dueDate: dueDate || null }))}
        />
      </Row>
    </Sheet>
  );
}

/** Name a new list (or rename one) and say what kind it is. */
export function ListNameSheet({
  initial,
  onSave,
  onClose,
}: {
  initial?: { name: string; kind: ListKind };
  onSave: (name: string, kind: ListKind) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ListKind>(initial?.kind ?? 'other');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSave(name.trim(), kind);
      onClose();
    } catch (e) {
      setFailure(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet visible title={initial ? 'Rename list' : 'New list'} onClose={onClose}>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Groceries, Beach gear, Before we leave…"
        maxLength={60}
        autoFocus
        onSubmitEditing={save}
      />
      <View style={styles.field}>
        <FieldLabel label="Kind" hint="To-do lists can have due dates" />
        <Row>
          {LIST_KINDS.map((k) => (
            <Chip key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />
          ))}
        </Row>
      </View>
      {failure ? (
        <ThemedText type="caption" themeColor="danger">
          {failure}
        </ThemedText>
      ) : null}
      <Button label={initial ? 'Save' : 'Create list'} variant="primary" onPress={save} loading={busy} disabled={!name.trim()} />
    </Sheet>
  );
}

/** Copy a list from another trip on this device: unchecked, without due dates. */
export function CopyListSheet({
  currentSlug,
  travelers,
  onCopy,
  onClose,
}: {
  currentSlug: string;
  travelers: string[];
  onCopy: (list: TripList) => Promise<void>;
  onClose: () => void;
}) {
  const c = useTheme();
  const trips = getMyTrips().filter((t) => t.slug !== currentSlug);
  const [lists, setLists] = useState<TripList[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const openTrip = async (slug: string) => {
    setPicked(slug);
    setLists(null);
    setFailure(null);
    try {
      const bundle = await store.getTrip(slug);
      setLists((bundle?.lists ?? []).filter((l) => l.items.length > 0));
    } catch (e) {
      setFailure(errorMessage(e));
      setLists([]);
    }
  };

  const copy = async (list: TripList) => {
    setBusy(list.id);
    setFailure(null);
    try {
      // Keep who an item is for only when that person is on this trip too.
      await onCopy({
        ...list,
        items: list.items.map((i) => ({
          ...i,
          assignee: i.assignee && travelers.some((t) => sameName(t, i.assignee)) ? i.assignee : null,
        })),
      });
      onClose();
    } catch (e) {
      setFailure(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Sheet visible title="Copy a list from another trip" onClose={onClose}>
      {trips.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Lists can be copied from other trips you’ve opened on this device. There aren’t any yet.
        </ThemedText>
      ) : !picked ? (
        <View style={styles.choices}>
          <ThemedText type="small" themeColor="textSecondary">
            Pick a trip to copy from:
          </ThemedText>
          {trips.map((t) => (
            <Pressable
              key={t.slug}
              onPress={() => openTrip(t.slug)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.choice,
                { borderColor: c.border, backgroundColor: pressed ? c.backgroundElement : c.background },
              ]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{t.name}</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {formatDateRange(t.startDate, t.endDate)}
                </ThemedText>
              </View>
              <Icon name="chevronRight" size={18} color={c.textSecondary} />
            </Pressable>
          ))}
        </View>
      ) : lists === null ? (
        <ActivityIndicator color={c.primary} />
      ) : (
        <View style={styles.choices}>
          {lists.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              That trip has no lists with items.
            </ThemedText>
          ) : (
            lists.map((l) => (
              <View key={l.id} style={[styles.choice, { borderColor: c.border }]}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{l.name}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {l.items.length} {l.items.length === 1 ? 'item' : 'items'}
                  </ThemedText>
                </View>
                <Button label="Copy" compact onPress={() => copy(l)} loading={busy === l.id} disabled={!!busy} />
              </View>
            ))
          )}
          <Button label="Pick a different trip" compact variant="ghost" onPress={() => setPicked(null)} />
        </View>
      )}
      {failure ? (
        <ThemedText type="caption" themeColor="danger">
          {failure}
        </ThemedText>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  box: {
    paddingTop: 1,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
    paddingTop: 1,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metaPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  field: {
    gap: Spacing.two,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  choices: {
    gap: Spacing.two,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
});
