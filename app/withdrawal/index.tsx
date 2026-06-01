import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { borderRadius, spacing } from '@/theme/spacing';

export default function WithdrawalScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [walletAddress, setWalletAddress] = useState('');

  return (
    <View style={styles.container}>
      <HeaderBar title="External Wallet" showBack onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="wallet-outline" size={34} color={colors.light.primary} />
          </View>

          <Text style={styles.title}>Send to External Wallet</Text>
          <Text style={styles.subtitle}>
            External crypto withdrawals will be enabled after the payout backend is connected and reviewed.
          </Text>

          <Card variant="default" style={styles.formCard}>
            <View style={styles.noticeBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.light.warning} />
              <Text style={styles.noticeText}>
                This flow is locked for safety. Oroya will not create a fake withdrawal or change your balance.
              </Text>
            </View>

            <Input
              label="Amount"
              placeholder="0.00"
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />

            <Input
              label="Currency"
              placeholder="USDT"
              value={currency}
              onChangeText={(value) => setCurrency(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoCapitalize="characters"
            />

            <Input
              label="Network"
              placeholder="TRC20"
              value={network}
              onChangeText={(value) => setNetwork(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoCapitalize="characters"
            />

            <Input
              label="Wallet Address"
              placeholder="Paste external wallet address"
              value={walletAddress}
              onChangeText={setWalletAddress}
              autoCapitalize="none"
            />

            <Button
              title="External Transfers Coming Soon"
              onPress={() => {}}
              disabled
              fullWidth
              style={styles.button}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
    alignItems: 'center',
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
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
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  formCard: {
    width: '100%',
    padding: spacing.lg,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.warningLight,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: {
    ...typography.caption,
    color: colors.light.warning,
    flex: 1,
    lineHeight: 18,
  },
  button: {
    marginTop: spacing.lg,
  },
});
