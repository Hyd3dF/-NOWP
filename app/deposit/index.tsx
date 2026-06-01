import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CoinLogo } from '@/components/ui/CoinLogo';
import { ApiError, api } from '@/services/api/client';
import { isValidAmount } from '@/utils/validation';
import {
  FALLBACK_CURRENCIES,
  fetchPaymentCurrencies,
  prefetchCurrencyLogos,
} from '@/services/api/payments';
import type { PaymentCurrency } from '@/services/api/payments';

interface DepositPayment {
  id: string;
  reference_id: string;
  payment_id: string;
  payment_address: string;
  payment_url: string;
  status: string;
  amount: number;
  currency: string;
  network: string;
  expires_at?: string;
}

interface DepositResponse {
  success: boolean;
  payment: DepositPayment;
}

export default function DepositScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ selectedCoin?: string }>();

  const [currencies, setCurrencies] = useState<PaymentCurrency[]>(FALLBACK_CURRENCIES);
  const [amount, setAmount] = useState('');
  const [payment, setPayment] = useState<DepositPayment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCurrenciesLoading, setIsCurrenciesLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    setIsCurrenciesLoading(true);
    fetchPaymentCurrencies()
      .then((items) => {
        prefetchCurrencyLogos(items, 40);
        if (isMounted) setCurrencies(items);
      })
      .catch(() => {
        prefetchCurrencyLogos(FALLBACK_CURRENCIES, 40);
        if (isMounted) setCurrencies(FALLBACK_CURRENCIES);
      })
      .finally(() => {
        if (isMounted) setIsCurrenciesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const coinId = String(params.selectedCoin || 'btc').toLowerCase();
  const selectedCoinObj = useMemo(
    () => currencies.find((currency) => currency.id === coinId) || currencies[0] || FALLBACK_CURRENCIES[0],
    [coinId, currencies],
  );

  const createDeposit = async () => {
    setError('');
    setPayment(null);

    if (!isValidAmount(amount)) {
      setError('Enter an amount greater than zero to create a deposit address.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post<DepositResponse>('/payments/create-deposit', {
        amount: Number(amount),
        currency: 'usd',
        network: selectedCoinObj.id,
      });
      setPayment(response.payment);
    } catch (error) {
      const message = error instanceof ApiError ? getDepositErrorMessage(error.code) : '';
      setError(message || 'Deposit address could not be created right now. Please try again in a moment.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyAddress = () => {
    if (!payment?.payment_address) return;
    Clipboard.setString(payment.payment_address);
    alert('Deposit address copied.');
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Deposit Crypto" showBack onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.description}>
            Oroya creates the deposit address securely on the server. Send only the selected crypto and network from your external wallet.
          </Text>

          <Card variant="default" style={styles.formCard}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              label="Amount (USD)"
              placeholder="Enter amount in USD"
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
            />

            <Text style={styles.fieldLabel}>Select Crypto</Text>
            <Pressable
              style={styles.coinSelectBtn}
              onPress={() => router.push('/deposit/select-coin')}
            >
              <View style={styles.coinSelectLeft}>
                <CoinLogo
                  symbol={selectedCoinObj.symbol}
                  size={36}
                  style={styles.selectedCoinLogo}
                />
                <View>
                  <View style={styles.selectedCoinSymbolRow}>
                    <Text style={styles.selectedCoinSymbol}>{selectedCoinObj.symbol}</Text>
                    {selectedCoinObj.network ? (
                      <View style={[styles.selectedNetworkBadge, { backgroundColor: selectedCoinObj.badgeColor || colors.light.primary }]}>
                        <Text style={styles.selectedNetworkText}>{selectedCoinObj.network}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.selectedCoinName}>{selectedCoinObj.name}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.light.textTertiary} />
            </Pressable>

            <Button
              title={isCurrenciesLoading ? 'Loading currencies...' : 'Create Deposit Address'}
              onPress={createDeposit}
              loading={isLoading}
              disabled={isCurrenciesLoading}
              fullWidth
              style={styles.createBtn}
            />
          </Card>

          {isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.light.primary} />
              <Text style={styles.loadingText}>Creating deposit address...</Text>
            </View>
          ) : null}

          {payment ? (
            <Card variant="default" style={styles.resultCard}>
              <View style={styles.statusRow}>
                <Text style={styles.resultTitle}>Deposit Address Ready</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{payment.status}</Text>
                </View>
              </View>

              <Text style={styles.resultDescription}>
                Send only {selectedCoinObj.symbol} on {selectedCoinObj.network || selectedCoinObj.symbol} to this address. Sending another asset or network can permanently lose funds.
              </Text>

              <View style={styles.qrWrapper}>
                <QRCode
                  value={payment.payment_address}
                  size={190}
                  color={colors.light.primary}
                  backgroundColor="#FFFFFF"
                />
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment ID</Text>
                <Text style={styles.infoValue}>{payment.payment_id}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Network</Text>
                <Text style={styles.infoValue}>
                  {selectedCoinObj.name} ({selectedCoinObj.network || selectedCoinObj.symbol})
                </Text>
              </View>

              <View style={styles.addressBox}>
                <Text style={styles.addressLabel}>Payment Address</Text>
                <Text style={styles.addressText}>{payment.payment_address}</Text>
              </View>

              <Button
                title="Copy Address"
                onPress={copyAddress}
                fullWidth
                icon={<Ionicons name="copy-outline" size={18} color="#FFFFFF" />}
                style={styles.copyBtn}
              />
            </Card>
          ) : null}
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
    paddingBottom: spacing['2xl'],
  },
  description: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  formCard: {
    padding: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.light.errorLight,
    borderWidth: 1,
    borderColor: colors.light.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.light.error,
    textAlign: 'center',
  },
  fieldLabel: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  coinSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: colors.light.surface,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  coinSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedCoinLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.md,
  },
  selectedCoinSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedCoinSymbol: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.light.textPrimary,
  },
  selectedNetworkBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selectedNetworkText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  selectedCoinName: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  createBtn: {
    marginTop: spacing.lg,
  },
  loadingCard: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.light.surface,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.sm,
  },
  resultCard: {
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  statusRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  resultTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    flex: 1,
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
  resultDescription: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    width: '100%',
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  infoRow: {
    width: '100%',
    flexDirection: 'row',
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
  addressLabel: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginBottom: spacing.xs,
  },
  addressText: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  copyBtn: {
    marginTop: spacing.lg,
  },
});

function getDepositErrorMessage(code: string) {
  switch (code) {
    case 'auth_failed':
      return 'Please sign in again before creating a deposit address.';
    case 'validation_failed':
      return 'Check the amount and selected network, then try again.';
    case 'server_unavailable':
    case 'connection_failed':
      return 'Deposit service is temporarily unavailable. Please try again shortly.';
    default:
      return '';
  }
}
