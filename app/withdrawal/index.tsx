import React, { useState, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Clipboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, borderRadius } from '@/theme/spacing';
import { useWalletStore } from '@/stores/walletStore';
import { formatCurrency } from '@/utils/format';

export default function WithdrawalScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [walletAddress, setWalletAddress] = useState('');

  const { wallet, fetchWallet } = useWalletStore();

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const handleSetMax = () => {
    if (wallet) {
      setAmount(String(wallet.balance));
    }
  };

  const handlePasteAddress = async () => {
    const text = await Clipboard.getString();
    if (text) {
      setWalletAddress(text);
    }
  };

  const isInsufficient = wallet && amount ? Number(amount) > wallet.balance : false;

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
          {/* Amount Option */}
          <View style={styles.inputContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Amount</Text>
              <Text style={styles.balanceLabel}>
                Available: {formatCurrency(wallet?.balance || 0, wallet?.currency)}
              </Text>
            </View>
            <View style={styles.inputLineRow}>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={colors.light.textTertiary}
                value={amount}
                onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
              <Pressable onPress={handleSetMax} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>Max</Text>
              </Pressable>
            </View>
            {isInsufficient && (
              <Text style={styles.errorText}>
                Insufficient funds. Max: {formatCurrency(wallet?.balance || 0, wallet?.currency)}
              </Text>
            )}
          </View>

          {/* Currency Option */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Currency</Text>
            <View style={styles.inputLineRow}>
              <TextInput
                style={styles.textInput}
                placeholder="USDT"
                placeholderTextColor={colors.light.textTertiary}
                value={currency}
                onChangeText={(value) => setCurrency(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* Network Option */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Network</Text>
            <View style={styles.inputLineRow}>
              <TextInput
                style={styles.textInput}
                placeholder="TRC20"
                placeholderTextColor={colors.light.textTertiary}
                value={network}
                onChangeText={(value) => setNetwork(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* Wallet Address Option */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Wallet Address</Text>
            <View style={styles.inputLineRow}>
              <TextInput
                style={[styles.textInput, styles.addressInput]}
                placeholder="Paste external wallet address"
                placeholderTextColor={colors.light.textTertiary}
                value={walletAddress}
                onChangeText={setWalletAddress}
                autoCapitalize="none"
              />
              <Pressable onPress={handlePasteAddress} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>Paste</Text>
              </Pressable>
            </View>
          </View>

          <Button
            title="External Transfers Coming Soon"
            onPress={() => {}}
            disabled
            style={styles.button}
          />
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.light.textSecondary,
    letterSpacing: 0.2,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.light.textTertiary,
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
  addressInput: {
    fontSize: 14,
  },
  inlineButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 14,
    backgroundColor: '#F0EEFF',
  },
  inlineButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.light.primary,
  },
  errorText: {
    fontSize: 12,
    color: colors.light.error,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  button: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing['2xl'],
    minWidth: 220,
    borderRadius: 22,
  },
});
