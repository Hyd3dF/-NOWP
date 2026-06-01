import React from 'react';
import {
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  icon?: React.ReactNode;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  style?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType,
  icon,
  autoCapitalize = 'none',
  editable = true,
  multiline = false,
  maxLength,
  autoFocus = false,
  style,
}) => {
  const borderColor = error ? colors.light.error : colors.light.border;

  return (
    <View style={[styles.wrapper, style]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          { borderColor },
          !editable && styles.inputDisabled,
        ]}
      >
        {icon && <View style={styles.iconContainer}>{icon}</View>}

        <TextInput
          style={[
            styles.input,
            icon ? styles.inputWithIcon : undefined,
            multiline ? styles.inputMultiline : undefined,
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.light.textSecondary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          autoFocus={autoFocus}
          blurOnSubmit={false}
        />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.bodySm.fontSize,
    fontWeight: '500',
    color: colors.light.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0.1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.surface,
    minHeight: 48,
  },
  inputDisabled: {
    backgroundColor: colors.light.background,
    opacity: 0.7,
  },
  iconContainer: {
    paddingLeft: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: typography.body.fontSize,
    color: colors.light.textPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: typography.caption.fontSize,
    color: colors.light.error,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});
