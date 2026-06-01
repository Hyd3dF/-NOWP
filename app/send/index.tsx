import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useFriendStore } from '@/stores/friendStore';
import { useSendStore } from '@/stores/sendStore';
import { useWalletStore } from '@/stores/walletStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { isValidAmount } from '@/utils/validation';
import { formatCurrency } from '@/utils/format';

export default function SendIndexScreen() {
  const router = useRouter();
  const { friends, searchQuery, setSearchQuery, getFilteredFriends, getRecentRecipients } = useFriendStore();
  const { recipientId, recipientName, recipientUsername, recipientAvatar, amount, note, setRecipient, setAmount, setNote, reset } = useSendStore();
  const wallet = useWalletStore((s) => s.wallet);

  const [inputAmount, setInputAmount] = useState(amount);
  const [inputNote, setInputNote] = useState(note);
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    // Reset state when opening the screen fresh, unless we came back
    if (!recipientId) {
      reset();
    }
  }, []);

  const filteredFriends = getFilteredFriends();
  const recentRecipients = getRecentRecipients();

  const handleSelectRecipient = (friend: any) => {
    setRecipient(
      friend.user.id,
      friend.user.displayName,
      friend.user.username,
      friend.user.avatarUrl
    );
  };

  const handleContinue = () => {
    setAmountError('');
    
    if (!isValidAmount(inputAmount)) {
      setAmountError('Please enter a valid amount');
      return;
    }

    const numAmount = parseFloat(inputAmount);
    if (wallet && numAmount > wallet.balance) {
      setAmountError(`Insufficient balance. You have ${formatCurrency(wallet.balance)}`);
      return;
    }

    setAmount(inputAmount);
    setNote(inputNote);
    router.push('/send/confirm');
  };

  if (!recipientId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar title="Send Money" showBack onBack={() => router.back()} />
        <View style={styles.content}>
          <View style={styles.searchContainer}>
            <Input
              placeholder="Search by name or @username..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              icon={<Ionicons name="search-outline" size={20} color={colors.light.textTertiary} />}
            />
          </View>

          {recentRecipients.length > 0 && !searchQuery && (
            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>Recent Recipients</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={recentRecipients}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.recentList}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.recentItem}
                    onPress={() => handleSelectRecipient(item)}
                  >
                    <Avatar name={item.user.displayName} uri={item.user.avatarUrl} size={50} />
                    <Text style={styles.recentName} numberOfLines={1}>
                      {item.user.displayName.split(' ')[0]}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          <Text style={styles.sectionTitle}>All Friends</Text>
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.friendsList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.friendRow}
                onPress={() => handleSelectRecipient(item)}
              >
                <View style={styles.friendLeft}>
                  <Avatar name={item.user.displayName} uri={item.user.avatarUrl} size={44} />
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{item.user.displayName}</Text>
                    <Text style={styles.friendUsername}>@{item.user.username}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No friends found</Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  // Amount Input Screen
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar
        title={`Send to @${recipientUsername}`}
        showBack
        onBack={() => reset()}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.amountContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Recipient Details */}
          <View style={styles.recipientHeader}>
            <Avatar name={recipientName} uri={recipientAvatar} size={64} />
            <Text style={styles.recipientTitleName}>{recipientName}</Text>
            <Text style={styles.recipientTitleUser}>@{recipientUsername}</Text>
          </View>

          {/* Amount Display & Input */}
          <View style={styles.amountInputSection}>
            <Text style={styles.amountLabel}>Enter Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>$</Text>
              <Input
                placeholder="0.00"
                value={inputAmount}
                onChangeText={(val) => {
                  // Only allow digits and one decimal point
                  const clean = val.replace(/[^0-9.]/g, '');
                  setInputAmount(clean);
                }}
                keyboardType="decimal-pad"
                style={styles.hugeInput}
                error={amountError}
              />
            </View>
            <Text style={styles.balanceInfo}>
              Available Balance: {formatCurrency(wallet?.balance || 0, wallet?.currency)}
            </Text>
          </View>

          {/* Note Input */}
          <View style={styles.noteSection}>
            <Input
              label="Add a note / reference (optional)"
              placeholder="e.g. Lunch 🍕"
              value={inputNote}
              onChangeText={setInputNote}
              maxLength={60}
            />
          </View>

          <Button
            title="Continue"
            onPress={handleContinue}
            fullWidth
            style={styles.continueBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  keyboardView: {
    flex: 1,
  },
  searchContainer: {
    marginVertical: spacing.sm,
  },
  recentSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  recentList: {
    gap: spacing.md,
  },
  recentItem: {
    alignItems: 'center',
    width: 68,
  },
  recentName: {
    ...typography.caption,
    color: colors.light.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  friendsList: {
    paddingBottom: spacing.xl,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.light.borderLight,
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  friendInfo: {
    justifyContent: 'center',
  },
  friendName: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  friendUsername: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
  },
  amountContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  recipientHeader: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  recipientTitleName: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  recipientTitleUser: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  amountInputSection: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  amountLabel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.light.textPrimary,
    marginRight: spacing.xs,
  },
  hugeInput: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.light.textPrimary,
    width: 200,
    textAlign: 'center',
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  balanceInfo: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: spacing.md,
  },
  noteSection: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  continueBtn: {
    marginTop: spacing.md,
  },
});
