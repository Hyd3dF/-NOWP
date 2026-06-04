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
import { sendInternalTransfer, startTransferTwoFactorChallenge } from '@/services/api/transfers';
import { requestFirebasePhoneVerification } from '@/services/firebasePnv';
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
  const [firebasePnvToken, setFirebasePnvToken] = useState('');
  const [twoFactorTicket, setTwoFactorTicket] = useState('');
  const [pendingPin, setPendingPin] = useState('');
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState('');

  const numAmount = parseFloat(amount || '0');

  const handleConfirmPress = () => {
    setPinModalVisible(true);
  };

  const completeTransfer = async (
    pin: string,
    ticket?: string,
    phoneVerificationToken?: string,
    idempotencyKey?: string,
  ) => {
    const response = await sendInternalTransfer({
      receiverUserId: recipientId || '',
      amount: numAmount,
      currency: wallet?.currency || 'USD',
      note,
      pin,
      twoFactorTicket: ticket,
      firebasePnvToken: phoneVerificationToken,
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
      const challenge = await startTransferTwoFactorChallenge({
        receiverUserId: recipientId || '',
        amount: numAmount,
        currency: wallet?.currency || 'USD',
      });
      if (challenge.two_factor_required) {
        setPendingPin(pin);
        setPendingIdempotencyKey(idempotencyKey);
        setTwoFactorTicket(challenge.ticket || '');
        setFirebasePnvToken('');
        setTwoFactorVisible(true);
        return;
      }

      await completeTransfer(pin, undefined, undefined, idempotencyKey);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('Transfer not completed', getTransferErrorMessage(error));
    } finally {
      setProcessing(false);
    }
  };

  const handleTwoFactorSubmit = async () => {
    if (firebasePnvToken.trim().length < 40) {
      Alert.alert('Verification required', 'Complete Firebase phone verification before sending.');
      return;
    }

    setTwoFactorVisible(false);
    setProcessing(true);
    try {
      await completeTransfer(
        pendingPin,
        twoFactorTicket,
        firebasePnvToken.trim(),
        pendingIdempotencyKey,
      );
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('Transfer not completed', getTransferErrorMessage(error));
    } finally {
      setProcessing(false);
      setPendingPin('');
      setPendingIdempotencyKey('');
      setTwoFactorTicket('');
      setFirebasePnvToken('');
    }
  };

  const handleFirebasePhoneVerification = async () => {
    setProcessing(true);
    try {
      const result = await requestFirebasePhoneVerification();
      setFirebasePnvToken(result.token);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const message =
        code === 'firebase_pnv_native_module_missing'
          ? 'Use an Android development build with Firebase PNV enabled. Expo Go cannot run this verification.'
          : code === 'firebase_pnv_privacy_policy_missing'
            ? 'Firebase phone verification requires a configured HTTPS privacy policy URL.'
            : code === 'firebase_pnv_android_only'
              ? 'Firebase phone verification is only available on Android.'
              : 'Firebase phone verification is not available on this device right now.';
      Alert.alert(
        'Firebase verification unavailable',
        message,
      );
    } finally {
      setProcessing(false);
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
            <Text style={styles.modalTitle}>Phone Verification</Text>
            <Text style={styles.modalSubtitle}>
              Complete Firebase phone verification to authorize this {formatCurrency(numAmount)} transfer.
            </Text>
            <TextInput
              value={firebasePnvToken}
              onChangeText={setFirebasePnvToken}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.twoFactorInput}
              textAlign="center"
            />
            <Button title="Start Firebase Verification" onPress={handleFirebasePhoneVerification} fullWidth />
            <Button title="Verify Phone & Send" onPress={handleTwoFactorSubmit} fullWidth />
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
  if (error instanceof ApiError) {
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
      two_factor_required: 'Complete phone verification to send this transfer.',
      firebase_pnv_token_invalid: 'Firebase phone verification failed.',
      firebase_pnv_token_expired: 'Firebase phone verification expired. Please verify again.',
      firebase_phone_mismatch: 'The verified phone number does not match this account.',
      two_factor_ticket_invalid: 'The two-factor verification expired. Please try again.',
      idempotency_key_conflict: 'This transfer request conflicts with a previous attempt.',
      connection_failed: 'The backend is not reachable. Please make sure it is running.',
    };

    return messages[error.code] || 'We could not complete this transfer right now.';
  }

  return 'We could not complete this transfer right now.';
}
