import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { borderRadius, shadows } from '../../theme/spacing';

type CardVariant = 'default' | 'elevated' | 'gradient';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: CardVariant;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
}) => {
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
  gradient: {
    backgroundColor: colors.light.primary,
  },
});
