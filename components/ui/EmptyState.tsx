import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { Button } from './Button';

interface EmptyStateProps {
  /** Ionicons icon name */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Fallback: raw emoji string (legacy support) */
  icon?: string;
  title: string;
  subtitle?: string;
  /** Optional gradient colors for the icon circle */
  iconGradient?: readonly [string, string, ...string[]];
  /** Icon color (when no gradient) */
  iconColor?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  iconName = 'receipt-outline',
  icon,
  title,
  subtitle,
  iconGradient,
  iconColor,
  action,
}) => {
  const renderIcon = () => {
    // If legacy emoji `icon` is passed AND no `iconName` override, show emoji
    // But we now default to Ionicons, so emoji is only used if explicitly passed without iconName
    if (icon && !iconName) {
      return <Text style={styles.legacyIcon}>{icon}</Text>;
    }

    const finalColor = iconColor || colors.light.primary;
    const finalGradient = iconGradient || ['#F0EDFF', '#E8E4FF'];

    return (
      <View style={styles.iconOuter}>
        {/* Outer subtle ring */}
        <View style={styles.iconRing}>
          <LinearGradient
            colors={finalGradient as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name={iconName} size={32} color={finalColor} />
          </LinearGradient>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderIcon()}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && (
        <View style={styles.actionWrapper}>
          <Button
            title={action.label}
            onPress={action.onPress}
            variant="outline"
            size="md"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
  },
  // --- Icon Styles ---
  iconOuter: {
    marginBottom: spacing.xl,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 3,
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
  },
  iconCircle: {
    flex: 1,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legacyIcon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  // --- Text ---
  title: {
    ...typography.h3,
    fontWeight: '700',
    color: colors.light.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  actionWrapper: {
    marginTop: spacing.sm,
  },
});
