import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { borderRadius, spacing } from '@/theme/spacing';
import {
  AppNotification,
  fetchNotifications,
  markNotificationRead,
} from '@/services/api/notifications';
import { formatDate, formatTime } from '@/utils/format';

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = async () => {
    const response = await fetchNotifications();
    setItems(response.notifications);
  };

  useEffect(() => {
    load()
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, []);

  const refresh = async () => {
    setIsRefreshing(true);
    await load().catch(() => {});
    setIsRefreshing(false);
  };

  const handlePress = async (item: AppNotification) => {
    setItems((current) =>
      current.map((notification) =>
        notification.id === item.id ? { ...notification, isRead: true, readAt: new Date().toISOString() } : notification,
      ),
    );
    if (!item.id.includes(':')) {
      await markNotificationRead(item.id).catch(() => {});
    }

    if (item.type === 'friend_request') {
      router.push('/people/add');
      return;
    }

    const safeLink = getSafeExternalUrl(item.linkUrl);
    if (safeLink) {
      await Linking.openURL(safeLink);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Notifications" showBack onBack={() => router.back()} compact />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={items.length ? styles.list : styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.light.primary} />
          }
          renderItem={({ item }) => <NotificationRow item={item} onPress={() => handlePress(item)} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={34} color={colors.light.primary} />
              </View>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>Friend requests and Oroya updates will appear here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const iconName = getIconName(item);
  const isBrandNotification = item.type !== 'friend_request' && item.type !== 'friend_accept';

  if (isBrandNotification) {
    const hasSafeLink = Boolean(getSafeExternalUrl(item.linkUrl));
    const safeImageUrl = getSafeExternalUrl(item.imageUrl);

    return (
      <Pressable style={({ pressed }) => [styles.brandCard, pressed && styles.brandCardPressed]} onPress={onPress}>
        <View style={styles.brandImageFrame}>
          {safeImageUrl ? (
            <Image source={{ uri: safeImageUrl }} style={styles.brandImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={['#6C5CE7', '#4F46E5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandImageFallback}
            >
              <Ionicons name={iconName} size={34} color="#FFFFFF" />
            </LinearGradient>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.64)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.brandImageOverlay}
          />
          <View style={styles.brandImageTopRow}>
            <View style={styles.brandPill}>
              <Text style={styles.brandPillText}>Oroya update</Text>
            </View>
            {!item.isRead ? <View style={styles.imageUnreadDot} /> : null}
          </View>
          {hasSafeLink ? (
            <View style={styles.brandOpenPill}>
              <Text style={styles.brandOpenText}>Open</Text>
              <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </View>

        <View style={styles.brandContent}>
          <View style={styles.brandTitleLine}>
            <Text style={styles.brandTitle} numberOfLines={2}>{item.title}</Text>
            {!item.isRead ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.brandBody} numberOfLines={3}>{item.body}</Text>
          <View style={styles.brandFooter}>
            <Text style={styles.time}>{formatDate(item.createdAt)} · {formatTime(item.createdAt)}</Text>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>Oroya</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  const safeImageUrl = getSafeExternalUrl(item.imageUrl);

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.iconWrap}>
        {safeImageUrl ? (
          item.type === 'friend_request' || item.type === 'friend_accept' ? (
            <Avatar name={item.title} uri={safeImageUrl} size={46} />
          ) : (
            <Image source={{ uri: safeImageUrl }} style={styles.imageIcon} />
          )
        ) : (
          <View style={[styles.iconCircle, !item.isRead && styles.iconCircleUnread]}>
            <Ionicons name={iconName} size={22} color={item.isRead ? colors.light.textSecondary : '#FFFFFF'} />
          </View>
        )}
      </View>

      <View style={styles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {!item.isRead ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.time}>{formatDate(item.createdAt)} · {formatTime(item.createdAt)}</Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
    </Pressable>
  );
}

// Map custom notification types to Ionicons
function getIconName(item: AppNotification): keyof typeof Ionicons.glyphMap {
  if (item.type === 'friend_request') return 'person-add-outline';
  if (item.type === 'friend_accept') return 'checkmark-circle-outline';
  const icon = String(item.icon || 'notifications-outline');
  return icon in Ionicons.glyphMap ? (icon as keyof typeof Ionicons.glyphMap) : 'notifications-outline';
}

function getSafeExternalUrl(value?: string) {
  const url = String(value || '').trim();
  return /^https:\/\/[^\s]+$/i.test(url) ? url : '';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
  },
  rowPressed: {
    opacity: 0.75,
    backgroundColor: colors.light.borderLight,
  },
  brandCard: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    marginBottom: spacing.lg,
  },
  brandCardPressed: {
    opacity: 0.82,
  },
  brandImageFrame: {
    position: 'relative',
    height: 178,
    backgroundColor: colors.light.borderLight,
  },
  brandImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.light.borderLight,
  },
  brandImageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandImageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  brandImageTopRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  brandPillText: {
    fontSize: 10,
    color: colors.light.textPrimary,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  imageUnreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.light.error,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  brandOpenPill: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.46)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  brandOpenText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  brandContent: {
    padding: spacing.md,
  },
  brandTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  brandTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '900',
    flex: 1,
  },
  brandBody: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  brandFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  brandBadge: {
    borderRadius: borderRadius.sm,
    backgroundColor: '#F0EDFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  brandBadgeText: {
    fontSize: 10,
    color: colors.light.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.light.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleUnread: {
    backgroundColor: colors.light.primary,
  },
  rowContent: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '800',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.light.error,
  },
  body: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  time: {
    fontSize: 10,
    color: colors.light.textTertiary,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
