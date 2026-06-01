import React, { useEffect, useMemo, useState } from 'react';
import {
  Clipboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CoinLogo } from '@/components/ui/CoinLogo';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { borderRadius, shadows, spacing } from '@/theme/spacing';
import {
  FALLBACK_CURRENCIES,
  fetchPaymentCurrencies,
  prefetchCurrencyLogos,
} from '@/services/api/payments';
import type { PaymentCurrency } from '@/services/api/payments';
import { useDepositStore } from '@/stores/depositStore';

export default function DepositResultScreen() {
  const router = useRouter();
  const { payment, selectedCoinId, clearPayment } = useDepositStore();
  const [currencies, setCurrencies] = useState<PaymentCurrency[]>(FALLBACK_CURRENCIES);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!payment) {
      router.replace('/deposit');
      return;
    }

    let isMounted = true;
    fetchPaymentCurrencies()
      .then((items) => {
        prefetchCurrencyLogos(items, 40);
        if (isMounted) setCurrencies(items);
      })
      .catch(() => {
        if (isMounted) setCurrencies(FALLBACK_CURRENCIES);
      });

    return () => {
      isMounted = false;
    };
  }, [payment, router]);

  const selectedCoin = useMemo(
    () =>
      currencies.find((currency) => currency.id === selectedCoinId) ||
      FALLBACK_CURRENCIES.find((currency) => currency.id === selectedCoinId) ||
      FALLBACK_CURRENCIES[0],
    [currencies, selectedCoinId],
  );

  if (!payment) return null;

  const copyAddress = () => {
    Clipboard.setString(payment.payment_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const createAnotherDeposit = () => {
    clearPayment();
    router.replace('/deposit');
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Deposit Details" showBack onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <CoinLogo symbol={selectedCoin.symbol} size={44} />
          </View>
          <Text style={styles.title}>Address Ready</Text>
          <Text style={styles.subtitle}>
            Send only {selectedCoin.symbol} on {selectedCoin.network || selectedCoin.symbol} from your external wallet.
          </Text>
        </View>

        <Card variant="default" style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.cardTitle}>Payment Status</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{payment.status}</Text>
            </View>
          </View>

          <View style={styles.qrWrapper}>
            <QRCode
              value={payment.payment_address}
              size={210}
              color={colors.light.primary}
              backgroundColor="#FFFFFF"
            />
          </View>

          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={18} color={colors.light.warning} />
            <Text style={styles.warningText}>
              Sending another asset or network can permanently lose funds.
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Payment ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{payment.payment_id}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Network</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {selectedCoin.name}
            </Text>
          </View>

          <Pressable style={styles.addressBox} onPress={copyAddress}>
            <View style={styles.addressHeader}>
              <Text style={styles.addressLabel}>Payment Address</Text>
              <Ionicons name="copy-outline" size={18} color={colors.light.primary} />
            </View>
            <Text style={styles.addressText}>{payment.payment_address}</Text>
          </Pressable>

          <Button
            title={copied ? 'Copied' : 'Copy Address'}
            onPress={copyAddress}
            fullWidth
            icon={<Ionicons name="copy-outline" size={18} color="#FFFFFF" />}
            style={styles.copyButton}
          />
        </Card>

        <Button
          title="Create Another Address"
          onPress={createAnotherDeposit}
          variant="outline"
          fullWidth
          style={styles.secondaryButton}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.card,
  },
  title: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  cardTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  statusRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  statusBadge: {
    borderRadius: borderRadius.sm,
    backgroundColor: colors.light.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: {
    ...typography.caption,
    color: colors.light.success,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  warningBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.warningLight,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  warningText: {
    ...typography.caption,
    color: colors.light.warning,
    flex: 1,
    lineHeight: 18,
  },
  infoRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
  },
  infoValue: {
    ...typography.caption,
    color: colors.light.textPrimary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  addressBox: {
    width: '100%',
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.background,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  addressLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
  },
  addressText: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  copyButton: {
    marginTop: spacing.lg,
  },
  secondaryButton: {
    marginTop: spacing.lg,
  },
});
