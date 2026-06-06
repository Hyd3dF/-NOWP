import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Button } from '@/components/ui/Button';
import { CoinLogo } from '@/components/ui/CoinLogo';
import { ApiError, api, createIdempotencyKey } from '@/services/api/client';
import { isValidAmount } from '@/utils/validation';
import {
  FALLBACK_CURRENCIES,
  fetchPaymentCurrencies,
  prefetchCurrencyLogos,
} from '@/services/api/payments';
import type { PaymentCurrency } from '@/services/api/payments';
import { useDepositStore } from '@/stores/depositStore';
import type { DepositPayment } from '@/stores/depositStore';

interface DepositResponse {
  success: boolean;
  payment: DepositPayment;
}

export default function DepositScreen() {
  const router = useRouter();
  const { selectedCoinId, setPayment } = useDepositStore();

  const [currencies, setCurrencies] = useState<PaymentCurrency[]>(FALLBACK_CURRENCIES);
  const [amount, setAmount] = useState('');
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

  const selectedCoinObj = useMemo(
    () =>
      currencies.find((currency) => currency.id === selectedCoinId) ||
      currencies[0] ||
      FALLBACK_CURRENCIES[0],
    [selectedCoinId, currencies],
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
      const idempotencyKey = createIdempotencyKey('dep');
      const response = await api.post<DepositResponse>('/payments/create-deposit', {
        amount: Number(amount),
        currency: 'usd',
        network: (selectedCoinObj.code || selectedCoinObj.id).toLowerCase(),
        idempotency_key: idempotencyKey,
      }, {
        'X-Idempotency-Key': idempotencyKey,
      });
      setPayment(response.payment);
      router.push('/deposit/result');
    } catch (error) {
      const message = error instanceof ApiError ? getDepositErrorMessage(error.code) : '';
      const requestId = error instanceof ApiError && error.requestId ? ` Ref: ${error.requestId}` : '';
      setError(
        `${message || 'Deposit address could not be created right now. Please try again in a moment.'}${requestId}`,
      );
    } finally {
      setIsLoading(false);
    }
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
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Amount (USD) Option */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Amount (USD)</Text>
            <View style={styles.inputLineRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Enter amount in USD"
                placeholderTextColor={colors.light.textTertiary}
                value={amount}
                onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Select Crypto Option */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Select Crypto</Text>
            <Pressable
              style={styles.coinSelectRow}
              onPress={() => router.push('/deposit/select-coin')}
            >
              <View style={styles.coinSelectLeft}>
                <CoinLogo
                  symbol={selectedCoinObj.symbol}
                  size={28}
                  style={styles.selectedCoinLogo}
                />
                <View style={styles.selectedCoinInfo}>
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
              <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
            </Pressable>
          </View>

          <Button
            title={isCurrenciesLoading ? 'Loading currencies...' : 'Create Deposit Address'}
            onPress={createDeposit}
            loading={isLoading}
            disabled={isCurrenciesLoading}
            style={styles.button}
          />

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.light.primary} />
              <Text style={styles.loadingText}>Creating deposit address...</Text>
            </View>
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
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  inputContainer: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.light.textSecondary,
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },
  inputLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.light.border,
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: colors.light.textPrimary,
    textAlign: 'left',
    paddingVertical: spacing.sm,
  },
  coinSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.light.border,
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  coinSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedCoinLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: spacing.md,
  },
  selectedCoinInfo: {
    justifyContent: 'center',
  },
  selectedCoinSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedCoinSymbol: {
    fontSize: 15,
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
    fontSize: 12,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: '#FFF2F2',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.light.error,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing['2xl'],
    minWidth: 220,
    borderRadius: 22,
  },
  loadingBox: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
});

function getDepositErrorMessage(code: string) {
  switch (code) {
    case 'auth_failed':
    case 'auth_required':
    case 'token_revoked':
    case 'token_invalid_iat':
      return 'Please sign in again before creating a deposit address.';
    case 'device_token_required':
    case 'device_token_invalid':
    case 'device_token_revoked':
    case 'device_token_mismatch':
      return 'This device session needs to be refreshed. Please sign out and sign in again.';
    case 'idempotency_key_required':
      return 'Deposit request could not be prepared securely. Please try again.';
    case 'validation_failed':
    case 'invalid_amount':
    case 'invalid_amount_precision':
      return 'Check the amount and selected network, then try again.';
    case 'minimum_deposit_amount':
      return 'This amount is below the minimum for the selected crypto. Increase the amount and try again.';
    case 'deposit_currency_unavailable':
      return 'This crypto/network is not available for deposit right now. Please choose another coin.';
    case 'deposit_provider_unavailable':
      return 'The deposit provider is busy right now. Please try again shortly.';
    case 'server_unavailable':
    case 'connection_failed':
      return 'Deposit service is temporarily unavailable. Please try again shortly.';
    default:
      return '';
  }
}
