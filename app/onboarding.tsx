import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { Button } from '@/components/ui/Button';

const { width } = Dimensions.get('window');

interface Slide {
  id: number;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  iconColor: string;
  iconBg: string;
}

const SLIDES: Slide[] = [
  {
    id: 0,
    icon: 'wallet-outline',
    title: 'Easy Mobile Money',
    description: 'Keep your money secure, check your balance, and manage your wallet in one place.',
    iconColor: colors.light.primary,
    iconBg: '#F0EDFF',
  },
  {
    id: 1,
    icon: 'swap-horizontal-outline',
    title: 'Instant Transfers',
    description: 'Send and receive money instantly from contacts with zero transaction fees.',
    iconColor: colors.light.secondary,
    iconBg: '#E0FFFE',
  },
  {
    id: 2,
    icon: 'qr-code-outline',
    title: 'Scan to Pay',
    description: 'Use custom secure QR codes to pay and receive funds seamlessly in seconds.',
    iconColor: colors.light.success,
    iconBg: colors.light.successLight,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      router.push('/(auth)/signup');
    }
  };

  const slide = SLIDES[currentSlide];

  return (
    <SafeAreaView style={styles.container}>
      {/* Top skip action */}
      <View style={styles.header}>
        <View />
        {currentSlide < SLIDES.length - 1 ? (
          <Pressable onPress={() => setCurrentSlide(SLIDES.length - 1)}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Slide illustration */}
      <View style={styles.carouselContainer}>
        <View style={[styles.iconWrapper, { backgroundColor: slide.iconBg }]}>
          <Ionicons name={slide.icon} size={64} color={slide.iconColor} />
        </View>

        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>

      {/* Bottom controls */}
      <View style={styles.footer}>
        {/* Indicators */}
        <View style={styles.indicatorContainer}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.indicator,
                i === currentSlide && styles.indicatorActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {currentSlide === SLIDES.length - 1 ? (
            <View style={styles.buttonGroup}>
              <Button
                title="Get Started"
                onPress={() => router.push('/(auth)/signup')}
                fullWidth
                style={{ marginBottom: spacing.md }}
              />
              <Button
                title="Log In"
                variant="outline"
                onPress={() => router.push('/(auth)/login')}
                fullWidth
              />
            </View>
          ) : (
            <Button
              title="Next"
              onPress={handleNext}
              fullWidth
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  skipText: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '600',
  },
  carouselContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  iconWrapper: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['3xl'],
    ...shadows.card,
  },
  title: {
    ...typography.h1,
    color: colors.light.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    gap: spacing['2xl'],
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.light.border,
  },
  indicatorActive: {
    width: 24,
    backgroundColor: colors.light.primary,
  },
  actions: {
    width: '100%',
  },
  buttonGroup: {
    width: '100%',
  },
});
