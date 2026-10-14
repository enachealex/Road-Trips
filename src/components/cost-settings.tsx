import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CURRENCIES } from '@/lib/money';
import { sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';
import type { Household, TripPatch } from '@/lib/types';

import { Button, IconButton } from './button';
import { Card, Chip, Row } from './layout';
import { FieldLabel, TextField } from './text-field';
import { ThemedText } from './themed-text';

/** The trip's currency, and the households that settle up together. */
export function CostSettings({
  currency,
  households: initialHouseholds,
  travelers,
  onSave,
  onSaved,
}: {
  currency: string;
  households: Household[];
  travelers: string[];
  onSave: (patch: TripPatch) => Promise<void>;
  onSaved: (message: string) => void;
}) {
  const c = useTheme();
  const [households, setHouseholds] = useState<Household[]>(initialHouseholds);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

  const save = async (patch: TripPatch, message: string) => {
    setSaving(true);
    setFailure(null);
    try {
      await onSave(patch);
      onSaved(message);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // Someone belongs to at most one household: adding them to one takes them out of another.
  const toggleMember = (index: number, name: string) =>
    setHouseholds((hs) =>
      hs.map((h, i) => {
        const has = h.members.some((m) => sameName(m, name));
        if (i === index) return { ...h, members: has ? h.members.filter((m) => !sameName(m, name)) : [...h.members, name] };
        return has ? { ...h, members: h.members.filter((m) => !sameName(m, name)) } : h;
      }),
    );

  return (
    <View style={styles.wrap}>
      <Card>
        <FieldLabel label="Currency" hint="For every cost on this trip" />
        <Row>
          {currencies.map((code) => (
            <Chip
              key={code}
              label={code}
              selected={code === currency}
              onPress={() => {
                if (code !== currency) void save({ currency: code }, `Costs are now in ${code}`);
              }}
            />
          ))}
        </Row>
        <ThemedText type="caption" themeColor="textSecondary">
          Changing it relabels the amounts already entered; it doesn’t convert them.
        </ThemedText>
      </Card>

      <Card>
        <FieldLabel label="Households" hint="Optional" />
        <ThemedText type="small" themeColor="textSecondary">
          Families can settle up as one: costs are still split per person, and Costs can show who owes what by
          household.
        </ThemedText>
        {households.map((h, i) => (
          <View key={i} style={[styles.household, { borderColor: c.border }]}>
            <View style={styles.householdHead}>
              <TextField
                label="Household name"
                value={h.name}
                onChangeText={(v) => setHouseholds((hs) => hs.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                placeholder="The Smiths"
                maxLength={60}
                autoComplete="off"
                containerStyle={styles.flex}
              />
              <IconButton
                icon="delete"
                onPress={() => setHouseholds((hs) => hs.filter((_, j) => j !== i))}
                accessibilityLabel={`Remove ${h.name || 'household'}`}
              />
            </View>
            {travelers.length > 0 ? (
              <Row>
                {travelers.map((t) => (
                  <Chip key={t} label={t} selected={h.members.some((m) => sameName(m, t))} onPress={() => toggleMember(i, t)} />
                ))}
              </Row>
            ) : (
              <ThemedText type="caption" themeColor="textSecondary">
                Add travelers to the trip first.
              </ThemedText>
            )}
          </View>
        ))}
        <Row>
          <Button
            label="Add a household"
            icon="add"
            compact
            onPress={() => setHouseholds((hs) => [...hs, { name: '', members: [] }])}
          />
          <Button
            label="Save households"
            variant="primary"
            compact
            loading={saving}
            onPress={() =>
              save(
                { households: households.filter((h) => h.name.trim()) },
                households.length ? 'Households saved' : 'Households removed',
              )
            }
          />
        </Row>
        {failure ? (
          <ThemedText type="caption" themeColor="danger">
            {failure}
          </ThemedText>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  wrap: {
    gap: Spacing.three,
  },
  household: {
    gap: Spacing.two,
    padding: Spacing.three - 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  householdHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
});
