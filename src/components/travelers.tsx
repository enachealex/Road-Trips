import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { Icon } from './icon';
import { Chip, Row } from './layout';
import { FieldLabel } from './text-field';
import { ThemedText } from './themed-text';

/** Edits the list of people on a trip. */
export function TravelerListInput({ value, onChange }: { value: string[]; onChange: (names: string[]) => void }) {
  const c = useTheme();
  const [draft, setDraft] = useState('');

  const add = () => {
    const names = draft
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const next = [...value];
    for (const name of names) {
      if (!next.some((n) => n.toLowerCase() === name.toLowerCase())) next.push(name);
    }
    onChange(next);
    setDraft('');
  };

  return (
    <View style={styles.field}>
      <FieldLabel label="Who’s going" hint="Optional" />
      {value.length > 0 ? (
        <Row>
          {value.map((name) => (
            <Pressable
              key={name}
              onPress={() => onChange(value.filter((n) => n !== name))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${name}`}
              style={({ pressed }) => [
                styles.removable,
                { backgroundColor: c.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText type="smallBold">{name}</ThemedText>
              <Icon name="close" size={16} color={c.textSecondary} />
            </Pressable>
          ))}
        </Row>
      ) : null}
      <View style={styles.addRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          submitBehavior="submit"
          placeholder="Add a name, e.g. Grandma"
          placeholderTextColor={c.textSecondary}
          accessibilityLabel="Add a traveler"
          style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
        />
        <Button label="Add" onPress={add} disabled={!draft.trim()} />
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        Lets everyone filter the plan to just their own flights, rooms and plans.
      </ThemedText>
    </View>
  );
}

/** Picks who an event applies to. Nobody selected means everyone. */
export function TravelerPicker({
  travelers,
  value,
  onChange,
}: {
  travelers: string[];
  value: string[];
  onChange: (names: string[]) => void;
}) {
  // Keep names that were removed from the trip but are still on this event visible.
  const names = [...travelers, ...value.filter((v) => !travelers.some((t) => t.toLowerCase() === v.toLowerCase()))];
  const isSelected = (name: string) => value.some((v) => v.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) =>
    onChange(isSelected(name) ? value.filter((v) => v.toLowerCase() !== name.toLowerCase()) : [...value, name]);

  return (
    <Row>
      <Chip label="Everyone" icon="people" selected={value.length === 0} onPress={() => onChange([])} />
      {names.map((name) => (
        <Chip key={name} label={name} selected={isSelected(name)} onPress={() => toggle(name)} />
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  removable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 34,
    paddingLeft: Spacing.three - 4,
    paddingRight: Spacing.two,
    borderRadius: Radius.pill,
  },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 4,
    fontSize: 16,
  },
});
