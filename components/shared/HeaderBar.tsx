import React from 'react';
import {
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface HeaderBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  showBack = false,
  onBack,
  rightAction,
}) => {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  const topPadding = Math.max(insets.top, statusBarHeight);

  return (
    <View style={[styles.container, { paddingTop: topPadding + spacing.sm }]}>
      <View style={styles.content}>
        {/* Left slot */}
        <View style={styles.leftSlot}>
          {showBack && onBack && (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.light.textPrimary}
              />
            </Pressable>
          )}
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {/* Right slot */}
        <View style={styles.rightSlot}>{rightAction}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.light.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.border,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  leftSlot: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  title: {
    fontSize: typography.h3.fontSize ?? 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
    textAlign: 'center',
  },
  rightSlot: {
    width: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    backgroundColor: colors.light.border,
  },
});
