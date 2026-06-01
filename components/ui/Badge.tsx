import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TransactionStatus } from '../../types/transaction';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { borderRadius, spacing } from '../../theme/spacing';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  status: TransactionStatus;
  size?: BadgeSize;
}

interface StatusConfig {
  label: string;
  backgroundColor: string;
  textColor: string;
}

const STATUS_MAP: Record<TransactionStatus, StatusConfig> = {
  completed: {
    label: 'Completed',
    backgroundColor: colors.light.success,
    textColor: '#FFFFFF',
  },
  pending: {
    label: 'Pending',
    backgroundColor: colors.light.warning,
    textColor: '#1A1A2E',
  },
  failed: {
    label: 'Failed',
    backgroundColor: colors.light.error,
    textColor: '#FFFFFF',
  },
  cancelled: {
    label: 'Cancelled',
    backgroundColor: colors.light.textSecondary,
    textColor: '#FFFFFF',
  },
};

export const Badge: React.FC<BadgeProps> = ({ status, size = 'md' }) => {
  const config = STATUS_MAP[status];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: config.backgroundColor },
        size === 'sm' ? styles.containerSm : styles.containerMd,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: config.textColor },
          size === 'sm' ? styles.textSm : styles.textMd,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  containerSm: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  containerMd: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 10,
    lineHeight: 14,
  },
  textMd: {
    fontSize: typography.caption.fontSize,
    lineHeight: 18,
  },
});
