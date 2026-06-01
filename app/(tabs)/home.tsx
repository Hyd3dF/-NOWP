import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  Animated as RNAnimated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { useFriendStore } from '@/stores/friendStore';
import { fetchNotifications } from '@/services/api/notifications';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { formatCurrency, formatDate, formatTime, maskBalance } from '@/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

// --- Animated Quick Action Button ---
function QuickActionButton({
  icon,
  label,
  bgColor,
  iconColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  bgColor: string;
  iconColor: string;
  onPress: () => void;
}) {
  const scale = React.useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.actionBtn}
    >
      <RNAnimated.View style={{ transform: [{ scale }] }}>
        <View style={[styles.actionIconContainer, { backgroundColor: bgColor }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
      </RNAnimated.View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { wallet, isBalanceVisible, isLoading: walletLoading, error: walletError, fetchWallet, toggleBalanceVisibility } = useWalletStore();
  const { transactions, isLoading: txLoading, error: txError, fetchTransactions } = useTransactionStore();
  const { friends, isLoading: friendsLoading, fetchFriends } = useFriendStore();

  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const initData = async () => {
    await Promise.all([
      fetchWallet(),
      fetchTransactions(),
      fetchFriends(),
      fetchNotifications()
        .then((response) => setUnreadNotifications(response.unreadCount))
        .catch(() => setUnreadNotifications(0)),
    ]);
  };

  useEffect(() => {
    initData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await initData();
    setRefreshing(false);
  };

  const getFirstName = (name: string) => {
    return name.split(' ')[0];
  };

  const recentTxns = transactions.slice(0, 5);
  const recentFriends = friends.filter(f => f.status === 'accepted').slice(0, 6);

  const formattedBalance = walletLoading
    ? ''
    : formatCurrency(wallet?.balance || 0, wallet?.currency || 'USD');

  const currencySymbol = formattedBalance.match(/^[^\d\s,.]+/)?.[0] || '$';
  const balanceValue = isBalanceVisible
    ? formattedBalance.replace(currencySymbol, '').trim()
    : maskBalance(formattedBalance.replace(currencySymbol, '').trim());

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.light.primary}
          />
        }
      >
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Avatar name={user?.displayName || 'User'} uri={user?.avatarUrl} size={44} />
            <View>
              <Text style={styles.userName}>{user?.displayName || 'Oroya User'}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [
              styles.notificationBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.light.textPrimary} />
            {unreadNotifications > 0 ? <View style={styles.notificationBadge} /> : null}
          </Pressable>
        </View>

        {/* ─── Balance Card ─── */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceContent}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Pressable
                onPress={toggleBalanceVisibility}
                style={({ pressed }) => [
                  styles.eyeBtn,
                  pressed && { opacity: 0.7 },
                ]}
                hitSlop={8}
              >
                <Ionicons
                  name={isBalanceVisible ? 'eye-outline' : 'eye-off-outline'}
                  size={16}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>

            {walletLoading ? (
              <Skeleton width={200} height={40} borderRadius={8} style={{ marginVertical: spacing.xs, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            ) : (
              <Text style={styles.balanceAmount}>
                {currencySymbol ? <Text style={styles.currencySymbol}>{currencySymbol}</Text> : null}
                {balanceValue}
              </Text>
            )}

            <View style={styles.balanceFooter}>
              <Text style={styles.accountTag}>@{user?.username || 'user'}</Text>
              <View style={styles.walletBadge}>
                <Text style={styles.walletDetails}>{wallet?.currency || 'USD'} Wallet</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ─── Quick Actions ─── */}
        <View style={styles.quickActionsContainer}>
          <View style={styles.quickActionsRow}>
            <QuickActionButton
              icon="arrow-up"
              label="Send"
              bgColor="#F0EEFF"
              iconColor="#6C5CE7"
              onPress={() => router.push('/send')}
            />
            <QuickActionButton
              icon="arrow-down"
              label="Receive"
              bgColor="#F0EEFF"
              iconColor="#6C5CE7"
              onPress={() => router.push('/receive')}
            />
            <QuickActionButton
              icon="wallet-outline"
              label="Deposit"
              bgColor="#F0EEFF"
              iconColor="#6C5CE7"
              onPress={() => router.push('/deposit')}
            />
            <QuickActionButton
              icon="qr-code-outline"
              label="Scan"
              bgColor="#F0EEFF"
              iconColor="#6C5CE7"
              onPress={() => router.push('/qr/scan')}
            />
          </View>
        </View>

        {/* ─── Send Money Again (Horizontal Avatars Only) ─── */}
        {friendsLoading ? (
          <View style={styles.recentContactsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentContactsScroll}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.contactChip,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  router.push('/people/add');
                }}
              >
                <View style={styles.addFriendChip}>
                  <Ionicons name="add" size={24} color="#6C5CE7" />
                </View>
              </Pressable>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.contactChip}>
                  <Skeleton width={52} height={52} borderRadius={26} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : recentFriends.length > 0 ? (
          <View style={styles.recentContactsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentContactsScroll}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.contactChip,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  router.push('/people/add');
                }}
              >
                <View style={styles.addFriendChip}>
                  <Ionicons name="add" size={24} color="#6C5CE7" />
                </View>
              </Pressable>
              {recentFriends.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={({ pressed }) => [
                    styles.contactChip,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    router.push('/send');
                  }}
                >
                  <View style={styles.contactAvatarWrapper}>
                    <Avatar name={friend.user.displayName} uri={friend.user.avatarUrl} size={52} />
                    <View style={styles.contactOnlineDot} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.recentContactsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentContactsScroll}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.contactChip,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  router.push('/people/add');
                }}
              >
                <View style={styles.addFriendChip}>
                  <Ionicons name="add" size={24} color="#6C5CE7" />
                </View>
              </Pressable>
            </ScrollView>
          </View>
        )}

        {/* ─── Recent Transactions ─── */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/activity')}
              style={({ pressed }) => [
                styles.viewAllBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.light.primary} />
            </Pressable>
          </View>

          {txError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              iconColor={colors.light.textTertiary}
              iconGradient={['#F3F4F6', '#E5E7EB']}
              title="Activity is unavailable"
              subtitle="We could not load your latest transactions. Pull to refresh and try again."
            />
          ) : txLoading ? (
            <View style={styles.txnListCard}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i}>
                  <View style={styles.txnRow}>
                    <View style={styles.txnIconContainer}>
                      <Skeleton width={40} height={40} borderRadius={20} />
                      <View style={[styles.txnInfo, { gap: 6 }]}>
                        <Skeleton width={120} height={14} borderRadius={6} />
                        <Skeleton width={85} height={10} borderRadius={4} />
                      </View>
                    </View>
                    <Skeleton width={60} height={16} borderRadius={6} />
                  </View>
                  {i < 5 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          ) : recentTxns.length === 0 ? (
            <EmptyState
              iconName="swap-horizontal-outline"
              iconColor={colors.light.primary}
              iconGradient={['#F0EDFF', '#E8E4FF']}
              title="No transactions yet"
              subtitle="Send, receive, or deposit funds to build your activity history."
            />
          ) : (
            <View style={styles.txnListCard}>
              {recentTxns.map((txn, index) => {
                const isSend = txn.type === 'send' || txn.type === 'withdrawal';
                return (
                  <View key={txn.id}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.txnRow,
                        pressed && { backgroundColor: colors.light.borderLight },
                      ]}
                      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: txn.id } })}
                    >
                      <View style={styles.txnIconContainer}>
                        <View
                          style={[
                            styles.txnIconBg,
                            {
                              backgroundColor: isSend
                                ? colors.light.errorLight
                                : colors.light.successLight,
                            },
                          ]}
                        >
                          <Ionicons
                            name={isSend ? 'arrow-up-outline' : 'arrow-down-outline'}
                            size={18}
                            color={isSend ? colors.light.error : colors.light.success}
                          />
                        </View>
                        <View style={styles.txnInfo}>
                          <Text style={styles.txnPartner} numberOfLines={1}>
                            {isSend ? txn.receiverName : txn.senderName}
                          </Text>
                          <Text style={styles.txnMeta}>
                            {formatDate(txn.createdAt)} • {formatTime(txn.createdAt)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.txnAmountContainer}>
                        <Text
                          style={[
                            styles.txnAmount,
                            {
                              color: isSend ? colors.light.error : colors.light.success,
                            },
                          ]}
                        >
                          {isSend ? '-' : '+'}
                          {formatCurrency(txn.amount, txn.currency)}
                        </Text>
                        <Text style={styles.txnType}>
                          {txn.type === 'send' ? 'Sent' : txn.type === 'withdrawal' ? 'Withdrawal' : txn.type === 'topup' ? 'Deposit' : 'Received'}
                        </Text>
                      </View>
                    </Pressable>
                    {index < recentTxns.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ─── Layout ───
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
  },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userName: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  notificationBadge: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.light.error,
    borderWidth: 1.5,
    borderColor: colors.light.surface,
  },

  // ─── Balance Card (Flat, no shadows) ───
  balanceCard: {
    borderRadius: 16,
    height: 160,
    backgroundColor: colors.light.primary,
  },
  balanceContent: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyeBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginRight: 2,
  },
  balanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountTag: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  walletBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  walletDetails: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ─── Quick Actions ───
  quickActionsContainer: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.xl,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionBtn: {
    alignItems: 'center',
    width: '22%',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.light.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },

  // ─── Send Money Again ───
  recentContactsSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  recentContactsScroll: {
    paddingLeft: spacing.xs,
    gap: spacing.lg,
  },
  contactChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
  },
  addFriendChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#6C5CE7',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDFDFF',
  },
  contactAvatarWrapper: {
    position: 'relative',
  },
  contactOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.light.success,
    borderWidth: 2,
    borderColor: colors.light.background,
  },
  contactName: {
    ...typography.caption,
    color: colors.light.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'center',
    fontWeight: '500',
  },

  // ─── Transactions ───
  transactionsSection: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '600',
  },
  txnListCard: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  txnIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  txnIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnInfo: {
    flex: 1,
  },
  txnPartner: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  txnMeta: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 3,
    fontSize: 11,
  },
  txnAmountContainer: {
    alignItems: 'flex-end',
  },
  txnAmount: {
    ...typography.bodySm,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  txnType: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontSize: 10,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
    marginHorizontal: spacing.sm,
  },
});
