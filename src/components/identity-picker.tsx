import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';

import { Avatar } from './avatar';
import { Button } from './button';
import { ThemedText } from './themed-text';

/**
 * "Who are you?" Shown the first time a trip opens on a device, and whenever someone
 * switches person. Names come from the trip's travelers; anyone missing can add themselves.
 */
export function IdentityPicker({
  travelers,
  current,
  suggested,
  onPick,
  onAddSelf,
  onCancel,
}: {
  travelers: string[];
  current: string | null;
  /** The name this device used last on another trip. */
  suggested: string;
  onPick: (name: string) => void;
  onAddSelf: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const c = useTheme();
  const [adding, setAdding] = useState(travelers.length === 0);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const highlight = current ?? suggested;

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = travelers.find((t) => sameName(t, trimmed));
    if (existing) return onPick(existing);
    setBusy(true);
    setFailure(null);
    try {
      await onAddSelf(trimmed);
    } catch (e) {
      setFailure(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="alert">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">{travelers.length ? 'Who’s this?' : 'What’s your name?'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              So everyone can see who added or changed things and who’s talking in the Messenger. You can switch any
              time.
            </ThemedText>

            {travelers.length > 0 ? (
              <View style={styles.names}>
                {travelers.map((t) => {
                  const isHighlighted = sameName(t, highlight);
                  return (
                    <Pressable
                      key={t}
                      onPress={() => onPick(t)}
                      accessibilityRole="button"
                      accessibilityLabel={`I’m ${t}`}
                      style={({ pressed }) => [
                        styles.name,
                        {
                          borderColor: isHighlighted ? c.primary : c.border,
                          backgroundColor: isHighlighted ? c.primarySoft : c.background,
                        },
                        pressed && { opacity: 0.75 },
                      ]}>
                      <Avatar name={t} size={34} />
                      <ThemedText type="heading" style={styles.flex} numberOfLines={1}>
                        {t}
                      </ThemedText>
                      {sameName(t, current) ? (
                        <ThemedText type="caption" themeColor="primary">
                          Current
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {adding ? (
              <View style={styles.addBox}>
                <ThemedText type="smallBold">{travelers.length ? 'Add yourself to the trip' : 'Your name'}</ThemedText>
                <View style={styles.addRow}>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    onSubmitEditing={add}
                    placeholder="e.g. Uncle Joe"
                    placeholderTextColor={c.textSecondary}
                    autoFocus
                    autoComplete="off"
                    autoCorrect={false}
                    maxLength={60}
                    accessibilityLabel="Your name on this trip"
                    style={[styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
                  />
                  <Button label="Join" variant="primary" onPress={add} loading={busy} disabled={!name.trim()} />
                </View>
                {failure ? (
                  <ThemedText type="caption" themeColor="danger">
                    {failure}
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <Button label="I’m not on the list" icon="add" variant="ghost" onPress={() => setAdding(true)} />
            )}

            <Button label="Not now" onPress={onCancel} compact style={styles.later} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  names: {
    gap: Spacing.two,
  },
  name: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.two + 2,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  addBox: {
    gap: Spacing.two,
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
  later: {
    alignSelf: 'center',
  },
});
