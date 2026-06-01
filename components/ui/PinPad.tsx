import React, { useState, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface PinPadProps {
  onComplete: (pin: string) => void;
  title?: string;
  subtitle?: string;
  error?: string;
  length?: number;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'backspace'],
];

export const PinPad: React.FC<PinPadProps> = ({
  onComplete,
  title = 'Enter PIN',
  subtitle,
  error,
  length = 4,
}) => {
  const [pin, setPin] = useState('');

  const handleKeyPress = useCallback(
    (key: string) => {
      if (key === 'backspace') {
        setPin((prev) => prev.slice(0, -1));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => {},
        );
        return;
      }

      if (key === '') return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => {},
      );

      setPin((prev) => {
        const newPin = prev + key;
        if (newPin.length === length) {
          // Defer onComplete to next tick so state updates first
          setTimeout(() => {
            onComplete(newPin);
            setPin('');
          }, 100);
        }
        if (newPin.length > length) return prev;
        return newPin;
      });
    },
    [length, onComplete],
  );

  return (
    <View style={styles.container}>
      {/* Title & Subtitle */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {/* PIN Dots */}
      <View style={styles.dotsContainer}>
        {Array.from({ length }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < pin.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </View>

      {/* Error */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Number Pad */}
      <View style={styles.pad}>
        {KEYS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key) => (
              <Pressable
                key={key || 'empty'}
                onPress={() => handleKeyPress(key)}
                disabled={key === ''}
                style={({ pressed }) => [
                  styles.key,
                  key === '' && styles.keyEmpty,
                  pressed && key !== '' && styles.keyPressed,
                ]}
              >
                {key === 'backspace' ? (
                  <Text style={styles.backspaceText}>⌫</Text>
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  title: {
    fontSize: typography.h2.fontSize,
    fontWeight: '600',
    color: colors.light.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.bodySm.fontSize,
    color: colors.light.textSecondary,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.light.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.light.primary,
    borderColor: colors.light.primary,
  },
  dotError: {
    borderColor: colors.light.error,
    backgroundColor: 'transparent',
  },
  errorText: {
    fontSize: typography.bodySm.fontSize,
    color: colors.light.error,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  pad: {
    width: '100%',
    maxWidth: 300,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.sm,
    backgroundColor: colors.light.background,
  },
  keyEmpty: {
    backgroundColor: 'transparent',
  },
  keyPressed: {
    backgroundColor: colors.light.border,
  },
  keyText: {
    fontSize: 28,
    fontWeight: '500',
    color: colors.light.textPrimary,
  },
  backspaceText: {
    fontSize: 24,
    color: colors.light.textSecondary,
  },
});
