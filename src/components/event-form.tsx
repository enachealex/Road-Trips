import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isValidDate, isValidTime } from '@/lib/dates';
import { fallbackTitle, KIND_ORDER, KINDS } from '@/lib/kinds';
import { getMyName, setMyName } from '@/lib/my-trips';
import { errorMessage } from '@/lib/store';
import type { EventInput, EventKind, Trip } from '@/lib/types';

import { Button } from './button';
import { DateInput, TimeInput } from './date-time-input';
import { Banner, Card, Chip, Row, SectionTitle } from './layout';
import { FieldLabel, TextField } from './text-field';
import { TravelerPicker } from './travelers';
import { ThemedText } from './themed-text';

type Draft = Omit<EventInput, 'startTime' | 'endDate' | 'endTime' | 'updatedBy'> & {
  startTime: string;
  endDate: string;
  endTime: string;
};

type FieldErrors = Partial<Record<'startDate' | 'startTime' | 'endDate' | 'endTime', string>>;

export function blankEvent(kind: EventKind, date: string): EventInput {
  return {
    kind,
    title: '',
    startDate: date,
    startTime: null,
    endDate: null,
    endTime: null,
    location: '',
    address: '',
    endLocation: '',
    endAddress: '',
    confirmation: '',
    url: '',
    phone: '',
    notes: '',
    travelers: [],
    details: {},
    updatedBy: '',
  };
}

function toDraft(e: EventInput): Draft {
  return { ...e, startTime: e.startTime ?? '', endDate: e.endDate ?? '', endTime: e.endTime ?? '' };
}

function DateTimePair({
  label,
  date,
  time,
  onDate,
  onTime,
  dateError,
  timeError,
  min,
  optional,
}: {
  label: string;
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  dateError?: string;
  timeError?: string;
  min?: string;
  optional?: boolean;
}) {
  return (
    <View style={styles.pair}>
      <View style={styles.pairDate}>
        <FieldLabel label={`${label} date`} hint={optional ? 'Optional' : undefined} />
        <DateInput value={date} onChange={onDate} min={min} accessibilityLabel={`${label} date`} invalid={!!dateError} />
      </View>
      <View style={styles.pairTime}>
        <FieldLabel label="Time" hint="Optional" />
        <TimeInput value={time} onChange={onTime} accessibilityLabel={`${label} time`} invalid={!!timeError} />
      </View>
    </View>
  );
}

export function EventForm({
  trip,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  trip: Trip;
  initial: EventInput;
  submitLabel: string;
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel: () => void;
}) {
  const c = useTheme();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [needsName] = useState(() => !getMyName());
  const [name, setName] = useState('');

  const k = KINDS[draft.kind];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setDetail = (key: string, value: string) => setDraft((d) => ({ ...d, details: { ...d.details, [key]: value } }));

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!isValidDate(draft.startDate)) next.startDate = 'Pick a date.';
    if (draft.startTime && !isValidTime(draft.startTime)) next.startTime = 'Use a time like 14:30.';
    if (draft.endDate && !isValidDate(draft.endDate)) next.endDate = 'That date isn’t valid.';
    if (draft.endTime && !isValidTime(draft.endTime)) next.endTime = 'Use a time like 14:30.';
    if (!next.startDate && !next.endDate && draft.endDate && draft.endDate < draft.startDate) {
      next.endDate = `${k.endLabel} can’t be before ${k.startLabel.toLowerCase()}.`;
    }
    const endDay = draft.endDate || draft.startDate;
    if (
      !next.startTime &&
      !next.endTime &&
      draft.startTime &&
      draft.endTime &&
      endDay === draft.startDate &&
      draft.endTime < draft.startTime
    ) {
      next.endTime = `Ends before it starts. If it runs overnight, set the ${k.endLabel.toLowerCase()} date to the next day.`;
    }
    return next;
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailure('Check the highlighted dates and times.');
      return;
    }
    if (needsName && name.trim()) setMyName(name);

    // Drop details that belong to other kinds or were left blank.
    const details: Record<string, string> = {};
    for (const field of k.details) {
      const value = draft.details[field.key]?.trim();
      if (value) details[field.key] = value;
    }
    const placeFields =
      k.places === 'route'
        ? { location: draft.location.trim(), endLocation: draft.endLocation.trim(), address: '', endAddress: '' }
        : k.places === 'place'
          ? {
              location: k.askPlaceName ? draft.location.trim() : '',
              address: draft.address.trim(),
              endLocation: '',
              endAddress: '',
            }
          : { location: '', address: '', endLocation: '', endAddress: '' };

    const input: EventInput = {
      ...draft,
      ...placeFields,
      details,
      startTime: draft.startTime || null,
      // An end time on its own means the same day.
      endDate: draft.endDate || (draft.endTime ? draft.startDate : null),
      endTime: draft.endTime || null,
      confirmation: k.askConfirmation ? draft.confirmation.trim() : '',
      phone: k.askPhone ? draft.phone.trim() : '',
      url: draft.url.trim(),
      notes: draft.notes.trim(),
      updatedBy: '',
    };
    input.title = draft.title.trim() || fallbackTitle(input);

    setSaving(true);
    setFailure(null);
    try {
      await onSubmit(input);
    } catch (e) {
      setFailure(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <SectionTitle>What</SectionTitle>
      <Card>
        <Row>
          {KIND_ORDER.map((kind) => (
            <Chip
              key={kind}
              label={KINDS[kind].label}
              icon={KINDS[kind].icon}
              color={KINDS[kind].color}
              selected={draft.kind === kind}
              onPress={() => set('kind', kind)}
            />
          ))}
        </Row>
        {k.details.length > 0 ? (
          <View style={styles.grid}>
            {k.details.map((field) => (
              <TextField
                containerStyle={styles.gridItem}
                key={field.key}
                label={field.label}
                hint="Optional"
                value={draft.details[field.key] ?? ''}
                onChangeText={(v) => setDetail(field.key, v)}
                placeholder={field.placeholder}
              />
            ))}
          </View>
        ) : null}
        <TextField
          label={draft.kind === 'lodging' ? 'Name' : 'Title'}
          value={draft.title}
          onChangeText={(v) => set('title', v)}
          placeholder={k.titlePlaceholder}
          maxLength={200}
        />
      </Card>

      <SectionTitle>When</SectionTitle>
      <Card>
        <DateTimePair
          label={k.startLabel}
          date={draft.startDate}
          time={draft.startTime}
          onDate={(v) => setDraft((d) => ({ ...d, startDate: v, endDate: d.endDate && d.endDate < v ? v : d.endDate }))}
          onTime={(v) => set('startTime', v)}
          dateError={errors.startDate}
          timeError={errors.startTime}
        />
        <DateTimePair
          label={k.endLabel}
          date={draft.endDate}
          time={draft.endTime}
          onDate={(v) => set('endDate', v)}
          onTime={(v) => set('endTime', v)}
          dateError={errors.endDate}
          timeError={errors.endTime}
          min={draft.startDate || undefined}
          optional
        />
        {errors.endDate || errors.endTime ? (
          <ThemedText type="caption" themeColor="danger">
            {errors.endDate ?? errors.endTime}
          </ThemedText>
        ) : (
          <ThemedText type="caption" themeColor="textSecondary">
            Use the local time where it happens, like the time printed on the ticket.
          </ThemedText>
        )}
      </Card>

      {k.places !== 'none' ? (
        <>
          <SectionTitle>Where</SectionTitle>
          <Card>
            {k.places === 'route' ? (
              <View style={styles.grid}>
                <TextField
                  containerStyle={styles.gridItem}
                  label={k.fromLabel}
                  value={draft.location}
                  onChangeText={(v) => set('location', v)}
                  placeholder={draft.kind === 'flight' ? 'DFW' : 'City or address'}
                />
                <TextField
                  containerStyle={styles.gridItem}
                  label={k.toLabel}
                  value={draft.endLocation}
                  onChangeText={(v) => set('endLocation', v)}
                  placeholder={draft.kind === 'flight' ? 'SFO' : 'City or address'}
                />
              </View>
            ) : (
              <>
                {k.askPlaceName ? (
                  <TextField
                    label="Place"
                    hint="Optional"
                    value={draft.location}
                    onChangeText={(v) => set('location', v)}
                    placeholder="Monterey Bay Aquarium"
                  />
                ) : null}
                <TextField
                  label="Address"
                  hint="Optional"
                  value={draft.address}
                  onChangeText={(v) => set('address', v)}
                  placeholder="886 Cannery Row, Monterey, CA"
                />
              </>
            )}
          </Card>
        </>
      ) : null}

      <SectionTitle>Who</SectionTitle>
      <Card>
        <TravelerPicker travelers={trip.travelers} value={draft.travelers} onChange={(v) => set('travelers', v)} />
        {trip.travelers.length === 0 ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Add the people going in the trip settings to assign plans to specific people.
          </ThemedText>
        ) : null}
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        {k.askConfirmation || k.askPhone ? (
          <View style={styles.grid}>
            {k.askConfirmation ? (
              <TextField
                containerStyle={styles.gridItem}
                label="Confirmation #"
                hint="Optional"
                value={draft.confirmation}
                onChangeText={(v) => set('confirmation', v)}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            ) : null}
            {k.askPhone ? (
              <TextField
                containerStyle={styles.gridItem}
                label="Phone"
                hint="Optional"
                value={draft.phone}
                onChangeText={(v) => set('phone', v)}
                keyboardType="phone-pad"
              />
            ) : null}
          </View>
        ) : null}
        <TextField
          label="Link"
          hint="Optional"
          value={draft.url}
          onChangeText={(v) => set('url', v)}
          placeholder="Booking page, tickets, menu…"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Notes"
          hint="Optional"
          value={draft.notes}
          onChangeText={(v) => set('notes', v)}
          placeholder="Anything everyone should know"
          multiline
        />
      </Card>

      {needsName ? (
        <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
          <TextField
            label="Your name"
            hint="Asked once"
            value={name}
            onChangeText={setName}
            placeholder="So others can see who made changes"
            autoComplete="name"
          />
        </Card>
      ) : null}

      {failure ? (
        <Banner icon="warning" tone="danger">
          {failure}
        </Banner>
      ) : null}
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} style={styles.action} />
        <Button label={submitLabel} variant="primary" onPress={submit} loading={saving} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three - 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: 200,
  },
  pair: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three - 4,
  },
  pairDate: {
    flexGrow: 3,
    flexBasis: 180,
    gap: Spacing.one + 2,
  },
  pairTime: {
    flexGrow: 2,
    flexBasis: 120,
    gap: Spacing.one + 2,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
    marginTop: Spacing.two,
  },
  action: {
    flex: 1,
  },
});
