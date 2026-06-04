import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useFriendStore } from '@/stores/friendStore';
import { searchFriendUsers } from '@/services/api/social';
import type { FriendRequest } from '@/types/friend';
import type { FriendUser } from '@/services/api/social';

export default function AddFriendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const { requests, isRequestsLoading, fetchRequests, sendRequest, acceptRequest } = useFriendStore();
  const [query, setQuery] = useState(params.q ? String(params.q) : '');
  const [results, setResults] = useState<FriendUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    let isMounted = true;
    const cleanQuery = query.trim();

    if (cleanQuery.length < 3) {
      setResults([]);
      setIsSearching(false);
      setSearchError('');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    const timeout = setTimeout(() => {
      searchFriendUsers(cleanQuery)
        .then((users) => {
          if (isMounted) setResults(users);
        })
        .catch((error) => {
          if (isMounted) {
            setResults([]);
            setSearchError(getFriendlyError(error, 'search'));
          }
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [query]);

  const incomingRequests = requests.filter((request) => (
    request.direction === 'incoming' && request.status === 'pending'
  ));
  const outgoingRequests = requests.filter((request) => (
    request.direction === 'outgoing' && request.status === 'pending'
  ));

  const handleSendRequest = async (user: FriendUser) => {
    setBusyId(user.id);
    try {
      await sendRequest(user.oroyaId);
      Alert.alert('Request sent', `Your friend request was sent to ${user.displayName}.`);
      setQuery('');
      setResults([]);
      setSearchError('');
    } catch (error) {
      Alert.alert('Could not send request', getFriendlyError(error, 'send'));
    } finally {
      setBusyId('');
    }
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      await acceptRequest(request.id);
      Alert.alert('Friend added', `${request.user.displayName} is now in your friends list.`);
      router.back();
    } catch (error) {
      Alert.alert('Could not accept request', getFriendlyError(error, 'accept'));
    } finally {
      setBusyId('');
    }
  };

  const renderUser = ({ item, index }: { item: FriendUser; index: number }) => {
    const isLast = index === results.length - 1;
    return (
      <View
        style={[
          styles.userRow,
          !isLast && styles.rowDivider,
        ]}
      >
        <View style={styles.userLeft}>
          <Avatar name={item.displayName} uri={item.avatarUrl} size={44} />
          <View style={styles.userText}>
            <Text style={styles.userName}>{item.displayName}</Text>
            <Text style={styles.userTag}>#{item.oroyaId}</Text>
          </View>
        </View>
        <Button
          title="Add"
          size="sm"
          loading={busyId === item.id}
          onPress={() => handleSendRequest(item)}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Friend</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Thinner Search Bar with Rounded Corners */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.light.textSecondary} style={styles.searchIcon} />
            <TextInput
              placeholder="Oroya ID or username"
              placeholderTextColor={colors.light.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              style={styles.searchInput}
            />
          </View>
        </View>

        <Text style={styles.helperText}>
          Search by Oroya ID to make sure you are adding the right person.
        </Text>

        {incomingRequests.length > 0 ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.sectionLabel}>Friend Requests</Text>
            <View style={styles.card}>
              {incomingRequests.map((request, index) => {
                const isLast = index === incomingRequests.length - 1;
                return (
                  <View
                    key={request.id}
                    style={[
                      styles.requestRow,
                      !isLast && styles.rowDivider,
                    ]}
                  >
                    <View style={styles.userLeft}>
                      <Avatar name={request.user.displayName} uri={request.user.avatarUrl} size={44} />
                      <View style={styles.userText}>
                        <Text style={styles.userName}>{request.user.displayName}</Text>
                        <Text style={styles.userTag}>#{request.user.oroyaId}</Text>
                      </View>
                    </View>
                    <Button
                      title="Accept"
                      size="sm"
                      loading={busyId === request.id}
                      onPress={() => handleAcceptRequest(request)}
                    />
                  </View>
                );
              })} 
            </View>
          </View>
        ) : null}

        {outgoingRequests.length > 0 ? (
          <View style={styles.outgoingBox}>
            <Ionicons name="time-outline" size={16} color={colors.light.warning} />
            <Text style={styles.outgoingText}>
              {outgoingRequests.length} request{outgoingRequests.length === 1 ? '' : 's'} waiting for a reply
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>
          {query.trim().length >= 3 ? 'Search Results' : 'Find by Oroya ID'}
        </Text>

        {isSearching || isRequestsLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.light.primary} />
            <Text style={styles.loadingText}>
              {isRequestsLoading ? 'Checking friend requests...' : 'Searching...'}
            </Text>
          </View>
        ) : null}

        {searchError && !isSearching ? (
          <View style={styles.errorBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.light.error} />
            <Text style={styles.errorText}>{searchError}</Text>
          </View>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={renderUser}
          ListEmptyComponent={
            !isSearching ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  {query.trim().length >= 3 ? 'No matching person' : 'Enter at least 3 characters'}
                </Text>
                <Text style={styles.emptyText}>
                  {query.trim().length >= 3
                    ? 'Check the Oroya ID or username and try again.'
                    : 'Ask your friend to share the Oroya ID shown on their profile.'}
                </Text>
              </View>
            ) : null
          }
        />
      </View>
    </View>
  );
}

function getFriendlyError(error: unknown, action: 'search' | 'send' | 'accept') {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('already') && message.includes('friend')) return 'This person is already in your friends list.';
  if (message.includes('not found') || message.includes('no user')) return 'No account matched that Oroya ID or username.';
  if (message.includes('yourself')) return 'You cannot add your own account as a friend.';
  if (message.includes('pending')) return 'A friend request is already waiting for a reply.';
  if (action === 'search') return 'Search is not available right now. Please try again in a moment.';
  if (action === 'accept') return 'We could not accept this request right now. Please try again.';
  return 'We could not send this request right now. Please try again.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },

  // ─── Header ───
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },

  // ─── Helper Text ───
  helperText: {
    ...typography.caption,
    color: colors.light.textTertiary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
    lineHeight: 16,
  },

  // ─── Search Bar ───
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.light.borderLight,
    height: 38,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...typography.bodySm,
    color: colors.light.textPrimary,
    paddingVertical: 0,
  },

  // ─── Sections ───
  sectionLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },

  // ─── Card & Rows ───
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  outgoingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.light.warningLight + '50',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  outgoingText: {
    ...typography.caption,
    color: colors.light.warning,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.light.errorLight + '50',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.light.error,
    flex: 1,
  },

  // ─── User Results List (Grouped inside a clean Card) ───
  listContent: {
    paddingBottom: 40,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.border,
  },
  userLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userText: {
    flex: 1,
  },
  userName: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  userTag: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },

  // ─── Empty state ───
  emptyContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    ...typography.caption,
    color: colors.light.textTertiary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
    paddingHorizontal: spacing.xl,
  },
});
