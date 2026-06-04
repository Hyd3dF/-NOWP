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
import { CoinLogo } from '@/components/ui/CoinLogo';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { borderRadius, spacing } from '@/theme/spacing';
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
            <CoinLogo symbol={selectedCoin.symbol} size={40} />
          </View>
          <Text style={styles.title}>Address Ready</Text>
          <Text style={styles.subtitle}>
            Send only {selectedCoin.symbol} on {selectedCoin.network || selectedCoin.symbol} from your external wallet.
          </Text>
        </View>

        {/* QR Code Wrapper */}
        <View style={styles.qrWrapper}>
          <QRCode
            value={payment.payment_address}
            size={180}
            color={colors.light.primary}
            backgroundColor="#FFFFFF"
          />
        </View>

        {/* Warning Box */}
        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={18} color={colors.light.warning} />
          <Text style={styles.warningText}>
            Sending another asset or network can permanently lose funds.
          </Text>
        </View>

        {/* Status Info Row */}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Payment Status</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{payment.status}</Text>
          </View>
        </View>

        {/* Info Rows */}
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

        {/* Payment Address Stacked Input */}
        <Pressable style={styles.addressContainer} onPress={copyAddress}>
          <Text style={styles.addressLabel}>Payment Address</Text>
          <View style={styles.addressLineRow}>
            <Text style={styles.addressText} numberOfLines={2}>
              {payment.payment_address}
            </Text>
            <Ionicons name="copy-outline" size={18} color={colors.light.primary} style={styles.copyIcon} />
          </View>
        </Pressable>

        {/* Action Buttons */}
        <Button
          title={copied ? 'Copied' : 'Copy Address'}
          onPress={copyAddress}
          icon={<Ionicons name="copy-outline" size={18} color="#FFFFFF" />}
          style={styles.button}
        />

        <Button
          title="Create Another Address"
          onPress={createAnotherDeposit}
          variant="outline"
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
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  hero: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  logoWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F7F7F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
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
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  warningBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.warningLight,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  warningText: {
    ...typography.caption,
    color: colors.light.warning,
    flex: 1,
    lineHeight: 18,
  },
  statusRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
    marginBottom: spacing.xs,
  },
  statusLabel: {
    fontSize: 13,
    color: colors.light.textSecondary,
    fontWeight: '500',
  },
  statusBadge: {
    borderRadius: 6,
    backgroundColor: colors.light.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    color: colors.light.success,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
    marginBottom: spacing.xs,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.light.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  addressContainer: {
    width: '100%',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.light.textSecondary,
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },
  addressLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.light.border,
    paddingVertical: spacing.sm,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.light.textPrimary,
    lineHeight: 20,
    marginRight: spacing.md,
  },
  copyIcon: {
    marginLeft: spacing.xs,
  },
  button: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing['2xl'],
    minWidth: 220,
    borderRadius: 22,
  },
  secondaryButton: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    minWidth: 220,
    borderRadius: 22,
  },
});
