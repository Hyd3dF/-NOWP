import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { useFriendStore } from '@/stores/friendStore';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { openChat } from '@/services/api/social';
import type { Friend } from '@/types/friend';

export default function PeopleScreen() {
  const router = useRouter();
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
        },
      });
    } catch {
      router.push({ pathname: '/people/[id]', params: { id: contact.user.id } });
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="People"
        rightAction={
          <Pressable onPress={handleAddFriend} style={styles.addBtn}>
            <Ionicons name="person-add-outline" size={22} color={colors.light.primary} />
          </Pressable>
        }
      />

      <View style={styles.content}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Input
            placeholder="Search friends"
            value={searchQuery}
            onChangeText={setSearchQuery}
            icon={<Ionicons name="search-outline" size={20} color={colors.light.textTertiary} />}
          />
        </View>

        {/* Recent Recipients */}
        {friendsLoading ? (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recent Recipients</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
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
            <Text style={styles.sectionTitle}>Recent Recipients</Text>
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
        <Text style={styles.sectionTitle}>Friends</Text>
        {friendsLoading ? (
          <View style={{ flex: 1 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.friendRow}>
                <View style={styles.friendLeft}>
                  <Skeleton width={48} height={48} borderRadius={24} />
                  <View style={[styles.friendInfo, { gap: 6 }]}>
                    <Skeleton width={130} height={14} borderRadius={4} />
                    <Skeleton width={80} height={10} borderRadius={4} />
                  </View>
                </View>
                <Skeleton width={12} height={12} borderRadius={6} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.friendRow}
                onPress={() => handleSelectContact(item)}
              >
                <View style={styles.friendLeft}>
                  <Avatar name={item.user.displayName} uri={item.user.avatarUrl} size={48} />
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{item.user.displayName}</Text>
                    <Text style={styles.friendUsername}>#{item.user.oroyaId || item.user.username}</Text>
                  </View>
                </View>
                <Ionicons name="chatbubble-outline" size={20} color={colors.light.textTertiary} />
              </Pressable>
            )}
            ListEmptyComponent={
              <EmptyState
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    marginVertical: spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.errorLight,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.light.error,
    flex: 1,
  },
  recentSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  recentList: {
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
  friendsList: {
    paddingBottom: 100, // Account for bottom tabs
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.light.borderLight,
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
    fontWeight: '600',
  },
  friendUsername: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
});
