import { useState } from 'react';
import { RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { Card, Chip, Row, Screen, SectionTitle, Segmented, Toast } from '@/components/layout';
import { CopyListSheet, ItemEditor, ListItemRow, ListNameSheet } from '@/components/lists';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { nowLocal } from '@/lib/dates';
import { sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';
import { useLoadedTrip } from '@/lib/trip-context';
import type { ListItem, ListKind, TripList } from '@/lib/types';

type Filter = 'all' | 'mine' | 'unassigned';

const DONE_WORD: Record<ListKind, string> = { packing: 'packed', todo: 'done', other: 'checked' };

/** Open items: to-dos by due date, everything else in the order added. */
function sortOpen(items: ListItem[], kind: ListKind): ListItem[] {
  if (kind !== 'todo') return items;
  return [...items].sort(
    (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.position - b.position,
  );
}

/** Shared packing lists, to-dos and any other checklists. */
export default function ListsScreen() {
  const c = useTheme();
  const confirm = useConfirm();
  const { slug, bundle, me, refresh, refreshing, saveList, deleteList, saveListItem, deleteListItem } = useLoadedTrip();
  const lists = bundle.lists ?? [];
  const travelers = bundle.trip.travelers;
  const today = nowLocal().date;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [sheet, setSheet] = useState<'new' | 'rename' | 'copy' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const list: TripList | undefined = lists.find((l) => l.id === activeId) ?? lists[0];
  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const matches = (i: ListItem) =>
    filter === 'all' ? true : filter === 'mine' ? sameName(i.assignee, me) : !i.assignee;
  const visible = (list?.items ?? []).filter(matches);
  const open = sortOpen(visible.filter((i) => !i.done), list?.kind ?? 'other');
  const done = visible.filter((i) => i.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  const run = async (action: () => Promise<unknown>) => {
    setFailure(null);
    try {
      await action();
    } catch (e) {
      setFailure(errorMessage(e));
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text || !list || adding) return;
    setAdding(true);
    await run(async () => {
      await saveListItem({ listId: list.id, text, assignee: filter === 'mine' ? me : null });
      setDraft('');
    });
    setAdding(false);
  };

  const removeList = async () => {
    if (!list) return;
    const ok = await confirm({
      title: `Delete “${list.name}”?`,
      message: `Its ${list.items.length} ${list.items.length === 1 ? 'item goes' : 'items go'} too, for everyone.`,
      confirmLabel: 'Delete list',
      destructive: true,
    });
    if (ok) {
      await run(() => deleteList(list.id));
      setActiveId(null);
    }
  };

  if (lists.length === 0) {
    return (
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Card>
          <ThemedText type="heading">No lists yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Shared checklists for the trip: what to pack, what to book, what to buy.
          </ThemedText>
          <Row>
            <Button label="Packing list" icon="add" variant="primary" onPress={() => run(() => saveList({ name: 'Packing', kind: 'packing' }))} />
            <Button label="To-do list" icon="add" onPress={() => run(() => saveList({ name: 'To-do', kind: 'todo' }))} />
          </Row>
          {failure ? <ThemedText type="caption" themeColor="danger">{failure}</ThemedText> : null}
        </Card>
      </Screen>
    );
  }

  const total = visible.length;
  const word = DONE_WORD[list!.kind];

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      footer={<Toast message={toast} />}>
      <Row>
        {lists.map((l) => {
          const left = l.items.filter((i) => !i.done).length;
          return (
            <Chip
              key={l.id}
              label={left ? `${l.name} · ${left}` : l.name}
              icon={l.kind === 'packing' ? 'bag' : l.kind === 'todo' ? 'checklist' : undefined}
              selected={l.id === list!.id}
              onPress={() => {
                setActiveId(l.id);
                setShowDone(false);
              }}
            />
          );
        })}
        <Chip label="New list" icon="add" onPress={() => setSheet('new')} />
      </Row>

      {travelers.length > 0 ? (
        <Segmented
          options={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: me ? `Mine (${me})` : 'Mine' },
            { value: 'unassigned', label: 'Unassigned' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      ) : null}

      <Card style={styles.listCard}>
        <View style={styles.progressHead}>
          <ThemedText type="heading" style={styles.flex}>
            {list!.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {total ? `${done.length} of ${total} ${word}` : 'Empty'}
          </ThemedText>
        </View>
        {total > 0 ? (
          <View style={[styles.track, { backgroundColor: c.backgroundElement }]} accessibilityElementsHidden>
            <View
              style={[styles.fill, { backgroundColor: c.primary, width: `${Math.round((done.length / total) * 100)}%` }]}
            />
          </View>
        ) : null}

        {open.map((item, i) => (
          <View key={item.id}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
            <ListItemRow
              item={item}
              today={today}
              onToggle={() => run(() => saveListItem({ id: item.id, listId: item.listId, done: true }))}
              onEdit={() => setEditing(item)}
            />
          </View>
        ))}
        {open.length === 0 && total > 0 ? (
          <View style={styles.allDone}>
            <Icon name="check" size={18} color={c.primary} />
            <ThemedText type="smallBold" themeColor="primary">
              All {word}!
            </ThemedText>
          </View>
        ) : null}

        <View style={[styles.addRow, { borderColor: c.border }]}>
          <Icon name="add" size={20} color={c.textSecondary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            submitBehavior="submit"
            placeholder={filter === 'mine' && me ? `Add for ${me}…` : `Add to ${list!.name}…`}
            placeholderTextColor={c.textSecondary}
            accessibilityLabel={`Add an item to ${list!.name}`}
            maxLength={300}
            style={[styles.addInput, { color: c.text }]}
          />
          {draft.trim() ? <Button label="Add" compact variant="primary" onPress={add} loading={adding} /> : null}
        </View>
      </Card>

      {done.length > 0 ? (
        <>
          <Button
            label={showDone ? `Hide ${word} (${done.length})` : `Show ${word} (${done.length})`}
            icon={showDone ? 'chevronDown' : 'check'}
            variant="ghost"
            onPress={() => setShowDone((s) => !s)}
          />
          {showDone ? (
            <Card style={styles.listCard}>
              {done.map((item, i) => (
                <View key={item.id}>
                  {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                  <ListItemRow
                    item={item}
                    today={today}
                    onToggle={() => run(() => saveListItem({ id: item.id, listId: item.listId, done: false }))}
                    onEdit={() => setEditing(item)}
                  />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {failure ? (
        <ThemedText type="caption" themeColor="danger">
          {failure}
        </ThemedText>
      ) : null}

      <SectionTitle>This list</SectionTitle>
      <Row>
        <Button label="Rename" icon="edit" compact onPress={() => setSheet('rename')} />
        <Button label="Copy from another trip" icon="duplicate" compact onPress={() => setSheet('copy')} />
        <Button label="Delete list" icon="delete" compact variant="danger" onPress={removeList} />
      </Row>

      {editing ? (
        <ItemEditor
          item={editing}
          kind={list!.kind}
          travelers={travelers}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            await saveListItem({ id: editing.id, listId: editing.listId, ...changes });
          }}
          onDelete={() => deleteListItem(editing.id)}
        />
      ) : null}
      {sheet === 'new' ? (
        <ListNameSheet
          onClose={() => setSheet(null)}
          onSave={async (name, kind) => {
            const created = await saveList({ name, kind });
            setActiveId(created.id);
          }}
        />
      ) : null}
      {sheet === 'rename' ? (
        <ListNameSheet
          initial={{ name: list!.name, kind: list!.kind }}
          onClose={() => setSheet(null)}
          onSave={async (name, kind) => {
            await saveList({ id: list!.id, name, kind });
          }}
        />
      ) : null}
      {sheet === 'copy' ? (
        <CopyListSheet
          currentSlug={slug}
          travelers={travelers}
          onClose={() => setSheet(null)}
          onCopy={async (source) => {
            const created = await saveList({
              name: source.name,
              kind: source.kind,
              items: source.items.map((i) => ({ text: i.text, assignee: i.assignee })),
            });
            setActiveId(created.id);
            flash(`Copied “${source.name}” with ${source.items.length} items`);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listCard: {
    padding: Spacing.two,
    gap: 0,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
  },
  track: {
    height: 6,
    borderRadius: Radius.pill,
    marginHorizontal: Spacing.two,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: Radius.pill,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
  allDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three - 4,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 16,
  },
});
