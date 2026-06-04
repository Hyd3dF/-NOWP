import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { Button } from '@/components/ui/Button';

export default function VerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [level2Status, setLevel2Status] = useState<'none' | 'pending' | 'verified'>('none');

  const handleStartVerification = () => {
    setLevel2Status('pending');
    setTimeout(() => {
      Alert.alert(
        'Verification Submitted',
        'Your verification request has been saved for review.',
        [
          {
            text: 'OK',
            onPress: () => {
              setLevel2Status('verified');
            },
          },
        ]
      );
    }, 1000);
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Identity Verification</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Header */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeaderRow}>
            <View style={styles.shieldBg}>
              <Ionicons name="shield-checkmark-outline" size={26} color={colors.light.success} />
            </View>
            <View style={styles.statusHeaderTextWrapper}>
              <Text style={styles.statusTitle}>KYC Level 1: Verified</Text>
              <Text style={styles.statusSubtitle}>Daily limit: $5,000</Text>
            </View>
          </View>
        </View>

        {/* Verification Levels */}
        <Text style={styles.sectionLabel}>Verification Levels</Text>

        {/* Tier 1 */}
        <View style={styles.card}>
          <View style={styles.tierRow}>
            <View style={styles.tierLeft}>
              <View style={[styles.tierNum, { backgroundColor: colors.light.successLight }]}>
                <Text style={[styles.tierNumText, { color: colors.light.success }]}>1</Text>
              </View>
              <View>
                <Text style={styles.tierTitle}>Basic Information</Text>
                <Text style={styles.tierSubtitle}>Email & phone verification</Text>
              </View>
            </View>
            <Ionicons name="checkmark-circle" size={24} color={colors.light.success} />
          </View>
        </View>

        {/* Tier 2 */}
        <View style={styles.card}>
          <View style={styles.tierRow}>
            <View style={styles.tierLeft}>
              <View
                style={[
                  styles.tierNum,
                  {
                    backgroundColor:
                      level2Status === 'verified'
                        ? colors.light.successLight
                        : level2Status === 'pending'
                        ? colors.light.warningLight
                        : colors.light.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tierNumText,
                    {
                      color:
                        level2Status === 'verified'
                          ? colors.light.success
                          : level2Status === 'pending'
                          ? colors.light.warning
                          : colors.light.textTertiary,
                    },
                  ]}
                >
                  2
                </Text>
              </View>
              <View>
                <Text style={styles.tierTitle}>Document Verification</Text>
                <Text style={styles.tierSubtitle}>Government ID photo & selfie scan</Text>
              </View>
            </View>
            {level2Status === 'verified' ? (
              <Ionicons name="checkmark-circle" size={24} color={colors.light.success} />
            ) : level2Status === 'pending' ? (
              <Ionicons name="time" size={24} color={colors.light.warning} />
            ) : (
              <Ionicons name="ellipse-outline" size={24} color={colors.light.textTertiary} />
            )}
          </View>

          {level2Status === 'none' && (
            <View style={styles.tierAction}>
              <Text style={styles.tierUnlockText}>
                Submit identity documents to request higher account limits.
              </Text>
              <Button title="Verify Government ID" size="sm" onPress={handleStartVerification} />
            </View>
          )}
          {level2Status === 'pending' && (
            <View style={styles.pendingAction}>
              <Text style={styles.pendingText}>Your verification request is under review.</Text>
            </View>
          )}
          {level2Status === 'verified' && (
            <View style={styles.verifiedAction}>
              <Text style={styles.verifiedText}>Tier 2 verification completed.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  // ─── Header ───
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },

  // ─── Status Card ───
  statusCard: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 12,
    padding: spacing.lg,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  shieldBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.light.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusHeaderTextWrapper: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  statusSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },

  // ─── Sections ───
  sectionLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },

  // ─── Tier Card ───
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tierNum: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierNumText: {
    fontSize: 16,
    fontWeight: '700',
  },
  tierTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  tierSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  tierAction: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.borderLight,
    gap: spacing.md,
  },
  tierUnlockText: {
    ...typography.caption,
    color: colors.light.textSecondary,
    lineHeight: 16,
  },
  pendingAction: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.borderLight,
  },
  pendingText: {
    ...typography.caption,
    color: colors.light.warning,
    textAlign: 'center',
    fontWeight: '600',
  },
  verifiedAction: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.borderLight,
  },
  verifiedText: {
    ...typography.caption,
    color: colors.light.success,
    textAlign: 'center',
    fontWeight: '700',
  },
});
