import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { useFriendStore } from '@/stores/friendStore';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { openChat } from '@/services/api/social';
import type { Friend } from '@/types/friend';

export default function PeopleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isLoading: friendsLoading,
    error,
    searchQuery,
    setSearchQuery,
    fetchFriends,
    getFilteredFriends,
    getRecentRecipients,
  } = useFriendStore();

  useEffect(() => {
    fetchFriends();
  }, []);

  const filteredFriends = getFilteredFriends();
  const recentRecipients = getRecentRecipients().filter((friend) => friend.status === 'accepted');
  const cleanSearchQuery = searchQuery.trim();

  const handleAddFriend = () => {
    router.push('/people/add');
  };

  const handleSelectContact = async (contact: Friend) => {
    if (contact.status !== 'accepted') {
      router.push('/people/add');
      return;
    }

    if (contact.threadId) {
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: contact.threadId,
          friendId: contact.user.id,
          name: contact.user.displayName,
          username: contact.user.username,
          avatarUrl: contact.user.avatarUrl || '',
        },
      });
      return;
    }

    try {
      const thread = await openChat(contact.user.id);
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: thread.id,
          friendId: contact.user.id,
          name: contact.user.displayName,
          username: contact.user.username,
          avatarUrl: contact.user.avatarUrl || '',
        },
      });
    } catch {
      router.push({ pathname: '/people/[id]', params: { id: contact.user.id } });
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
        <View style={{ width: 44 }} />
        <Text style={styles.headerTitle}>People</Text>
        <Pressable
          onPress={handleAddFriend}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="person-add-outline" size={22} color={colors.light.textPrimary} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.light.textSecondary} style={styles.searchIcon} />
            <TextInput
              placeholder="Search friends"
              placeholderTextColor={colors.light.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Recent Recipients */}
        {friendsLoading ? (
          <View style={styles.recentSection}>
            <Text style={styles.sectionLabel}>Recent Recipients</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.recentItem}>
                  <Skeleton width={52} height={52} borderRadius={26} />
                  <Skeleton width={40} height={10} borderRadius={4} style={{ marginTop: spacing.xs }} />
                </View>
              ))}
            </View>
          </View>
        ) : recentRecipients.length > 0 && !cleanSearchQuery ? (
          <View style={styles.recentSection}>
            <Text style={styles.sectionLabel}>Recent Recipients</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={recentRecipients}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.recentList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.recentItem}
                  onPress={() => handleSelectContact(item)}
                >
                  <Avatar name={item.user.displayName} uri={item.user.avatarUrl} size={52} />
                  <Text style={styles.recentName} numberOfLines={1}>
                    {item.user.displayName.split(' ')[0]}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        ) : null}

        {error && !friendsLoading ? (
          <View style={styles.errorBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.light.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Friends List */}
        <Text style={styles.sectionLabel}>Friends</Text>
        {friendsLoading ? (
          <View style={styles.cardSkeleton}>
            {[1, 2, 3, 4].map((i, index) => {
              const isLast = index === 3;
              return (
                <View key={i} style={[styles.friendRowSkeleton, !isLast && styles.rowDivider]}>
                  <View style={styles.friendLeft}>
                    <Skeleton width={44} height={44} borderRadius={22} />
                    <View style={[styles.friendInfo, { gap: 6 }]}>
                      <Skeleton width={130} height={14} borderRadius={4} />
                      <Skeleton width={80} height={10} borderRadius={4} />
                    </View>
                  </View>
                  <Skeleton width={18} height={18} borderRadius={9} />
                </View>
              );
            })}
          </View>
        ) : (
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
            renderItem={({ item, index }) => {
              const isLast = index === filteredFriends.length - 1;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.friendRow,
                    !isLast && styles.rowDivider,
                    pressed && { backgroundColor: colors.light.borderLight },
                  ]}
                  onPress={() => handleSelectContact(item)}
                >
                  <View style={styles.friendLeft}>
                    <Avatar name={item.user.displayName} uri={item.user.avatarUrl} size={44} />
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{item.user.displayName}</Text>
                      <Text style={styles.friendUsername}>#{item.user.oroyaId || item.user.username}</Text>
                    </View>
                  </View>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.light.textSecondary} />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                iconName={cleanSearchQuery ? 'search-outline' : 'people-outline'}
                iconColor={colors.light.primary}
                iconGradient={['#F0EDFF', '#E8E4FF']}
                title={cleanSearchQuery ? 'No matching friends' : 'No friends yet'}
                subtitle={
                  cleanSearchQuery
                    ? `No friend matches "${cleanSearchQuery}".`
                    : 'Add a friend to start a chat or send money.'
                }
                action={!cleanSearchQuery ? { label: 'Find Friends', onPress: handleAddFriend } : undefined}
              />
            }
          />
        )}
      </View>
    </View>
  );
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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

  // ─── Recent Recipients ───
  recentSection: {
    marginBottom: spacing.md,
  },
  recentList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  recentItem: {
    alignItems: 'center',
    width: 72,
  },
  recentName: {
    ...typography.caption,
    color: colors.light.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // ─── Friends Card List (Now transparent background directly on screen) ───
  friendsList: {
    paddingBottom: 120,
  },
  friendRow: {
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
  friendLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  friendInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  friendName: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  friendUsername: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },

  // ─── Skeleton ───
  cardSkeleton: {
    paddingBottom: 120,
  },
  friendRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
});
