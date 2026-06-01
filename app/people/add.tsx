import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useFriendStore } from '@/stores/friendStore';
import { searchFriendUsers } from '@/services/api/social';
import type { FriendRequest } from '@/types/friend';
import type { FriendUser } from '@/services/api/social';

export default function AddFriendScreen() {
  const router = useRouter();
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

  const renderUser = ({ item }: { item: FriendUser }) => (
    <View style={styles.userRow}>
      <View style={styles.userLeft}>
        <Avatar name={item.displayName} uri={item.avatarUrl} size={48} />
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

  return (
    <View style={styles.container}>
      <HeaderBar title="Add Friend" showBack onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={styles.helperText}>
          Search by Oroya ID to make sure you are adding the right person.
        </Text>
        <View style={styles.searchContainer}>
          <Input
            placeholder="Oroya ID or username"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            icon={<Ionicons name="search-outline" size={20} color={colors.light.textTertiary} />}
          />
        </View>

        {incomingRequests.length > 0 ? (
          <View style={styles.requestsCard}>
            <Text style={styles.sectionTitle}>Friend Requests</Text>
            {incomingRequests.map((request) => (
              <View key={request.id} style={styles.requestRow}>
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
            ))} 
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

        <Text style={styles.sectionTitle}>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  helperText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.sm,
  },
  searchContainer: {
    marginVertical: spacing.sm,
  },
  sectionTitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    fontWeight: '700',
    marginVertical: spacing.md,
  },
  requestsCard: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  outgoingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.warningLight,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  outgoingText: {
    ...typography.caption,
    color: colors.light.warning,
    fontWeight: '700',
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
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.errorLight,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.light.error,
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.light.borderLight,
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
    fontWeight: '700',
  },
  userTag: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
