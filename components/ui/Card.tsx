import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { borderRadius, shadows } from '../../theme/spacing';

type CardVariant = 'default' | 'elevated' | 'gradient';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: CardVariant;
  gradientColors?: readonly [string, string, ...string[]];
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  gradientColors,
}) => {
  if (variant === 'gradient') {
    const finalColors = gradientColors || [
      colors.light.cardGradientStart,
      '#8B5CF6',
      colors.light.cardGradientEnd,
    ] as const;

    return (
      <LinearGradient
        colors={finalColors as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, styles.gradient, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.base, variantStyles[variant], style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.lg,
    padding: 16,
    overflow: 'hidden',
  },
  gradient: {
    // Gradient-specific base styles handled by LinearGradient
  },
});

const variantStyles = StyleSheet.create({
  default: {
    backgroundColor: colors.light.surface,
    shadowColor: shadows.card.shadowColor,
    shadowOffset: shadows.card.shadowOffset,
    shadowOpacity: shadows.card.shadowOpacity,
    shadowRadius: shadows.card.shadowRadius,
    elevation: shadows.card.elevation,
  },
  elevated: {
    backgroundColor: colors.light.surface,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
});
