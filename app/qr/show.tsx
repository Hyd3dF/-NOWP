import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { usePaymentProfileStore } from '@/stores/paymentProfileStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function QRShowScreen() {
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="My QR Code" showBack onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={styles.description}>
          Show this QR code to another user to scan and send you money instantly.
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
                  size={220}
                  color={colors.light.primary}
                  backgroundColor="white"
                />
              </View>
              <Text style={styles.userName}>{profile.display_name || user?.displayName}</Text>
              <Text style={styles.userTag}>#{profile.payment_tag}</Text>
            </>
          )}
        </Card>

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
    marginVertical: spacing.xl,
    minHeight: 330,
    justifyContent: 'center',
  },
  loadingBox: {
    minHeight: 250,
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
  doneBtn: {
    marginTop: spacing.md,
  },
});
