import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, formatClock } from '@/lib/dates';
import { KINDS } from '@/lib/kinds';
import { personColor, sameName } from '@/lib/people';
import { errorMessage } from '@/lib/store';
import { useLoadedTrip } from '@/lib/trip-context';
import type { Message, TripEvent } from '@/lib/types';

const POLL_MS = 15_000;
const GROUP_GAP_MS = 5 * 60_000;

function EventChip({ slug, event, mine }: { slug: string; event: TripEvent | undefined; mine: boolean }) {
  const c = useTheme();
  const fg = mine ? c.onPrimary : c.text;
  if (!event) {
    return (
      <ThemedText type="caption" style={{ color: fg, opacity: 0.8 }}>
        About an item that was deleted
      </ThemedText>
    );
  }
  const k = KINDS[event.kind];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trip/[slug]/event/[eventId]', params: { slug, eventId: event.id } })}
      accessibilityRole="link"
      accessibilityLabel={`About ${event.title}`}
      style={({ pressed }) => [
        styles.eventChip,
        { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : c.backgroundElement },
        pressed && { opacity: 0.7 },
      ]}>
      <Icon name={k.icon} size={16} color={mine ? fg : k.color} />
      <ThemedText type="caption" style={{ color: fg, flexShrink: 1 }} numberOfLines={1}>
        {event.title}
      </ThemedText>
    </Pressable>
  );
}

function Bubble({
  slug,
  message,
  mine,
  showAuthor,
  showTime,
  event,
  onDelete,
}: {
  slug: string;
  message: Message;
  mine: boolean;
  showAuthor: boolean;
  showTime: boolean;
  event: TripEvent | undefined;
  onDelete: () => void;
}) {
  const c = useTheme();
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {!mine ? <View style={styles.avatarSlot}>{showAuthor ? <Avatar name={message.author} size={30} /> : null}</View> : null}
      <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
        {showAuthor && !mine ? (
          <ThemedText type="caption" style={{ color: personColor(message.author), fontWeight: '700' }}>
            {message.author}
          </ThemedText>
        ) : null}
        <Pressable
          onLongPress={mine && !message.deleted ? onDelete : undefined}
          delayLongPress={400}
          accessibilityHint={mine && !message.deleted ? 'Press and hold to delete' : undefined}
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: c.primary, borderBottomRightRadius: 6 }
              : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: 6 },
          ]}>
          {message.deleted ? (
            <ThemedText type="small" style={{ color: mine ? c.onPrimary : c.textSecondary, fontStyle: 'italic' }}>
              Message deleted
            </ThemedText>
          ) : (
            <>
              {message.eventId ? <EventChip slug={slug} event={event} mine={mine} /> : null}
              <ThemedText selectable style={{ color: mine ? c.onPrimary : c.text }}>
                {message.body}
              </ThemedText>
            </>
          )}
        </Pressable>
        {showTime ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {formatClock(message.createdAt)}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/** The trip's group chat. Everyone with the link sees it; each message carries the sender's name. */
export default function MessengerScreen() {
  const c = useTheme();
  const confirm = useConfirm();
  const { slug, bundle, me, messages, sendMessage, deleteMessage, refreshMessages, markRead } = useLoadedTrip();
  const params = useLocalSearchParams<{ about?: string }>();
  const [about, setAbout] = useState<string | null>(params.about ?? null);
  // Arriving again from "Message the group about this" (the tab stays mounted) attaches that item.
  const [aboutParam, setAboutParam] = useState(params.about);
  if (params.about !== aboutParam) {
    setAboutParam(params.about);
    if (params.about) setAbout(params.about);
  }
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const refreshRef = useRef(refreshMessages);
  useEffect(() => {
    refreshRef.current = refreshMessages;
  }, [refreshMessages]);

  // While the chat is open: keep it read, and check for new messages in case live updates drop.
  useFocusEffect(
    useCallback(() => {
      void refreshRef.current();
      const id = setInterval(() => void refreshRef.current(), POLL_MS);
      return () => clearInterval(id);
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      markRead();
    }, [markRead]),
  );

  const events = new Map([...bundle.events, ...bundle.deletedEvents].map((e) => [e.id, e]));
  const aboutEvent = about ? bundle.events.find((e) => e.id === about) : undefined;

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setFailure(null);
    try {
      await sendMessage(body, aboutEvent?.id ?? null);
      setDraft('');
      setAbout(null);
      if (params.about) router.setParams({ about: undefined });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) => {
    // On a keyboard, Enter sends and Shift+Enter starts a new line.
    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const remove = async (message: Message) => {
    const ok = await confirm({
      title: 'Delete this message?',
      message: 'It disappears for everyone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteMessage(message.id);
    } catch (e) {
      setFailure(errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled">
        <View style={styles.thread}>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="chat" size={36} color={c.textSecondary} />
              <ThemedText type="heading">No messages yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Say hi, ask a question, or give everyone a heads-up. Everyone with the trip link can read and reply.
              </ThemedText>
            </View>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const sameRunAsPrev =
                !!prev && !newDay && sameName(prev.author, m.author) &&
                Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_GAP_MS;
              const sameRunAsNext =
                !!next && sameName(next.author, m.author) &&
                dayLabel(next.createdAt) === dayLabel(m.createdAt) &&
                Date.parse(next.createdAt) - Date.parse(m.createdAt) < GROUP_GAP_MS;
              return (
                <View key={m.id}>
                  {newDay ? (
                    <ThemedText type="label" themeColor="textSecondary" style={styles.day}>
                      {dayLabel(m.createdAt)}
                    </ThemedText>
                  ) : null}
                  <Bubble
                    slug={slug}
                    message={m}
                    mine={sameName(m.author, me)}
                    showAuthor={!sameRunAsPrev}
                    showTime={!sameRunAsNext}
                    event={m.eventId ? events.get(m.eventId) : undefined}
                    onDelete={() => void remove(m)}
                  />
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.composerWrap, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <View style={styles.composer}>
          {aboutEvent ? (
            <View style={[styles.aboutRow, { backgroundColor: c.primarySoft }]}>
              <Icon name={KINDS[aboutEvent.kind].icon} size={16} color={c.primary} />
              <ThemedText type="caption" style={styles.flex} numberOfLines={1}>
                About: <ThemedText type="caption" style={{ fontWeight: '700' }}>{aboutEvent.title}</ThemedText>
              </ThemedText>
              <IconButton icon="close" size={16} onPress={() => setAbout(null)} accessibilityLabel="Remove the link to this item" />
            </View>
          ) : null}
          {failure ? (
            <ThemedText type="caption" themeColor="danger">
              {failure}
            </ThemedText>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onKeyPress={onKeyPress}
              placeholder={me ? `Message everyone as ${me}` : 'Message everyone on the trip'}
              placeholderTextColor={c.textSecondary}
              multiline
              maxLength={4000}
              accessibilityLabel="Message"
              style={[styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [
                styles.send,
                { backgroundColor: c.primary, opacity: !draft.trim() || sending ? 0.45 : pressed ? 0.8 : 1 },
              ]}>
              <Icon name="send" size={20} color={c.onPrimary} />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  thread: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  day: {
    textAlign: 'center',
    marginVertical: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    marginTop: 2,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    width: 30,
  },
  column: {
    maxWidth: '78%',
    gap: 2,
  },
  columnMine: {
    alignItems: 'flex-end',
  },
  columnTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    gap: Spacing.one + 2,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.small,
    maxWidth: 260,
  },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  composer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
