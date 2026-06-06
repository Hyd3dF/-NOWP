import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { startMoneySmsOtp, verifyMoneySmsOtp } from '@/services/api/smsOtp';
import {
  confirmFirebasePhoneOtp,
  isFirebasePhoneAuthAvailable,
  startFirebasePhoneOtp,
} from '@/services/firebasePhoneAuth';
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
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [otpProvider, setOtpProvider] = useState<'firebase_auth' | 'server_sms'>('firebase_auth');

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

  const getDepositRequest = () => ({
    amount: Number(amount),
    currency: 'usd',
    network: (selectedCoinObj.code || selectedCoinObj.id).toLowerCase(),
  });

  const submitDeposit = async (smsOtpTicket: string) => {
    const request = getDepositRequest();
    const idempotencyKey = createIdempotencyKey('dep');
    const response = await api.post<DepositResponse>('/payments/create-deposit', {
      ...request,
      sms_otp_ticket: smsOtpTicket,
      idempotency_key: idempotencyKey,
    }, {
      'X-Idempotency-Key': idempotencyKey,
    });
    setPayment(response.payment);
    router.push('/deposit/result');
  };

  const createDeposit = async () => {
    setError('');
    setPayment(null);

    if (!isValidAmount(amount)) {
      setError('Enter an amount greater than zero to create a deposit address.');
      return;
    }

    if (!isFirebasePhoneAuthAvailable()) {
      setError(getDepositErrorMessage('phone_verification_build_required'));
      return;
    }

    setIsLoading(true);
    try {
      const started = await startMoneySmsOtp({
        purpose: 'deposit',
        ...getDepositRequest(),
      });
      if (started.provider === 'firebase_auth') {
        await startFirebasePhoneOtp(started.phone || '');
        setOtpProvider('firebase_auth');
      } else {
        setOtpProvider('server_sms');
      }
      setOtpHint('Enter the SMS code sent to your phone.');
      setOtpCode('');
      setOtpVisible(true);
    } catch (error) {
      const message = getDepositErrorMessage(getPublicErrorCode(error));
      const requestId = error instanceof ApiError && error.requestId ? ` Ref: ${error.requestId}` : '';
      setError(
        `${message || 'Deposit address could not be created right now. Please try again in a moment.'}${requestId}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtpAndCreateDeposit = async () => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError('Enter the 6-digit SMS verification code.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      let firebaseIdToken = '';
      if (otpProvider === 'firebase_auth') {
        const confirmed = await confirmFirebasePhoneOtp(otpCode.trim());
        firebaseIdToken = confirmed.firebaseIdToken;
      }
      const verified = await verifyMoneySmsOtp({
        purpose: 'deposit',
        ...getDepositRequest(),
        code: otpProvider === 'server_sms' ? otpCode.trim() : undefined,
        firebaseIdToken: firebaseIdToken || undefined,
      });
      setOtpVisible(false);
      await submitDeposit(verified.sms_otp_ticket);
    } catch (error) {
      const message = getDepositErrorMessage(getPublicErrorCode(error));
      const requestId = error instanceof ApiError && error.requestId ? ` Ref: ${error.requestId}` : '';
      setError(`${message || 'SMS verification failed. Please try again.'}${requestId}`);
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

      <Modal
        visible={otpVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setOtpVisible(false)}
      >
        <View style={styles.container}>
          <HeaderBar title="Verify Deposit" showBack onBack={() => setOtpVisible(false)} />
          <View style={styles.otpContent}>
            <Text style={styles.otpTitle}>SMS Verification</Text>
            <Text style={styles.otpSubtitle}>{otpHint}</Text>
            <TextInput
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.otpInput}
              textAlign="center"
            />
            <Button
              title="Verify & Create Address"
              onPress={verifyOtpAndCreateDeposit}
              loading={isLoading}
              fullWidth
            />
          </View>
        </View>
      </Modal>
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
  otpContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    gap: spacing.lg,
  },
  otpTitle: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
  },
  otpSubtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  otpInput: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.light.border,
    color: colors.light.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    paddingVertical: spacing.md,
  },
});

function getPublicErrorCode(error: unknown) {
  if (error instanceof ApiError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
}

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
    case 'sms_phone_missing':
      return 'Add a phone number before creating a deposit address.';
    case 'sms_phone_invalid':
      return 'Your phone number must include the country code before SMS verification can be used.';
    case 'sms_provider_not_configured':
      return 'SMS verification is not configured yet. Please contact support.';
    case 'rate_limited':
      return 'Too many verification attempts. Please wait a moment and try again.';
    case 'phone_verification_build_required':
      return 'Phone verification is not available in this app build. Please install the latest app build.';
    case 'firebase_auth_not_configured':
      return 'Phone verification is not configured yet. Please contact support.';
    case 'firebase_auth_native_module_missing':
      return 'Phone verification is not available in this app build. Please install the latest app build.';
    case 'firebase_auth_quota_exceeded':
    case 'firebase_auth_too_many_requests':
      return 'SMS verification limit has been reached. Please try again later.';
    case 'firebase_auth_invalid_phone_number':
    case 'firebase_auth_phone_invalid':
      return 'Your phone number must include the country code before SMS verification can be used.';
    case 'firebase_auth_invalid_verification_code':
    case 'firebase_auth_code_format':
      return 'The SMS code is incorrect. Please try again.';
    case 'firebase_auth_session_expired':
    case 'firebase_auth_token_expired':
      return 'The SMS code expired. Request a new code and try again.';
    case 'firebase_auth_phone_mismatch':
      return 'The verified phone number does not match your account.';
    case 'sms_otp_required':
    case 'sms_otp_invalid':
    case 'sms_otp_locked':
    case 'sms_otp_ticket_used':
      return 'SMS verification failed. Request a new code and try again.';
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
