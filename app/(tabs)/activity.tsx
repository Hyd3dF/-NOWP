import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useTransactionStore } from '@/stores/transactionStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, formatTime } from '@/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';

type FilterType = 'all' | 'sent' | 'received' | 'pending' | 'failed';

export default function ActivityScreen() {
  const router = useRouter();
  const {
    filter,
    setFilter,
    getFilteredTransactions,
    fetchTransactions,
    isLoading: txnsLoading,
    error,
  } = useTransactionStore();

  const [visibleCount, setVisibleCount] = useState(6);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    setVisibleCount(6);
  }, [filter]);

  const filteredTxns = getFilteredTransactions();

  const handleLoadMore = () => {
    if (loadingMore || visibleCount >= filteredTxns.length) return;

    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 6, filteredTxns.length));
      setLoadingMore(false);
    }, 1000);
  };

  // Helper to group transactions by date
  const getGroupedTransactions = () => {
    const groups: { [key: string]: typeof filteredTxns } = {};
    const visibleTxns = filteredTxns.slice(0, visibleCount);
    
    visibleTxns.forEach((txn) => {
      const dateStr = formatDate(txn.createdAt);
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(txn);
    });

    return Object.keys(groups).map((date) => ({
      title: date,
      data: groups[date],
    }));
  };

  const groupedTxns = getGroupedTransactions();

  const filters: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Sent', value: 'sent' },
    { label: 'Received', value: 'received' },
    { label: 'Pending', value: 'pending' },
    { label: 'Failed', value: 'failed' },
  ];

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.light.primary} />
        <Text style={styles.footerLoaderText}>Loading older transactions...</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Activity" />
      
      {/* Filter Pills */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {filters.map((f) => {
            const isActive = filter === f.value;
            return (
              <Pressable
                key={f.value}
                style={[
                  styles.filterPill,
                  isActive && styles.filterPillActive,
                ]}
                onPress={() => setFilter(f.value)}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    isActive && styles.filterLabelActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Transaction List */}
      <View style={styles.listContainer}>
        {error ? (
          <EmptyState
            title="Activity is unavailable"
            subtitle="We could not load your transactions right now. Please try again in a moment."
          />
        ) : txnsLoading ? (
          <View style={{ flex: 1 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} style={styles.txnRowSkeleton}>
                <View style={styles.txnLeft}>
                  <Skeleton width={36} height={36} borderRadius={6} />
                  <View style={[styles.txnInfo, { gap: 6 }]}>
                    <Skeleton width={120} height={14} borderRadius={4} />
                    <Skeleton width={80} height={10} borderRadius={4} />
                  </View>
                </View>
                <Skeleton width={70} height={16} borderRadius={4} />
              </View>
            ))}
          </View>
        ) : (
          <SectionList
            sections={groupedTxns}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{title}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const isSend = item.type === 'send' || item.type === 'withdrawal';
              return (
                <Pressable
                  style={styles.txnRow}
                  onPress={() => router.push({ pathname: '/activity/[id]', params: { id: item.id } })}
                >
                  <View style={styles.txnLeft}>
                    <View
                      style={[
                        styles.iconBg,
                        {
                          backgroundColor: isSend
                            ? colors.light.errorLight
                            : colors.light.successLight,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isSend ? 'arrow-up' : 'arrow-down'}
                        size={18}
                        color={isSend ? colors.light.error : colors.light.success}
                      />
                    </View>
                    <View style={styles.txnInfo}>
                      <Text style={styles.txnPartner}>
                        {isSend ? item.receiverName : item.senderName}
                      </Text>
                      <View style={styles.txnSubInfo}>
                        <Text style={styles.txnTime}>{formatTime(item.createdAt)}</Text>
                        {item.status !== 'completed' && (
                          <>
                            <Text style={styles.dot}>|</Text>
                            <Badge status={item.status} size="sm" />
                          </>
                        )}
                      </View>
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
                    {formatCurrency(item.amount, item.currency)}
                  </Text>
                </Pressable>
              );
            }}
            ListFooterComponent={renderFooter}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            ListEmptyComponent={
              <EmptyState
                title={filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}
                subtitle={
                  filter === 'all'
                    ? 'Send, receive, or deposit funds to see activity here.'
                    : 'Try another filter or check back after your next transaction.'
                }
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
  filterContainer: {
    height: 48,
    marginVertical: spacing.sm,
  },
  filterScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    ...shadows.card,
    elevation: 1,
  },
  filterPillActive: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  filterLabel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    fontWeight: '500',
  },
  filterLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  listContent: {
    paddingBottom: 100, // Bottom tab space
  },
  sectionHeader: {
    paddingVertical: spacing.sm,
    backgroundColor: colors.light.background,
  },
  sectionHeaderText: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    fontWeight: '600',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  txnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
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
  txnSubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: spacing.xs,
  },
  txnTime: {
    ...typography.caption,
    color: colors.light.textTertiary,
  },
  dot: {
    fontSize: 8,
    color: colors.light.textTertiary,
  },
  txnAmount: {
    ...typography.bodySm,
    fontWeight: '700',
    textAlign: 'right',
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerLoaderText: {
    ...typography.caption,
    color: colors.light.textSecondary,
  },
  txnRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
});
