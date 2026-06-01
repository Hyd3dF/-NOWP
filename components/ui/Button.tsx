import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import * as Haptics from 'expo-haptics';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  {
    container: ViewStyle;
    textColor: string;
    loaderColor: string;
  }
> = {
  primary: {
    container: {
      backgroundColor: colors.light.primary,
    },
    textColor: '#FFFFFF',
    loaderColor: '#FFFFFF',
  },
  secondary: {
    container: {
      backgroundColor: colors.light.secondary,
    },
    textColor: '#FFFFFF',
    loaderColor: '#FFFFFF',
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.light.primary,
    },
    textColor: colors.light.primary,
    loaderColor: colors.light.primary,
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
    },
    textColor: colors.light.primary,
    loaderColor: colors.light.primary,
  },
};

const SIZE_STYLES: Record<
  ButtonSize,
  {
    paddingVertical: number;
    paddingHorizontal: number;
    fontSize: number;
    lineHeight: number;
    iconGap: number;
  }
> = {
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    fontSize: typography.bodySm.fontSize ?? 14,
    lineHeight: typography.bodySm.lineHeight ?? 20,
    iconGap: spacing.xs,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    fontSize: typography.body.fontSize ?? 16,
    lineHeight: typography.body.lineHeight ?? 24,
    iconGap: spacing.sm,
  },
  lg: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    fontSize: typography.body.fontSize ?? 16,
    lineHeight: typography.body.lineHeight ?? 24,
    iconGap: spacing.sm,
  },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }, [onPress]);

  const isDisabled = disabled || loading;

  return (
    <Animated.View
      style={[
        { transform: [{ scale: scaleAnim }] },
        fullWidth && styles.fullWidth,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.container,
          variantStyle.container,
          {
            paddingVertical: sizeStyle.paddingVertical,
            paddingHorizontal: sizeStyle.paddingHorizontal,
          },
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variantStyle.loaderColor}
          />
        ) : (
          <View style={styles.content}>
            {icon && (
              <View style={{ marginRight: sizeStyle.iconGap }}>{icon}</View>
            )}
            <Text
              style={[
                styles.text,
                {
                  color: variantStyle.textColor,
                  fontSize: sizeStyle.fontSize,
                  lineHeight: sizeStyle.lineHeight,
                },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
