import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated as RNAnimated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { fetchChatMessages, sendChatMessage } from '@/services/api/social';
import type { ChatMessage } from '@/services/api/social';
import { formatCurrency, formatTime } from '@/utils/format';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type LocalChatMessage = ChatMessage & { localStatus?: 'sending' | 'failed' };

let styles: any;

const QUICK_ACTIONS = [
  { key: 'gift', label: 'Money', icon: 'gift-outline' as keyof typeof Ionicons.glyphMap, color: '#7C3AED', bg: '#F0EDFF' },
  { key: 'photo', label: 'Photo', icon: 'image-outline' as keyof typeof Ionicons.glyphMap, color: '#059669', bg: '#D1FAE5' },
  { key: 'camera', label: 'Camera', icon: 'camera-outline' as keyof typeof Ionicons.glyphMap, color: '#0891B2', bg: '#CFFAFE' },
  { key: 'contact', label: 'Contact', icon: 'person-outline' as keyof typeof Ionicons.glyphMap, color: '#D97706', bg: '#FEF3C7' },
] as const;

// ─── Action Button ───
function ActionButton({
  action,
  onPress,
}: {
  action: (typeof QUICK_ACTIONS)[number];
  onPress: () => void;
}) {
  const scale = React.useRef(new RNAnimated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        RNAnimated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
      }}
      onPressOut={() => {
        RNAnimated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
      }}
      style={styles.actionItem}
    >
      <RNAnimated.View style={{ transform: [{ scale }] }}>
        <View style={[styles.actionIconCircle, { backgroundColor: action.bg }]}>
          <Ionicons name={action.icon} size={24} color={action.color} />
        </View>
      </RNAnimated.View>
      <Text style={styles.actionLabel}>{action.label}</Text>
    </Pressable>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<LocalChatMessage>>(null);
  const { id, name, username, avatarUrl } = useLocalSearchParams<{
    id: string;
    friendId?: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
  }>();
  const user = useAuthStore((state) => state.user);
  const getCachedMessages = useChatStore((state) => state.getMessages);
  const setCachedMessages = useChatStore((state) => state.setMessages);
  const currentUserId = user?.id;
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);
  const [isGiftModalVisible, setIsGiftModalVisible] = useState(false);
  const [giftAmount, setGiftAmount] = useState('');
  const [giftNote, setGiftNote] = useState('');

  const threadId = String(id || '');
  const displayName = String(name || 'Friend');
  const displayUsername = String(username || '');
  const friendAvatar = String(avatarUrl || '');

  const applyMessages = React.useCallback(
    (updater: (items: LocalChatMessage[]) => LocalChatMessage[]) => {
      setMessages((current) => {
        const next = updater(current);
        if (threadId) setCachedMessages(threadId, next);
        return next;
      });
    },
    [setCachedMessages, threadId],
  );

  const loadMessages = React.useCallback(() => {
    if (!threadId) {
      setMessages([]);
      setLoadError('This chat could not be opened.');
      setIsLoading(false);
      return;
    }

    const cached = getCachedMessages(threadId);
    if (cached.length > 0) {
      setMessages(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    let isMounted = true;
    setLoadError('');
    fetchChatMessages(threadId)
      .then((items) => {
        if (isMounted) {
          setMessages(items);
          setCachedMessages(threadId, items);
        }
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
  }, [getCachedMessages, setCachedMessages, threadId]);

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
    applyMessages((items) => [...items, optimisticMessage]);
    setIsSending(true);
    try {
      const message = await sendChatMessage(threadId, cleanDraft);
      applyMessages((items) => items.map((item) => (item.id === tempId ? message : item)));
    } catch {
      setDraft(cleanDraft);
      applyMessages((items) =>
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

    setIsActionPanelOpen(false);
    setIsGiftModalVisible(true);
  };

  const sendDemoGift = async () => {
    if (!threadId || isSending) return;

    const amount = Number(giftAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      Alert.alert('Gift amount', 'Enter an amount between 1 and 1000 USD.');
      return;
    }

    const currency = 'USD';
    const tempId = `gift-${Date.now()}`;
    const messageText = giftNote.trim() || 'A small Oroya gift for you';
    const optimisticMessage: LocalChatMessage = {
      id: tempId,
      threadId,
      senderUserId: currentUserId || '',
      receiverUserId: '',
      message: messageText,
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
    setIsGiftModalVisible(false);
    setGiftAmount('');
    setGiftNote('');
    applyMessages((items) => [...items, optimisticMessage]);
    setIsSending(true);
    try {
      const message = await sendChatMessage(threadId, optimisticMessage.message, {
        messageType: 'money_gift',
        metadata: optimisticMessage.metadata,
      });
      applyMessages((items) => items.map((item) => (item.id === tempId ? message : item)));
    } catch {
      applyMessages((items) =>
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsActionPanelOpen((value) => !value);
  };

  const firstName = displayName.split(' ')[0];

  return (
    <View style={styles.container}>
      {/* ─── Custom Chat Header ─── */}
      <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
        </Pressable>

        <Pressable style={styles.headerCenter} onPress={() => {}}>
          <View style={styles.headerAvatarWrap}>
            <Avatar name={displayName} uri={friendAvatar} size={36} />
            <View style={styles.headerOnlineDot} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerName} numberOfLines={1}>{firstName}</Text>
            <View style={styles.headerStatusRow}>
              <View style={styles.headerSecureIcon}>
                <Ionicons name="lock-closed" size={9} color={colors.light.success} />
              </View>
              <Text style={styles.headerStatusText}>
                {displayUsername ? `@${displayUsername}` : 'Encrypted'}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.light.primary} />
          </View>
        ) : loadError ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.light.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>{loadError}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
              onPress={() => loadMessages()}
            >
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
            showsVerticalScrollIndicator={false}
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
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="chatbubbles-outline" size={32} color={colors.light.primary} />
                </View>
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptySubtitle}>Say hello or send a gift to get started</Text>
              </View>
            }
          />
        )}

        {/* ─── Action Panel ─── */}
        {isActionPanelOpen ? (
          <View style={styles.actionPanel}>
            <View style={styles.actionPanelInner}>
              {QUICK_ACTIONS.map((action) => (
                <ActionButton
                  key={action.key}
                  action={action}
                  onPress={() => handleActionPress(action.key)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ─── Composer ─── */}
        <View style={[styles.composer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : spacing.md }]}>
          <Pressable
            style={({ pressed }) => [
              styles.plusButton,
              isActionPanelOpen && styles.plusButtonActive,
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
            onPress={toggleActionPanel}
            disabled={!!loadError}
          >
            <Ionicons
              name={isActionPanelOpen ? 'close' : 'add'}
              size={22}
              color={isActionPanelOpen ? '#FFFFFF' : colors.light.primary}
            />
          </Pressable>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.light.textTertiary}
              style={styles.input}
              multiline
              maxLength={1000}
              editable={!loadError}
              onFocus={() => {
                if (isActionPanelOpen) {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsActionPanelOpen(false);
                }
              }}
            />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || isSending) && styles.sendButtonDisabled,
              pressed && draft.trim() && { transform: [{ scale: 0.92 }] },
            ]}
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

      <Modal
        visible={isGiftModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsGiftModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setIsGiftModalVisible(false)} />
          <View style={styles.giftSheet}>
            <View style={styles.giftSheetHandle} />
            <View style={styles.giftSheetHeader}>
              <LinearGradient
                colors={['#6C5CE7', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.giftSheetIcon}
              >
                <Ionicons name="gift" size={22} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.giftSheetTitleWrap}>
                <Text style={styles.giftSheetTitle}>Send Money Gift</Text>
                <Text style={styles.giftSheetSubtitle}>Demo card only. No wallet balance is moved yet.</Text>
              </View>
            </View>

            <Text style={styles.giftInputLabel}>Amount (USD)</Text>
            <TextInput
              value={giftAmount}
              onChangeText={(value) => setGiftAmount(value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="25"
              placeholderTextColor={colors.light.textTertiary}
              style={styles.giftInput}
            />

            <Text style={styles.giftInputLabel}>Message</Text>
            <TextInput
              value={giftNote}
              onChangeText={setGiftNote}
              placeholder="Add a short note"
              placeholderTextColor={colors.light.textTertiary}
              style={[styles.giftInput, styles.giftNoteInput]}
              maxLength={120}
              multiline
            />

            <View style={styles.giftActions}>
              <Pressable style={styles.giftCancelButton} onPress={() => setIsGiftModalVisible(false)}>
                <Text style={styles.giftCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.giftSendButton} onPress={sendDemoGift}>
                <Text style={styles.giftSendText}>Send Gift</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Message Bubble ───
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
          {showAvatar ? <Avatar name={friendName} uri={friendAvatar} size={28} /> : null}
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
              name={
                item.localStatus === 'failed'
                  ? 'alert-circle'
                  : item.localStatus === 'sending'
                    ? 'time-outline'
                    : 'checkmark-done'
              }
              size={13}
              color={
                item.localStatus === 'failed'
                  ? colors.light.error
                  : item.localStatus === 'sending'
                    ? colors.light.textTertiary
                    : colors.light.primary
              }
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Money Gift Card ───
function MoneyGiftCard({ item, isMine }: { item: LocalChatMessage; isMine: boolean }) {
  const amount = Number(item.metadata?.amount || 0);
  const currency = item.metadata?.currency || 'USD';

  if (isMine) {
    return (
      <LinearGradient
        colors={['#6C5CE7', '#8B5CF6', '#A78BFA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.giftCard}
      >
        <View style={styles.giftDecoCircle} />
        <View style={styles.giftHeader}>
          <View style={styles.giftIconWrap}>
            <Ionicons name="gift" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.giftHeaderText}>
            <Text style={styles.giftTitle}>{item.metadata?.title || 'Oroya Gift'}</Text>
            <Text style={styles.giftSubtitle}>{item.metadata?.subtitle || 'Demo money card'}</Text>
          </View>
        </View>
        <Text style={styles.giftAmount}>{formatCurrency(amount, currency)}</Text>
        <Text style={styles.giftMessage}>{item.message}</Text>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>Demo only</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.giftCardFriend}>
      <View style={styles.giftHeader}>
        <LinearGradient
          colors={['#F59E0B', '#FBBF24']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.giftIconWrap}
        >
          <Ionicons name="gift" size={18} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.giftHeaderText}>
          <Text style={[styles.giftTitle, { color: colors.light.textPrimary }]}>
            {item.metadata?.title || 'Oroya Gift'}
          </Text>
          <Text style={[styles.giftSubtitle, { color: colors.light.textSecondary }]}>
            {item.metadata?.subtitle || 'Demo money card'}
          </Text>
        </View>
      </View>
      <Text style={[styles.giftAmount, { color: colors.light.primary }]}>
        {formatCurrency(amount, currency)}
      </Text>
      <Text style={[styles.giftMessage, { color: colors.light.textSecondary }]}>{item.message}</Text>
      <View style={styles.demoBadgeFriend}>
        <Text style={styles.demoBadgeTextFriend}>Demo only</Text>
      </View>
    </View>
  );
}

styles = StyleSheet.create({
  // ─── Layout ───
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },

  // ─── Custom Chat Header ───
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
    gap: spacing.xs,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAvatarWrap: {
    position: 'relative',
  },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.light.success,
    borderWidth: 2,
    borderColor: colors.light.surface,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerName: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.light.textPrimary,
    letterSpacing: -0.2,
    fontSize: 16,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  headerSecureIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.light.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStatusText: {
    fontSize: 11,
    color: colors.light.textTertiary,
    fontWeight: '500',
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.light.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Loading & Empty ───
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.bodySm,
    fontWeight: '600',
    color: colors.light.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.light.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.bodySm,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ─── Messages ───
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  rowAvatar: {
    width: 34,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: colors.light.primary,
    borderBottomRightRadius: 6,
  },
  bubbleFriend: {
    backgroundColor: colors.light.surface,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
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
    marginLeft: spacing.xs,
  },
  metaRowMine: {
    justifyContent: 'flex-end',
    marginRight: spacing.xs,
  },
  timeText: {
    fontSize: 10,
    color: colors.light.textTertiary,
    fontWeight: '400',
  },

  // ─── Gift Card ───
  giftCard: {
    width: 240,
    borderRadius: 20,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  giftDecoCircle: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  giftCardFriend: {
    width: 240,
    borderRadius: 20,
    padding: spacing.lg,
    backgroundColor: colors.light.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.borderLight,
    ...shadows.card,
  },
  giftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  giftIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftHeaderText: {
    flex: 1,
  },
  giftTitle: {
    ...typography.bodySm,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  giftSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  giftAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: spacing.md,
    letterSpacing: -0.5,
  },
  giftMessage: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  demoBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  demoBadgeText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  demoBadgeFriend: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: '#F0EDFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  demoBadgeTextFriend: {
    fontSize: 9,
    color: colors.light.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ─── Action Panel ───
  actionPanel: {
    backgroundColor: colors.light.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.borderLight,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  actionPanelInner: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: spacing.md,
  },
  actionItem: {
    alignItems: 'center',
    width: 68,
    gap: spacing.sm,
  },
  actionIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
    color: colors.light.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ─── Composer ───
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.light.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.borderLight,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0EDFF',
  },
  plusButtonActive: {
    backgroundColor: colors.light.primary,
  },
  inputWrap: {
    flex: 1,
  },
  input: {
    maxHeight: 100,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.border,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    ...typography.bodySm,
    color: colors.light.textPrimary,
    backgroundColor: colors.light.background,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.primary,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  modalDismissArea: {
    flex: 1,
  },
  giftSheet: {
    backgroundColor: colors.light.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing['2xl'] : spacing.xl,
  },
  giftSheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.light.border,
    marginBottom: spacing.lg,
  },
  giftSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  giftSheetIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftSheetTitleWrap: {
    flex: 1,
  },
  giftSheetTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  giftSheetSubtitle: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  giftInputLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  giftInput: {
    minHeight: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: colors.light.background,
    paddingHorizontal: spacing.md,
    ...typography.bodySm,
    color: colors.light.textPrimary,
    marginBottom: spacing.md,
  },
  giftNoteInput: {
    minHeight: 84,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  giftActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  giftCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftCancelText: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  giftSendButton: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftSendText: {
    ...typography.bodySm,
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
