import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useSendStore } from '@/stores/sendStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function SendReceiptScreen() {
  const router = useRouter();
  const { lastTransactionRef, lastTransactionDate, lastAmount, lastRecipientName } = useSendStore();

  const numAmount = parseFloat(lastAmount || '0');

  const handleDone = () => {
    router.replace('/(tabs)/home');
  };

  const handleSendAgain = () => {
    router.replace('/send');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.successIconContainer}>
          <View style={styles.successCircleOuter}>
            <View style={styles.successCircleInner}>
              <Ionicons name="checkmark" size={48} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.title}>Money Sent Successfully!</Text>
          <Text style={styles.subtitle}>Your transfer has been processed</Text>
        </View>

        {/* Receipt Card */}
        <Card variant="default" style={styles.receiptCard}>
          <View style={styles.amountSection}>
            <Text style={styles.amountText}>{formatCurrency(numAmount)}</Text>
            <Text style={styles.recipientText}>to {lastRecipientName}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.label}>Transaction Date</Text>
            <Text style={styles.value}>
              {lastTransactionDate ? formatDateTime(lastTransactionDate) : formatDateTime(new Date().toISOString())}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Reference Code</Text>
            <Text style={[styles.value, { fontFamily: 'monospace' }]}>
              {lastTransactionRef || 'REF-XXXXXX'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Payment Method</Text>
            <Text style={styles.value}>Oroya Balance</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.value, { color: colors.light.success, fontWeight: '700' }]}>
              Completed
            </Text>
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            title="Done"
            onPress={handleDone}
            fullWidth
          />
          <Button
            title="Send Money Again"
            onPress={handleSendAgain}
            variant="outline"
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
  },
  successIconContainer: {
    alignItems: 'center',
    marginTop: spacing['5xl'],
  },
  successCircleOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successCircleInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.light.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.light.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.xs,
  },
  receiptCard: {
    padding: spacing.xl,
    marginVertical: spacing.xl,
  },
  amountSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  amountText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.light.textPrimary,
  },
  recipientText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  value: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  actions: {
    gap: spacing.md,
  },
});
