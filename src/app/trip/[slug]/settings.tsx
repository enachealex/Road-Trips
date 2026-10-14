import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { Banner, Card, Chip, IconTile, Row, Screen, SectionTitle, Toast } from '@/components/layout';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { TripForm } from '@/components/trip-form';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRelative } from '@/lib/dates';
import { buildIcs, icsFilename } from '@/lib/ics';
import { KINDS } from '@/lib/kinds';
import { forgetTrip, getMyName, setMyName } from '@/lib/my-trips';
import { copyText, downloadTextFile, shareLink, tripUrl } from '@/lib/share';
import { errorMessage, isDemoMode } from '@/lib/store';
import { useLoadedTrip } from '@/lib/trip-context';

export default function TripSettingsScreen() {
  const c = useTheme();
  const confirm = useConfirm();
  const { slug, bundle, traveler, updateTrip, restoreEvent, deleteTrip } = useLoadedTrip();
  const { trip, events, deletedEvents } = bundle;
  const [toast, setToast] = useState<string | null>(null);
  const [calendarFor, setCalendarFor] = useState<string | null>(traveler);
  const [name, setName] = useState(getMyName);
  const [failure, setFailure] = useState<string | null>(null);
  const link = tripUrl(slug);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const downloadCalendar = () => {
    const ics = buildIcs(trip, events, {
      traveler: calendarFor,
      eventUrl: (e) => tripUrl(slug, `/event/${e.id}`),
    });
    if (downloadTextFile(icsFilename(trip, calendarFor), ics, 'text/calendar')) flash('Calendar file downloaded');
  };

  const removeFromDevice = async () => {
    const ok = await confirm({
      title: 'Remove from this device?',
      message: 'The trip stays as it is for everyone else. You can open it again from the link.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    forgetTrip(slug);
    router.replace('/');
  };

  const deleteForEveryone = async () => {
    const ok = await confirm({
      title: `Delete “${trip.name}” for everyone?`,
      message: 'The link will stop working for the whole family. This can’t be undone from the app.',
      confirmLabel: 'Delete trip',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTrip();
      forgetTrip(slug);
      router.replace('/');
    } catch (e) {
      setFailure(errorMessage(e));
    }
  };

  return (
    <Screen footer={<Toast message={toast} />}>
      <SectionTitle>Share with the family</SectionTitle>
      <Card>
        {isDemoMode ? (
          <Banner icon="warning" tone="warning">
            Demo mode: this link only works in this browser until the server is connected.
          </Banner>
        ) : null}
        <View style={[styles.linkBox, { backgroundColor: c.backgroundElement }]}>
          <ThemedText type="code" selectable numberOfLines={2}>
            {link}
          </ThemedText>
        </View>
        <Row>
          <Button
            label="Copy link"
            icon="copy"
            variant="primary"
            onPress={() => {
              void copyText(link).then((ok) => flash(ok ? 'Link copied' : 'Couldn’t copy. Select the link instead.'));
            }}
          />
          <Button
            label="Share…"
            icon="share"
            onPress={async () => {
              if ((await shareLink(trip.name, link)) === 'copied') flash('Link copied');
            }}
          />
        </Row>
        <ThemedText type="caption" themeColor="textSecondary">
          Anyone with this link can see the trip and make changes, so share it only with the people going.
        </ThemedText>
      </Card>

      {Platform.OS === 'web' ? (
        <>
          <SectionTitle>Add to your calendar</SectionTitle>
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Downloads the plan as a calendar file that phones and computers can import. Download it again after
              big changes.
            </ThemedText>
            {trip.travelers.length > 0 ? (
              <Row>
                <Chip label="Everyone" icon="people" selected={!calendarFor} onPress={() => setCalendarFor(null)} />
                {trip.travelers.map((t) => (
                  <Chip key={t} label={t} selected={calendarFor === t} onPress={() => setCalendarFor(t)} />
                ))}
              </Row>
            ) : null}
            <Button
              label={calendarFor ? `Download ${calendarFor}’s calendar` : 'Download calendar'}
              icon="calendar"
              onPress={downloadCalendar}
              disabled={events.length === 0}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>Trip details</SectionTitle>
      <TripForm
        initial={{
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          travelers: trip.travelers,
          notes: trip.notes,
        }}
        submitLabel="Save trip details"
        onSubmit={async (input) => {
          await updateTrip(input);
          flash('Trip details saved');
        }}
      />

      {deletedEvents.length > 0 ? (
        <>
          <SectionTitle>Recently deleted</SectionTitle>
          <Card style={styles.list}>
            {deletedEvents.map((e) => (
              <View key={e.id} style={styles.deletedRow}>
                <IconTile icon={KINDS[e.kind].icon} color={KINDS[e.kind].color} size={36} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {e.title}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {e.updatedBy ? `Deleted by ${e.updatedBy} ` : 'Deleted '}
                    {formatRelative(e.deletedAt!)}
                  </ThemedText>
                </View>
                <Button
                  label="Restore"
                  icon="restore"
                  compact
                  onPress={async () => {
                    try {
                      await restoreEvent(e.id);
                      flash(`Restored “${e.title}”`);
                    } catch (err) {
                      setFailure(errorMessage(err));
                    }
                  }}
                />
              </View>
            ))}
          </Card>
          <ThemedText type="caption" themeColor="textSecondary">
            Deleted items can be restored for 30 days.
          </ThemedText>
        </>
      ) : null}

      <SectionTitle>On this device</SectionTitle>
      <Card>
        <TextField
          label="Your name"
          hint="Shown as who made changes"
          value={name}
          onChangeText={setName}
          onBlur={() => setMyName(name)}
          onSubmitEditing={() => {
            setMyName(name);
            flash('Name saved');
          }}
          autoComplete="name"
          placeholder="Your name"
        />
        <Button label="Remove from this device" icon="close" onPress={removeFromDevice} />
      </Card>

      {failure ? <Banner icon="warning" tone="danger">{failure}</Banner> : null}

      <SectionTitle>Danger zone</SectionTitle>
      <Card style={{ borderColor: c.dangerSoft }}>
        <ThemedText type="small" themeColor="textSecondary">
          Deleting the trip removes it for everyone who has the link.
        </ThemedText>
        <Button label="Delete trip for everyone" icon="delete" variant="danger" onPress={deleteForEveryone} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  linkBox: {
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  list: {
    padding: Spacing.two,
    gap: Spacing.two,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.one,
  },
});
