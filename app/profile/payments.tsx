import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Card } from '@/components/ui/Card';

export default function PaymentSettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Payment Settings" showBack onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Wallet</Text>
        
        <Card variant="default" style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardLeft}>
              <View style={[styles.cardIconBg, { backgroundColor: '#E0FFFE' }]}>
                <Ionicons name="wallet" size={22} color={colors.light.secondary} />
              </View>
              <View>
                <Text style={styles.cardTitle}>Default Currency</Text>
                <Text style={styles.cardSubtitle}>USD wallet balance and limits</Text>
              </View>
            </View>
            <Text style={styles.activeText}>Primary</Text>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Transaction Limits</Text>
        <Card variant="default" style={styles.limitsCard}>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily Send Limit</Text>
            <Text style={styles.limitValue}>$100.00</Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily Send Count</Text>
            <Text style={styles.limitValue}>2</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily Receive Limit</Text>
            <Text style={styles.limitValue}>$100.00</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily Receive Count</Text>
            <Text style={styles.limitValue}>5</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  card: {
    paddingHorizontal: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardIconBg: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  activeText: {
    ...typography.caption,
    color: colors.light.success,
    fontWeight: '700',
  },
  limitsCard: {
    paddingHorizontal: spacing.md,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  limitLabel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  limitValue: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
});
