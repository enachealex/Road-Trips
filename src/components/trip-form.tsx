import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { daysBetween, isValidDate } from '@/lib/dates';
import { getMyName } from '@/lib/my-trips';
import { sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';
import type { TripInput } from '@/lib/types';

import { Button } from './button';
import { DateInput } from './date-time-input';
import { Banner, Card } from './layout';
import { FieldLabel, TextField } from './text-field';
import { TravelerListInput } from './travelers';
import { ThemedText } from './themed-text';

const EMPTY: TripInput = { name: '', startDate: '', endDate: '', travelers: [], notes: '' };

export function TripForm({
  initial = EMPTY,
  submitLabel,
  askOrganizer = false,
  onSubmit,
}: {
  initial?: TripInput;
  submitLabel: string;
  /** New trips ask who is planning, who is added to the travelers and signed in on this device. */
  askOrganizer?: boolean;
  onSubmit: (input: TripInput, organizer: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TripInput>(initial);
  const [organizer, setOrganizer] = useState(() => (askOrganizer ? getMyName() : ''));
  const [errors, setErrors] = useState<Partial<Record<keyof TripInput | 'organizer', string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TripInput>(key: K, value: TripInput[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const validate = () => {
    const next: typeof errors = {};
    if (askOrganizer && !organizer.trim()) next.organizer = 'Add your name so everyone knows who planned this.';
    if (!draft.name.trim()) next.name = 'Give the trip a name.';
    if (!isValidDate(draft.startDate)) next.startDate = 'Pick the first day.';
    if (!isValidDate(draft.endDate)) next.endDate = 'Pick the last day.';
    else if (isValidDate(draft.startDate)) {
      if (draft.endDate < draft.startDate) next.endDate = 'The last day can’t be before the first.';
      else if (daysBetween(draft.startDate, draft.endDate) > 366) next.endDate = 'Trips can be up to a year long.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setFailure(null);
    try {
      const me = organizer.trim();
      const travelers =
        askOrganizer && !draft.travelers.some((t) => sameName(t, me)) ? [me, ...draft.travelers] : draft.travelers;
      await onSubmit({ ...draft, name: draft.name.trim(), travelers }, me);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      {askOrganizer ? (
        <Card>
          <TextField
            label="Who’s planning this?"
            hint="You’re added to the trip"
            value={organizer}
            onChangeText={setOrganizer}
            placeholder="e.g. Mom, Alex, Grandpa Joe"
            error={errors.organizer}
            maxLength={60}
            autoComplete="off"
            autoCorrect={false}
          />
        </Card>
      ) : null}
      <Card>
        <TextField
          label="Trip name"
          value={draft.name}
          onChangeText={(v) => set('name', v)}
          placeholder="Summer road trip 2027"
          error={errors.name}
          maxLength={120}
          autoFocus={!initial.name}
        />
        <View style={styles.dates}>
          <View style={styles.dateField}>
            <FieldLabel label="First day" />
            <DateInput
              value={draft.startDate}
              accessibilityLabel="First day"
              invalid={!!errors.startDate}
              onChange={(v) => {
                setDraft((d) => ({ ...d, startDate: v, endDate: d.endDate && d.endDate >= v ? d.endDate : v }));
              }}
            />
            {errors.startDate ? <ThemedText type="caption" themeColor="danger">{errors.startDate}</ThemedText> : null}
          </View>
          <View style={styles.dateField}>
            <FieldLabel label="Last day" />
            <DateInput
              value={draft.endDate}
              min={draft.startDate || undefined}
              accessibilityLabel="Last day"
              invalid={!!errors.endDate}
              onChange={(v) => set('endDate', v)}
            />
            {errors.endDate ? <ThemedText type="caption" themeColor="danger">{errors.endDate}</ThemedText> : null}
          </View>
        </View>
      </Card>

      <Card>
        <TravelerListInput value={draft.travelers} onChange={(v) => set('travelers', v)} />
      </Card>

      <Card>
        <TextField
          label="Trip notes"
          hint="Optional"
          value={draft.notes}
          onChangeText={(v) => set('notes', v)}
          placeholder="The route, emergency contacts, packing reminders…"
          multiline
        />
      </Card>

      {failure ? (
        <Banner icon="warning" tone="danger">
          {failure}
        </Banner>
      ) : null}
      <Button label={submitLabel} variant="primary" onPress={submit} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  dates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  dateField: {
    flexGrow: 1,
    flexBasis: 200,
    gap: Spacing.one + 2,
  },
});
