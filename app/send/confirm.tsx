import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useSendStore } from '@/stores/sendStore';
import { useWalletStore } from '@/stores/walletStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { ApiError, createIdempotencyKey } from '@/services/api/client';
import { sendInternalTransfer } from '@/services/api/transfers';
import { startMoneySmsOtp, verifyMoneySmsOtp } from '@/services/api/smsOtp';
import {
  confirmFirebasePhoneOtp,
  isFirebasePhoneAuthAvailable,
  startFirebasePhoneOtp,
} from '@/services/firebasePhoneAuth';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PinPad } from '@/components/ui/PinPad';
import { formatCurrency } from '@/utils/format';
import * as Haptics from 'expo-haptics';

export default function SendConfirmScreen() {
  const router = useRouter();
  const { recipientId, recipientName, recipientUsername, recipientAvatar, amount, note, setLastTransaction, reset } = useSendStore();
  const { wallet, fetchWallet } = useWalletStore();
  const { fetchTransactions } = useTransactionStore();

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pinError, setPinError] = useState('');
  const [twoFactorVisible, setTwoFactorVisible] = useState(false);
  const [smsOtpCode, setSmsOtpCode] = useState('');
  const [smsOtpHint, setSmsOtpHint] = useState('');
  const [smsOtpProvider, setSmsOtpProvider] = useState<'firebase_auth' | 'server_sms'>('firebase_auth');
  const [pendingPin, setPendingPin] = useState('');
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState('');

  const numAmount = parseFloat(amount || '0');

  const handleConfirmPress = () => {
    setPinModalVisible(true);
  };

  const completeTransfer = async (
    pin: string,
    smsOtpTicket?: string,
    idempotencyKey?: string,
  ) => {
    const response = await sendInternalTransfer({
      receiverUserId: recipientId || '',
      amount: numAmount,
      currency: wallet?.currency || 'USD',
      note,
      pin,
      smsOtpTicket,
      idempotencyKey,
    });
    const transaction = response.transaction;

    await Promise.all([
      fetchWallet(),
      fetchTransactions(),
    ]);

    setLastTransaction(
      transaction.reference_id,
      transaction.created_at || new Date().toISOString(),
      amount,
      recipientName,
    );
    reset();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace('/send/receipt');
  };

  const handlePinComplete = async (pin: string) => {
    setPinError('');

    setPinModalVisible(false);
    setProcessing(true);
    const idempotencyKey = createIdempotencyKey('tr');

    try {
      if (!isFirebasePhoneAuthAvailable()) {
        throw { code: 'phone_verification_build_required' };
      }
      const started = await startMoneySmsOtp({
        purpose: 'transfer',
        receiverUserId: recipientId || '',
        amount: numAmount,
        currency: wallet?.currency || 'USD',
      });
      if (started.provider === 'firebase_auth') {
        await startFirebasePhoneOtp(started.phone || '');
        setSmsOtpProvider('firebase_auth');
      } else {
        setSmsOtpProvider('server_sms');
      }
      setPendingPin(pin);
      setPendingIdempotencyKey(idempotencyKey);
      setSmsOtpCode('');
      setSmsOtpHint('Enter the SMS code sent to your phone.');
      setTwoFactorVisible(true);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('Transfer not completed', getTransferErrorMessage(error));
    } finally {
      setProcessing(false);
    }
  };

  const handleTwoFactorSubmit = async () => {
    if (!/^\d{6}$/.test(smsOtpCode.trim())) {
      Alert.alert('Verification required', 'Enter the 6-digit SMS code before sending.');
      return;
    }

    setTwoFactorVisible(false);
    setProcessing(true);
    try {
      let firebaseIdToken = '';
      if (smsOtpProvider === 'firebase_auth') {
        const confirmed = await confirmFirebasePhoneOtp(smsOtpCode.trim());
        firebaseIdToken = confirmed.firebaseIdToken;
      }
      const verified = await verifyMoneySmsOtp({
        purpose: 'transfer',
        receiverUserId: recipientId || '',
        amount: numAmount,
        currency: wallet?.currency || 'USD',
        code: smsOtpProvider === 'server_sms' ? smsOtpCode.trim() : undefined,
        firebaseIdToken: firebaseIdToken || undefined,
      });
      await completeTransfer(pendingPin, verified.sms_otp_ticket, pendingIdempotencyKey);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('Transfer not completed', getTransferErrorMessage(error));
    } finally {
      setProcessing(false);
      setPendingPin('');
      setPendingIdempotencyKey('');
      setSmsOtpCode('');
    }
  };

  if (processing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.light.primary} />
          <Text style={styles.loadingTitle}>Processing Transfer</Text>
          <Text style={styles.loadingSubtitle}>Securing your funds and updating balance...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Confirm Transfer" showBack onBack={() => router.back()} />

      <View style={styles.content}>
        <View style={styles.topInfo}>
          <Avatar name={recipientName} uri={recipientAvatar} size={72} />
          <Text style={styles.name}>{recipientName}</Text>
          <Text style={styles.username}>@{recipientUsername}</Text>
        </View>

        {/* Transfer Details Card */}
        <Card variant="default" style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Send Amount</Text>
            <Text style={styles.detailValue}>{formatCurrency(numAmount)}</Text>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Transfer Fee</Text>
            <Text style={[styles.detailValue, { color: colors.light.success }]}>Free</Text>
          </View>
          <View style={styles.divider} />

          {note ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Note</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{note}</Text>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          <View style={[styles.detailRow, { paddingVertical: spacing.lg }]}>
            <Text style={styles.totalLabel}>Total Deducted</Text>
            <Text style={styles.totalValue}>{formatCurrency(numAmount)}</Text>
          </View>
        </Card>

        <View style={styles.bottomSection}>
          <Text style={styles.securityText}>
            <Ionicons name="shield-checkmark" size={14} color={colors.light.textTertiary} />{' '}
            Authorized with bank-grade encryption
          </Text>
          <Button
            title="Confirm & Send"
            onPress={handleConfirmPress}
            fullWidth
          />
        </View>
      </View>

      {/* PIN entry modal */}
      <Modal
        visible={pinModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPinModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <HeaderBar title="Authorize Transfer" showBack onBack={() => setPinModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm PIN</Text>
            <Text style={styles.modalSubtitle}>
              Please enter your 4-digit security PIN to authorize this {formatCurrency(numAmount)} transfer.
            </Text>
            <View style={styles.pinPadWrapper}>
              <PinPad
                onComplete={handlePinComplete}
                error={pinError}
                title=""
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={twoFactorVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTwoFactorVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <HeaderBar title="Verify Transfer" showBack onBack={() => setTwoFactorVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>SMS Verification</Text>
            <Text style={styles.modalSubtitle}>
              {smsOtpHint || `Enter the SMS code to authorize this ${formatCurrency(numAmount)} transfer.`}
            </Text>
            <TextInput
              value={smsOtpCode}
              onChangeText={(value) => setSmsOtpCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.twoFactorInput}
              textAlign="center"
            />
            <Button title="Verify SMS & Send" onPress={handleTwoFactorSubmit} fullWidth />
          </View>
        </SafeAreaView>
      </Modal>
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
  topInfo: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  name: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  username: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
  },
  detailsCard: {
    marginVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  detailLabel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  detailValue: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
    maxWidth: '70%',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
  totalLabel: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  totalValue: {
    ...typography.h3,
    color: colors.light.primary,
    fontWeight: '800',
  },
  bottomSection: {
    gap: spacing.md,
  },
  securityText: {
    ...typography.caption,
    color: colors.light.textTertiary,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  loadingTitle: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  loadingSubtitle: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  modalSubtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  pinPadWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  twoFactorInput: {
    ...typography.h2,
    color: colors.light.textPrimary,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.light.border,
    marginVertical: spacing['2xl'],
    paddingVertical: spacing.md,
    letterSpacing: 0,
  },
});

function getTransferErrorMessage(error: unknown) {
  const code = getPublicErrorCode(error);
  if (code) {
    const messages: Record<string, string> = {
      insufficient_balance: 'Your balance is not enough for this transfer.',
      invalid_pin: 'The security PIN is incorrect.',
      pin_not_configured: 'Please set your security PIN before sending money.',
      daily_send_amount_limit: 'Your daily send amount limit has been reached.',
      daily_send_count_limit: 'Your daily send count limit has been reached.',
      daily_receive_amount_limit: 'The receiver cannot receive this amount today.',
      daily_receive_count_limit: 'The receiver has reached today\'s receive limit.',
      receiver_not_found: 'The receiver account could not be found.',
      self_transfer_not_allowed: 'You cannot send money to yourself.',
      sms_phone_missing: 'Add a phone number before sending money.',
      sms_phone_invalid: 'Your phone number must include the country code before SMS verification can be used.',
      sms_provider_not_configured: 'SMS verification is not configured yet. Please contact support.',
      rate_limited: 'Too many verification attempts. Please wait a moment and try again.',
      phone_verification_build_required: 'Phone verification is not available in this test build. Please use an installed app build to continue.',
      firebase_auth_not_configured: 'Phone verification is not configured yet. Please contact support.',
      firebase_auth_native_module_missing: 'Phone verification is not available in this test build. Please use an installed app build to continue.',
      firebase_auth_quota_exceeded: 'SMS verification limit has been reached. Please try again later.',
      firebase_auth_too_many_requests: 'Too many SMS attempts. Please try again later.',
      firebase_auth_invalid_phone_number: 'Your phone number must include the country code before SMS verification can be used.',
      firebase_auth_phone_invalid: 'Your phone number must include the country code before SMS verification can be used.',
      firebase_auth_invalid_verification_code: 'The SMS code is incorrect. Please try again.',
      firebase_auth_code_format: 'Enter the 6-digit SMS code.',
      firebase_auth_session_expired: 'The SMS code expired. Request a new code and try again.',
      firebase_auth_token_expired: 'The SMS code expired. Request a new code and try again.',
      firebase_auth_phone_mismatch: 'The verified phone number does not match this account.',
      sms_otp_required: 'Complete SMS verification to send this transfer.',
      sms_otp_invalid: 'The SMS code is incorrect or expired. Request a new code and try again.',
      sms_otp_locked: 'Too many incorrect SMS codes. Request a new code and try again.',
      sms_otp_ticket_used: 'This SMS verification was already used. Request a new code and try again.',
      two_factor_required: 'Complete phone verification to send this transfer.',
      firebase_pnv_token_invalid: 'Phone verification failed.',
      firebase_pnv_token_expired: 'Phone verification expired. Please verify again.',
      firebase_phone_mismatch: 'The verified phone number does not match this account.',
      two_factor_ticket_invalid: 'The two-factor verification expired. Please try again.',
      idempotency_key_conflict: 'This transfer request conflicts with a previous attempt.',
      connection_failed: 'The backend is not reachable. Please make sure it is running.',
    };

    return messages[code] || 'We could not complete this transfer right now.';
  }

  return 'We could not complete this transfer right now.';
}

function getPublicErrorCode(error: unknown) {
  if (error instanceof ApiError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
}
