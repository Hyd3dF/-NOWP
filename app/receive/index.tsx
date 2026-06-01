import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { usePaymentProfileStore } from '@/stores/paymentProfileStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function ReceiveIndexScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { profile, isLoading, fetchPaymentProfile } = usePaymentProfileStore();

  useEffect(() => {
    fetchPaymentProfile();
  }, [fetchPaymentProfile]);

  const qrPayload = useMemo(() => {
    if (profile?.qr_payload) return profile.qr_payload;
    return JSON.stringify({
      type: 'oroya-payment-profile',
      version: 1,
      payment_tag: profile?.payment_tag || '',
      display_name: user?.displayName || '',
    });
  }, [profile, user?.displayName]);

  const paymentTag = profile?.payment_tag || '';

  const handleCopyPaymentId = () => {
    if (!paymentTag) return;
    Clipboard.setString(paymentTag);
    alert('Payment ID copied.');
  };

  const handleShare = async () => {
    if (!paymentTag) return;

    try {
      await Share.share({
        message: `Send me money on Oroya. My payment ID is ${paymentTag}.`,
      });
    } catch {
      alert('Sharing failed. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Receive Money" showBack onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={styles.description}>
          Share your Oroya payment ID or QR code to receive money instantly.
        </Text>

        <Card variant="default" style={styles.qrCard}>
          {isLoading || !profile ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.light.primary} />
            </View>
          ) : (
            <>
              <View style={styles.qrWrapper}>
                <QRCode
                  value={qrPayload}
                  size={200}
                  color={colors.light.primary}
                  backgroundColor="white"
                />
              </View>
              <Text style={styles.userName}>{profile.display_name || user?.displayName}</Text>
              <Text style={styles.userTag}>#{paymentTag}</Text>
            </>
          )}
        </Card>

        <View style={styles.actionsCard}>
          <Pressable
            style={[styles.actionRow, !paymentTag && styles.actionDisabled]}
            onPress={handleCopyPaymentId}
            disabled={!paymentTag}
          >
            <View style={styles.actionLeft}>
              <View style={styles.iconBg}>
                <Ionicons name="copy-outline" size={20} color={colors.light.primary} />
              </View>
              <View>
                <Text style={styles.actionTitle}>Copy Payment ID</Text>
                <Text style={styles.actionSubtitle}>{paymentTag || 'Loading payment ID'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={[styles.actionRow, !paymentTag && styles.actionDisabled]}
            onPress={handleShare}
            disabled={!paymentTag}
          >
            <View style={styles.actionLeft}>
              <View style={styles.iconBg}>
                <Ionicons name="share-social-outline" size={20} color={colors.light.primary} />
              </View>
              <View>
                <Text style={styles.actionTitle}>Share Payment ID</Text>
                <Text style={styles.actionSubtitle}>Share via other apps</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>
        </View>

        <Button
          title="Done"
          onPress={() => router.back()}
          fullWidth
          style={styles.doneBtn}
        />
      </View>
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
    alignItems: 'center',
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  description: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  qrCard: {
    width: '100%',
    padding: spacing.xl,
    alignItems: 'center',
    marginVertical: spacing.lg,
    minHeight: 310,
    justifyContent: 'center',
  },
  loadingBox: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    ...shadows.card,
    marginBottom: spacing.lg,
  },
  userName: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  userTag: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  actionsCard: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    width: '100%',
    ...shadows.card,
    marginVertical: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
  doneBtn: {
    marginTop: spacing.md,
  },
});
