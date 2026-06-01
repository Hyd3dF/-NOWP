import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useFriendStore } from '@/stores/friendStore';
import { useSendStore } from '@/stores/sendStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate, formatTime } from '@/utils/format';

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const friends = useFriendStore((s) => s.friends);
  const setRecipient = useSendStore((s) => s.setRecipient);
  const transactions = useTransactionStore((s) => s.transactions);

  const friend = friends.find((f) => f.user.id === id || f.id === id);

  if (!friend) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar title="Profile" showBack onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <Ionicons name="person-circle-outline" size={48} color={colors.light.textTertiary} />
          <Text style={styles.errorText}>
            This profile is not available from your friends list right now.
          </Text>
          <Button title="Back to People" onPress={() => router.back()} style={styles.errorBtn} />
        </View>
      </SafeAreaView>
    );
  }

  const relatedTransactions = transactions.filter(
    (txn) =>
      txn.senderId === friend.user.id || txn.receiverId === friend.user.id
  );

  const handleSendMoney = () => {
    setRecipient(
      friend.user.id,
      friend.user.displayName,
      friend.user.username,
      friend.user.avatarUrl
    );
    // Navigate directly to the send modal flow
    router.push('/send');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Friend Profile" showBack onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <Card variant="default" style={styles.profileCard}>
          <Avatar name={friend.user.displayName} uri={friend.user.avatarUrl} size={80} />
          <Text style={styles.displayName}>{friend.user.displayName}</Text>
          {friend.user.username ? <Text style={styles.username}>@{friend.user.username}</Text> : null}
          {friend.user.oroyaId ? <Text style={styles.phone}>#{friend.user.oroyaId}</Text> : null}

          <Button
            title="Send Money"
            onPress={handleSendMoney}
            style={styles.sendBtn}
            icon={<Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />}
            fullWidth
          />
        </Card>

        <Text style={styles.sectionTitle}>Recent Activity</Text>

        {relatedTransactions.length === 0 ? (
          <Card variant="default" style={styles.emptyCard}>
            <Ionicons name="swap-horizontal" size={32} color={colors.light.textTertiary} />
            <Text style={styles.emptyText}>No transaction history with {friend.user.displayName.split(' ')[0]}</Text>
          </Card>
        ) : (
          <View style={styles.txnContainer}>
            {relatedTransactions.map((txn, index) => {
              const isSend = txn.type === 'send' || txn.type === 'withdrawal';
              return (
                <View key={txn.id}>
                  <Pressable
                    style={styles.txnRow}
                    onPress={() => router.push({ pathname: '/activity/[id]', params: { id: txn.id } })}
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
                          size={16}
                          color={isSend ? colors.light.error : colors.light.success}
                        />
                      </View>
                      <View>
                        <Text style={styles.txnTitle}>{txn.note || (isSend ? 'Sent' : 'Received')}</Text>
                        <Text style={styles.txnMeta}>
                          {formatDate(txn.createdAt)} - {formatTime(txn.createdAt)}
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
                  {index < relatedTransactions.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        )}
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
  profileCard: {
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  displayName: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  username: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  phone: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: spacing.xs,
  },
  sendBtn: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
  },
  txnContainer: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  txnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  txnMeta: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
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
