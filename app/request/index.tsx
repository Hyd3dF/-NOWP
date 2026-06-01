import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useFriendStore } from '@/stores/friendStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { isValidAmount } from '@/utils/validation';

export default function RequestIndexScreen() {
  const router = useRouter();
  const { friends, searchQuery, setSearchQuery, getFilteredFriends } = useFriendStore();

  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  const [inputAmount, setInputAmount] = useState('');
  const [inputNote, setInputNote] = useState('');
  const [amountError, setAmountError] = useState('');

  const filteredFriends = getFilteredFriends();

  const handleSelectRecipient = (friend: any) => {
    setSelectedRecipient(friend.user);
  };

  const handleSendRequest = () => {
    setAmountError('');

    if (!isValidAmount(inputAmount)) {
      setAmountError('Please enter a valid amount');
      return;
    }

    Alert.alert(
      'Request Sent',
      `Your request for $${parseFloat(inputAmount).toFixed(2)} has been sent to ${selectedRecipient.displayName}.`,
      [
        {
          text: 'Done',
          onPress: () => {
            router.back();
          },
        },
      ]
    );
  };

  const handleReset = () => {
    setSelectedRecipient(null);
    setInputAmount('');
    setInputNote('');
    setAmountError('');
  };

  if (!selectedRecipient) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HeaderBar title="Request Money" showBack onBack={() => router.back()} />
        <View style={styles.content}>
          <View style={styles.searchContainer}>
            <Input
              placeholder="Select contact to request money..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              icon={<Ionicons name="search-outline" size={20} color={colors.light.textTertiary} />}
            />
          </View>

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

  // Amount input
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar
        title={`Request from @${selectedRecipient.username}`}
        showBack
        onBack={handleReset}
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
            <Avatar name={selectedRecipient.displayName} uri={selectedRecipient.avatarUrl} size={64} />
            <Text style={styles.recipientTitleName}>{selectedRecipient.displayName}</Text>
            <Text style={styles.recipientTitleUser}>@{selectedRecipient.username}</Text>
          </View>

          {/* Amount Display & Input */}
          <View style={styles.amountInputSection}>
            <Text style={styles.amountLabel}>Request Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>$</Text>
              <Input
                placeholder="0.00"
                value={inputAmount}
                onChangeText={(val) => {
                  const clean = val.replace(/[^0-9.]/g, '');
                  setInputAmount(clean);
                }}
                keyboardType="decimal-pad"
                style={styles.hugeInput}
                error={amountError}
              />
            </View>
          </View>

          {/* Note Input */}
          <View style={styles.noteSection}>
            <Input
              label="Add a note (what is this request for?)"
              placeholder="e.g. dinner split 🥗"
              value={inputNote}
              onChangeText={setInputNote}
              maxLength={60}
            />
          </View>

          <Button
            title={`Request $${inputAmount ? parseFloat(inputAmount).toFixed(2) : '0.00'}`}
            onPress={handleSendRequest}
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
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
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
  noteSection: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  continueBtn: {
    marginTop: spacing.md,
  },
});
