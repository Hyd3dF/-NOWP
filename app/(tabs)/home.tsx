import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { useFriendStore } from '@/stores/friendStore';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { formatCurrency, formatDate, formatTime, getGreeting, maskBalance } from '@/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  
  const { wallet, isBalanceVisible, isLoading: walletLoading, error: walletError, fetchWallet, toggleBalanceVisibility } = useWalletStore();
  const { transactions, isLoading: txLoading, error: txError, fetchTransactions } = useTransactionStore();
  const { friends, isLoading: friendsLoading, fetchFriends } = useFriendStore();

  const [refreshing, setRefreshing] = useState(false);

  const initData = async () => {
    await Promise.all([fetchWallet(), fetchTransactions(), fetchFriends()]);
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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{user?.displayName ? getFirstName(user.displayName) : 'there'}</Text>
          </View>
          <Pressable
            onPress={() => alert('You have no new notifications.')}
            style={styles.notificationBtn}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.light.textPrimary} />
            <View style={styles.notificationBadge} />
          </Pressable>
        </View>

        {/* Balance Card */}
        <Card variant="gradient" style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <Pressable onPress={toggleBalanceVisibility} style={styles.eyeIcon}>
              <Ionicons
                name={isBalanceVisible ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
          {walletLoading ? (
            <Skeleton width={180} height={38} borderRadius={8} style={{ marginVertical: spacing.xs, backgroundColor: 'rgba(255,255,255,0.35)' }} />
          ) : (
            <Text style={styles.balanceAmount}>
              {isBalanceVisible
                ? formatCurrency(wallet?.balance || 0, wallet?.currency)
                : maskBalance(formatCurrency(wallet?.balance || 0, wallet?.currency))}
            </Text>
          )}
          <View style={styles.balanceFooter}>
            <View style={styles.trendContainer}>
              <Ionicons name={walletError ? 'cloud-offline-outline' : 'shield-checkmark-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.trendText}>{walletError ? 'Balance unavailable' : 'Wallet protected'}</Text>
            </View>
            <Text style={styles.walletDetails}>Default Wallet ({wallet?.currency || 'USD'})</Text>
          </View>
        </Card>

        {/* Quick Actions Row */}
        <View style={styles.quickActionsContainer}>
          <View style={styles.quickActionsRow}>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/send')}>
              <View style={[styles.actionIconContainer, { backgroundColor: '#F0EDFF' }]}>
                <Ionicons name="arrow-up" size={24} color={colors.light.primary} />
              </View>
              <Text style={styles.actionLabel}>Send</Text>
            </Pressable>

            <Pressable style={styles.actionBtn} onPress={() => router.push('/receive')}>
              <View style={[styles.actionIconContainer, { backgroundColor: colors.light.successLight }]}>
                <Ionicons name="arrow-down" size={24} color={colors.light.success} />
              </View>
              <Text style={styles.actionLabel}>Receive</Text>
            </Pressable>

            <Pressable style={styles.actionBtn} onPress={() => router.push('/deposit')}>
              <View style={[styles.actionIconContainer, { backgroundColor: colors.light.warningLight }]}>
                <Ionicons name="wallet-outline" size={24} color={colors.light.warning} />
              </View>
              <Text style={styles.actionLabel}>Deposit</Text>
            </Pressable>

            <Pressable style={styles.actionBtn} onPress={() => router.push('/qr/scan')}>
              <View style={[styles.actionIconContainer, { backgroundColor: '#E0FFFE' }]}>
                <Ionicons name="qr-code-outline" size={24} color={colors.light.secondary} />
              </View>
              <Text style={styles.actionLabel}>Scan</Text>
            </Pressable>
          </View>
        </View>

        {/* Recent Recipients */}
        {friendsLoading ? (
          <View style={styles.recentContactsSection}>
            <Text style={styles.sectionTitle}>Send Money Again</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentContactsScroll}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.contactChip}>
                  <Skeleton width={50} height={50} borderRadius={25} />
                  <Skeleton width={40} height={10} borderRadius={4} style={{ marginTop: spacing.sm }} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : recentFriends.length > 0 ? (
          <View style={styles.recentContactsSection}>
            <Text style={styles.sectionTitle}>Send Money Again</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentContactsScroll}
            >
              {recentFriends.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={styles.contactChip}
                  onPress={() => {
                    // Navigate to send with contact preselected
                    router.push('/send');
                  }}
                >
                  <Avatar name={friend.user.displayName} uri={friend.user.avatarUrl} size={50} />
                  <Text style={styles.contactName} numberOfLines={1}>
                    {getFirstName(friend.user.displayName)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Recent Transactions */}
        <View style={styles.transactionsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <Pressable onPress={() => router.replace('/(tabs)/activity')}>
              <Text style={styles.viewAllText}>View All</Text>
            </Pressable>
          </View>

          {txError ? (
            <EmptyState
              title="Activity is unavailable"
              subtitle="We could not load your latest transactions. Pull to refresh and try again."
            />
          ) : txLoading ? (
            <View style={styles.txnListCard}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i}>
                  <View style={styles.txnRow}>
                    <View style={styles.txnIconContainer}>
                      <Skeleton width={36} height={36} borderRadius={18} />
                      <View style={[styles.txnInfo, { gap: 6 }]}>
                        <Skeleton width={120} height={14} borderRadius={4} />
                        <Skeleton width={85} height={10} borderRadius={4} />
                      </View>
                    </View>
                    <Skeleton width={60} height={16} borderRadius={4} />
                  </View>
                  {i < 5 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          ) : recentTxns.length === 0 ? (
            <EmptyState
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
                      style={styles.txnRow}
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
                    </Pressable>
                    {index < recentTxns.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100, // Account for bottom tab bar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  greeting: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  userName: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  notificationBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.light.error,
  },
  balanceCard: {
    padding: spacing.xl,
    height: 180,
    justifyContent: 'space-between',
    backgroundColor: colors.light.primary, // fallback
    shadowColor: colors.light.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    ...typography.bodySm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  eyeIcon: {
    padding: spacing.xs,
  },
  balanceAmount: {
    ...typography.balance,
    color: '#FFFFFF',
  },
  balanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  trendText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  walletDetails: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },
  quickActionsContainer: {
    marginVertical: spacing.xl,
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
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    ...shadows.card,
    elevation: 1,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
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
    gap: spacing.md,
  },
  contactChip: {
    alignItems: 'center',
    width: 70,
  },
  contactName: {
    ...typography.caption,
    color: colors.light.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  transactionsSection: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
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
    ...shadows.card,
  },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  txnIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  txnIconBg: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
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
  },
  txnMeta: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: spacing.xs,
  },
  txnAmount: {
    ...typography.bodySm,
    fontWeight: '700',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
});
