import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { fetchChatMessages, sendChatMessage } from '@/services/api/social';
import type { ChatMessage } from '@/services/api/social';

export default function ChatScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { id, name, username } = useLocalSearchParams<{
    id: string;
    friendId?: string;
    name?: string;
    username?: string;
  }>();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadMessages = React.useCallback(() => {
    if (!id) {
      setMessages([]);
      setLoadError('This chat could not be opened.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError('');
    fetchChatMessages(id)
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
  }, [id]);

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
    if (!cleanDraft || isSending) return;

    setDraft('');
    setIsSending(true);
    try {
      const message = await sendChatMessage(id, cleanDraft);
      setMessages((items) => [...items, message]);
    } catch {
      setDraft(cleanDraft);
      Alert.alert('Message not sent', 'Please check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  const displayName = String(name || 'Friend');
  const displayUsername = String(username || '');

  return (
    <View style={styles.container}>
      <HeaderBar
        title={displayName}
        showBack
        onBack={() => router.back()}
        rightAction={
          <View style={styles.headerAvatar}>
            <Avatar name={displayName} size={32} />
          </View>
        }
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {displayUsername ? (
          <Text style={styles.username}>@{displayUsername}</Text>
        ) : null}

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
            renderItem={({ item }) => {
              const isMine = item.senderUserId === currentUserId;
              return (
                <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleFriend]}>
                    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                      {item.message}
                    </Text>
                  </View>
                </View>
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

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.light.textTertiary}
            style={styles.input}
            multiline
            maxLength={1000}
            editable={!loadError}
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || isSending || !!loadError}
          >
            {isSending ? (
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    ...typography.caption,
    color: colors.light.textTertiary,
    textAlign: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: borderRadius.lg,
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
  },
  messageText: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    lineHeight: 20,
  },
  messageTextMine: {
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing['3xl'],
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.borderLight,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: borderRadius.md,
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
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.primary,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
