import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📭',
  title,
  subtitle,
  action,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
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
  icon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: '600',
    color: colors.light.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.bodySm.fontSize,
    color: colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  actionWrapper: {
    marginTop: spacing.sm,
  },
});
