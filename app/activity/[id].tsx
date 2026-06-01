import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useTransactionStore } from '@/stores/transactionStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getTransactionById, fetchTransactions, isLoading, error } = useTransactionStore();
  const transaction = getTransactionById(id);
  const [hasRequestedTransaction, setHasRequestedTransaction] = useState(false);

  useEffect(() => {
    if (!transaction && !hasRequestedTransaction) {
      setHasRequestedTransaction(true);
      fetchTransactions();
    }
  }, [fetchTransactions, hasRequestedTransaction, transaction]);

  if (!transaction && (isLoading || !hasRequestedTransaction)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar title="Receipt" showBack onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <ActivityIndicator color={colors.light.primary} />
          <Text style={styles.errorText}>Loading receipt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar title="Receipt" showBack onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.light.error} />
          <Text style={styles.errorText}>
            {error || 'We could not find this transaction. It may still be processing or no longer available.'}
          </Text>
          <Button title="Back to Activity" onPress={() => router.replace('/(tabs)/activity')} style={styles.errorBtn} />
        </View>
      </SafeAreaView>
    );
  }

  const isSend = transaction.type === 'send' || transaction.type === 'withdrawal';
  const partnerName = isSend ? transaction.receiverName : transaction.senderName;
  const partnerAvatar = isSend ? transaction.receiverAvatar : transaction.senderAvatar;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Receipt" showBack onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="default" style={styles.receiptCard}>
          {/* Header Info */}
          <View style={styles.headerInfo}>
            <View style={styles.avatarWrapper}>
              <Avatar name={partnerName} uri={partnerAvatar} size={64} />
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: isSend
                      ? colors.light.error
                      : colors.light.success,
                  },
                ]}
              >
                <Ionicons
                  name={isSend ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color="#FFFFFF"
                />
              </View>
            </View>
            <Text style={styles.amount}>
              {isSend ? '-' : '+'}
              {formatCurrency(transaction.amount, transaction.currency)}
            </Text>
            <Text style={styles.partnerName}>
              {isSend ? `Sent to ${partnerName}` : `Received from ${partnerName}`}
            </Text>
            <View style={styles.statusBadgeWrapper}>
              <Badge status={transaction.status} />
            </View>
          </View>

          <View style={styles.dashedLineContainer}>
            <View style={styles.dashedLine} />
          </View>

          {/* Details list */}
          <View style={styles.detailsList}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reference ID</Text>
              <Text style={[styles.detailValue, styles.monoText]}>
                {transaction.reference}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date & Time</Text>
              <Text style={styles.detailValue}>
                {formatDateTime(transaction.createdAt)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={[styles.detailValue, styles.capitalizeText]}>
                {transaction.type}
              </Text>
            </View>

            {transaction.note ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Note / Memo</Text>
                <Text style={styles.detailValue}>{transaction.note}</Text>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment Method</Text>
              <Text style={styles.detailValue}>Oroya Wallet</Text>
            </View>
          </View>
        </Card>

        {/* Action button */}
        <Button
          title={isSend ? 'Send Again' : 'Send Back'}
          onPress={() => {
            // Tapping this should redirect to send and prefill
            router.push('/send');
          }}
          style={styles.actionBtn}
          icon={<Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />}
        />
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
    paddingBottom: spacing['3xl'],
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  errorText: {
    ...typography.body,
    color: colors.light.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  errorBtn: {
    width: '100%',
  },
  receiptCard: {
    padding: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  headerInfo: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  typeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    ...typography.balance,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  partnerName: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.xs,
  },
  statusBadgeWrapper: {
    marginTop: spacing.md,
  },
  dashedLineContainer: {
    marginVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedLine: {
    width: '100%',
    height: 1,
    borderWidth: 1,
    borderColor: colors.light.border,
    borderStyle: 'dashed',
  },
  detailsList: {
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailLabel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  detailValue: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: '60%',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  capitalizeText: {
    textTransform: 'capitalize',
  },
  actionBtn: {
    marginTop: spacing.sm,
  },
});
