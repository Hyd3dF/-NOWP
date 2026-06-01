import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { fetchChatMessages, sendChatMessage } from '@/services/api/social';
import type { ChatMessage } from '@/services/api/social';
import { formatCurrency, formatTime } from '@/utils/format';

type LocalChatMessage = ChatMessage & { localStatus?: 'sending' | 'failed' };

const QUICK_ACTIONS = [
  { key: 'gift', label: 'Money Gift', icon: 'gift-outline', color: colors.light.primary, bg: '#F0EDFF' },
  { key: 'photo', label: 'Photo', icon: 'image-outline', color: colors.light.success, bg: colors.light.successLight },
  { key: 'camera', label: 'Camera', icon: 'camera-outline', color: colors.light.secondary, bg: '#E0FFFE' },
  { key: 'contact', label: 'Contact', icon: 'person-circle-outline', color: colors.light.warning, bg: colors.light.warningLight },
] as const;

export default function ChatScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<LocalChatMessage>>(null);
  const { id, name, username, avatarUrl } = useLocalSearchParams<{
    id: string;
    friendId?: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
  }>();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id;
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);

  const threadId = String(id || '');
  const displayName = String(name || 'Friend');
  const displayUsername = String(username || '');
  const friendAvatar = String(avatarUrl || '');

  const loadMessages = React.useCallback(() => {
    if (!threadId) {
      setMessages([]);
      setLoadError('This chat could not be opened.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError('');
    fetchChatMessages(threadId)
      .then((items) => {
        if (isMounted) setMessages(items);
      })
      .catch(() => {
        if (isMounted) {
          setMessages([]);
          setLoadError('Messages could not be loaded. Please try again.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [threadId]);

  useEffect(() => {
    return loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const cleanDraft = draft.trim();
    if (!cleanDraft || isSending || !threadId) return;

    const tempId = `local-${Date.now()}`;
    const optimisticMessage: LocalChatMessage = {
      id: tempId,
      threadId,
      senderUserId: currentUserId || '',
      receiverUserId: '',
      message: cleanDraft,
      messageType: 'text',
      metadata: {},
      status: 'sending',
      localStatus: 'sending',
      createdAt: new Date().toISOString(),
      senderAvatar: user?.avatarUrl || null,
    };

    setDraft('');
    setIsActionPanelOpen(false);
    setMessages((items) => [...items, optimisticMessage]);
    setIsSending(true);
    try {
      const message = await sendChatMessage(threadId, cleanDraft);
      setMessages((items) => items.map((item) => (item.id === tempId ? message : item)));
    } catch {
      setDraft(cleanDraft);
      setMessages((items) =>
        items.map((item) =>
          item.id === tempId ? { ...item, status: 'failed', localStatus: 'failed' } : item,
        ),
      );
      Alert.alert('Message not sent', 'Please check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleActionPress = async (key: string) => {
    Keyboard.dismiss();
    if (key !== 'gift') {
      Alert.alert('Coming Soon', 'This sharing option will be connected later.');
      return;
    }

    await sendDemoGift();
  };

  const sendDemoGift = async () => {
    if (!threadId || isSending) return;

    const amount = 10;
    const currency = 'USD';
    const tempId = `gift-${Date.now()}`;
    const optimisticMessage: LocalChatMessage = {
      id: tempId,
      threadId,
      senderUserId: currentUserId || '',
      receiverUserId: '',
      message: 'A small Oroya gift for you',
      messageType: 'money_gift',
      metadata: {
        amount,
        currency,
        title: 'Oroya Gift',
        subtitle: 'Demo money card',
        status: 'demo',
      },
      status: 'sending',
      localStatus: 'sending',
      createdAt: new Date().toISOString(),
      senderAvatar: user?.avatarUrl || null,
    };

    setIsActionPanelOpen(false);
    setMessages((items) => [...items, optimisticMessage]);
    setIsSending(true);
    try {
      const message = await sendChatMessage(threadId, optimisticMessage.message, {
        messageType: 'money_gift',
        metadata: optimisticMessage.metadata,
      });
      setMessages((items) => items.map((item) => (item.id === tempId ? message : item)));
    } catch {
      setMessages((items) =>
        items.map((item) =>
          item.id === tempId ? { ...item, status: 'failed', localStatus: 'failed' } : item,
        ),
      );
      Alert.alert('Gift not sent', 'This demo gift could not be sent right now.');
    } finally {
      setIsSending(false);
    }
  };

  const toggleActionPanel = () => {
    Keyboard.dismiss();
    setIsActionPanelOpen((value) => !value);
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title={displayName}
        showBack
        onBack={() => router.back()}
        rightAction={
          <View style={styles.headerAvatar}>
            <Avatar name={displayName} uri={friendAvatar} size={38} />
          </View>
        }
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.presenceRow}>
          {displayUsername ? <Text style={styles.username}>@{displayUsername}</Text> : null}
          <View style={styles.onlineDot} />
          <Text style={styles.presenceText}>Secure chat</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.light.primary} />
          </View>
        ) : loadError ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color={colors.light.textTertiary} />
            <Text style={styles.emptyText}>{loadError}</Text>
            <Pressable style={styles.retryButton} onPress={() => loadMessages()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const isMine = item.senderUserId === currentUserId;
              const previous = messages[index - 1];
              const showAvatar = !isMine && previous?.senderUserId !== item.senderUserId;
              return (
                <MessageBubble
                  item={item}
                  isMine={isMine}
                  showAvatar={showAvatar}
                  friendName={displayName}
                  friendAvatar={item.senderAvatar || friendAvatar}
                />
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={colors.light.textTertiary} />
                <Text style={styles.emptyText}>No messages yet. Say hello when you are ready.</Text>
              </View>
            }
          />
        )}

        {isActionPanelOpen ? (
          <View style={styles.actionPanel}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.key}
                style={styles.actionItem}
                onPress={() => handleActionPress(action.key)}
              >
                <View style={[styles.actionIcon, { backgroundColor: action.bg }]}>
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.composer}>
          <Pressable
            style={[styles.plusButton, isActionPanelOpen && styles.plusButtonActive]}
            onPress={toggleActionPanel}
            disabled={!!loadError}
          >
            <Ionicons
              name={isActionPanelOpen ? 'close' : 'add'}
              size={24}
              color={isActionPanelOpen ? '#FFFFFF' : colors.light.primary}
            />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.light.textTertiary}
            style={styles.input}
            multiline
            maxLength={1000}
            editable={!loadError}
            onFocus={() => setIsActionPanelOpen(false)}
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || isSending || !!loadError}
          >
            {isSending && draft.trim() ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageBubble({
  item,
  isMine,
  showAvatar,
  friendName,
  friendAvatar,
}: {
  item: LocalChatMessage;
  isMine: boolean;
  showAvatar: boolean;
  friendName: string;
  friendAvatar?: string | null;
}) {
  const isGift = item.messageType === 'money_gift';

  return (
    <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
      {!isMine ? (
        <View style={styles.rowAvatar}>
          {showAvatar ? <Avatar name={friendName} uri={friendAvatar} size={30} /> : null}
        </View>
      ) : null}

      <View style={[styles.messageColumn, isMine && styles.messageColumnMine]}>
        {isGift ? (
          <MoneyGiftCard item={item} isMine={isMine} />
        ) : (
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleFriend]}>
            <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.message}</Text>
          </View>
        )}
        <View style={[styles.metaRow, isMine && styles.metaRowMine]}>
          <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
          {isMine ? (
            <Ionicons
              name={item.localStatus === 'failed' ? 'alert-circle' : 'checkmark-done'}
              size={13}
              color={item.localStatus === 'failed' ? colors.light.error : colors.light.textTertiary}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function MoneyGiftCard({ item, isMine }: { item: LocalChatMessage; isMine: boolean }) {
  const amount = Number(item.metadata?.amount || 0);
  const currency = item.metadata?.currency || 'USD';

  return (
    <View style={[styles.giftCard, isMine ? styles.giftCardMine : styles.giftCardFriend]}>
      <View style={styles.giftHeader}>
        <View style={styles.giftIcon}>
          <Ionicons name="gift" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.giftHeaderText}>
          <Text style={[styles.giftTitle, !isMine && styles.giftTitleFriend]}>
            {item.metadata?.title || 'Oroya Gift'}
          </Text>
          <Text style={[styles.giftSubtitle, !isMine && styles.giftSubtitleFriend]}>
            {item.metadata?.subtitle || 'Demo money card'}
          </Text>
        </View>
      </View>
      <Text style={[styles.giftAmount, !isMine && styles.giftAmountFriend]}>
        {formatCurrency(amount, currency)}
      </Text>
      <Text style={[styles.giftMessage, !isMine && styles.giftMessageFriend]}>{item.message}</Text>
      <View style={[styles.demoBadge, !isMine && styles.demoBadgeFriend]}>
        <Text style={[styles.demoBadgeText, !isMine && styles.demoBadgeTextFriend]}>Demo only</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  username: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '700',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.light.success,
  },
  presenceText: {
    ...typography.caption,
    color: colors.light.textTertiary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  rowAvatar: {
    width: 36,
    alignItems: 'flex-start',
  },
  messageColumn: {
    maxWidth: '78%',
  },
  messageColumnMine: {
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.light.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleFriend: {
    backgroundColor: colors.light.surface,
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    ...shadows.card,
  },
  messageText: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    lineHeight: 20,
  },
  messageTextMine: {
    color: '#FFFFFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
    marginLeft: spacing.sm,
  },
  metaRowMine: {
    justifyContent: 'flex-end',
    marginRight: spacing.sm,
  },
  timeText: {
    fontSize: 10,
    color: colors.light.textTertiary,
  },
  giftCard: {
    width: 230,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  giftCardMine: {
    backgroundColor: colors.light.primary,
  },
  giftCardFriend: {
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  giftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  giftIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.light.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftHeaderText: {
    flex: 1,
  },
  giftTitle: {
    ...typography.bodySm,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  giftTitleFriend: {
    color: colors.light.textPrimary,
  },
  giftSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.76)',
  },
  giftSubtitleFriend: {
    color: colors.light.textSecondary,
  },
  giftAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: spacing.md,
  },
  giftAmountFriend: {
    color: colors.light.primary,
  },
  giftMessage: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.86)',
    marginTop: spacing.xs,
  },
  giftMessageFriend: {
    color: colors.light.textSecondary,
  },
  demoBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  demoBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  demoBadgeFriend: {
    backgroundColor: '#F0EDFF',
  },
  demoBadgeTextFriend: {
    color: colors.light.primary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '700',
  },
  actionPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.borderLight,
  },
  actionItem: {
    alignItems: 'center',
    width: 74,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.light.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.borderLight,
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0EDFF',
  },
  plusButtonActive: {
    backgroundColor: colors.light.primary,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.light.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodySm,
    color: colors.light.textPrimary,
    backgroundColor: colors.light.background,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.primary,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
