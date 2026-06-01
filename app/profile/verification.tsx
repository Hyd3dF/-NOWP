import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function VerificationScreen() {
  const router = useRouter();
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Identity Verification" showBack onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Header */}
        <Card variant="gradient" style={styles.gradientCard}>
          <View style={styles.statusHeaderRow}>
            <View style={styles.shieldBg}>
              <Ionicons name="shield-checkmark" size={32} color={colors.light.primary} />
            </View>
            <View style={styles.statusHeaderTextWrapper}>
              <Text style={styles.statusTitle}>KYC Level 1: Verified</Text>
              <Text style={styles.statusSubtitle}>Daily limit: $5,000</Text>
            </View>
          </View>
        </Card>

        {/* Verification Levels */}
        <Text style={styles.sectionTitle}>Verification Levels</Text>
        
        {/* Tier 1 */}
        <Card variant="default" style={styles.tierCard}>
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
        </Card>

        {/* Tier 2 */}
        <Card variant="default" style={styles.tierCard}>
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
              <Button
                title="Verify Government ID"
                size="sm"
                onPress={handleStartVerification}
              />
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
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  gradientCard: {
    padding: spacing.xl,
    backgroundColor: colors.light.primary,
    marginTop: spacing.lg,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  shieldBg: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusHeaderTextWrapper: {
    flex: 1,
  },
  statusTitle: {
    ...typography.h3,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statusSubtitle: {
    ...typography.caption,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing['2xl'],
    marginBottom: spacing.md,
  },
  tierCard: {
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
    fontSize: 18,
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
    backgroundColor: colors.light.warningLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
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
    backgroundColor: colors.light.successLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  verifiedText: {
    ...typography.caption,
    color: colors.light.success,
    textAlign: 'center',
    fontWeight: '700',
  },
});
