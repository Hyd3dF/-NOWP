import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { isValidPhone, isValidUsername } from '@/utils/validation';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatarUrl || null);
  const [avatarBase64, setAvatarBase64] = useState('');
  const [avatarMime, setAvatarMime] = useState('');
  const [avatarName, setAvatarName] = useState('');

  const [nameError, setNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [securityPin, setSecurityPin] = useState('');
  const [pinError, setPinError] = useState('');

  const handlePickAvatar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo Access Needed', 'Allow photo access to update your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAvatarUri(asset.uri);
        setAvatarBase64(asset.base64 || '');
        setAvatarMime(asset.mimeType || 'image/jpeg');
        setAvatarName(asset.fileName || 'profile-photo.jpg');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      Alert.alert('Could Not Open Photos', 'Please try again or choose a different photo.');
    }
  };

  const isSensitiveProfileChange = () => {
    const currentPhone = String(user?.phone || '').replace(/[^\d+]/g, '');
    const nextPhone = phone.trim().replace(/[^\d+]/g, '');
    const currentUsername = String(user?.username || '').trim().toLowerCase();
    const nextUsername = username.trim().toLowerCase();
    return Boolean(
      (nextPhone && nextPhone !== currentPhone) ||
        (nextUsername && nextUsername !== currentUsername),
    );
  };

  const validateForm = () => {
    setNameError('');
    setUsernameError('');
    setPhoneError('');

    let valid = true;
    if (!displayName.trim()) {
      setNameError('Enter your full name.');
      valid = false;
    }
    if (!isValidUsername(username)) {
      setUsernameError('Use 3-20 letters, numbers, or underscores.');
      valid = false;
    }
    if (!isValidPhone(phone)) {
      setPhoneError('Enter a valid phone number.');
      valid = false;
    }

    if (!valid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    return valid;
  };

  const submitProfile = async (pin?: string) => {
    setSaving(true);

    try {
      await updateProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        phone: phone.trim(),
        avatarUrl: avatarUri,
        profilePhotoBase64: avatarBase64 || undefined,
        profilePhotoMime: avatarMime || undefined,
        profilePhotoName: avatarName || undefined,
        pin,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPinModalVisible(false);
      setSecurityPin('');
      setPinError('');
      Alert.alert(
        'Profile Updated',
        'Your profile changes have been saved successfully.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'profile_step_up_required' || code === 'invalid_pin') {
        setPinError('Enter your current 4-digit PIN.');
        setPinModalVisible(true);
      } else if (code === 'device_token_required' || code === 'device_token_invalid' || code === 'device_token_revoked') {
        Alert.alert('Secure Device Required', 'Sign in again on this device before changing sensitive profile details.');
      } else {
        Alert.alert('Profile Not Saved', 'We could not save your changes. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (!validateForm()) {
      return;
    }

    if (isSensitiveProfileChange()) {
      setPinError('');
      setSecurityPin('');
      setPinModalVisible(true);
      return;
    }

    await submitProfile();
  };

  const handlePinConfirm = async () => {
    if (!/^\d{4}$/.test(securityPin)) {
      setPinError('Enter your current 4-digit PIN.');
      return;
    }

    await submitProfile(securityPin);
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <Avatar name={displayName || 'User'} uri={avatarUri} size={92} />
              <Pressable style={styles.editAvatarBtn} onPress={handlePickAvatar} hitSlop={6}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.avatarHint}>Change profile photo</Text>
          </View>

          {/* Form Fields inside Settings Card */}
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, nameError ? { color: colors.light.error } : null]}>
                Full Name
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Full Name"
                placeholderTextColor={colors.light.textTertiary}
                value={displayName}
                onChangeText={setDisplayName}
              />
            </View>
            {nameError ? <Text style={styles.rowErrorText}>{nameError}</Text> : null}

            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, usernameError ? { color: colors.light.error } : null]}>
                Username
              </Text>
              <View style={styles.usernameWrapper}>
                <Text style={styles.atSymbol}>@</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="username"
                  placeholderTextColor={colors.light.textTertiary}
                  value={username}
                  onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoCapitalize="none"
                />
              </View>
            </View>
            {usernameError ? <Text style={styles.rowErrorText}>{usernameError}</Text> : null}

            <View style={[styles.inputRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.inputLabel, phoneError ? { color: colors.light.error } : null]}>
                Phone
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Phone Number"
                placeholderTextColor={colors.light.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
            {phoneError ? <Text style={styles.rowErrorText}>{phoneError}</Text> : null}
          </View>

          {/* Save Button */}
          <View style={styles.actionContainer}>
            <Button
              title="Save Changes"
              onPress={handleSave}
              loading={saving}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={pinModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setPinModalVisible(false);
          setSecurityPin('');
          setPinError('');
        }}
      >
        <SafeAreaView style={styles.pinModalContainer}>
          <View style={styles.pinModalHeader}>
            <Pressable
              onPress={() => {
                setPinModalVisible(false);
                setSecurityPin('');
                setPinError('');
              }}
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Confirm PIN</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.pinModalContent}>
            <Text style={styles.pinModalTitle}>Secure Profile Change</Text>
            <Text style={styles.pinModalSubtitle}>
              Enter your PIN to change sensitive profile details.
            </Text>
            <TextInput
              value={securityPin}
              onChangeText={(value) => {
                setSecurityPin(value.replace(/[^0-9]/g, '').slice(0, 4));
                setPinError('');
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              style={styles.pinInput}
              textAlign="center"
            />
            {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}
            <Button
              title="Confirm & Save"
              onPress={handlePinConfirm}
              loading={saving}
              fullWidth
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  // ─── Header ───
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },

  // ─── Avatar Section ───
  avatarSection: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  avatarWrapper: {
    position: 'relative',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.light.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.light.background,
  },
  avatarHint: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: spacing.sm,
  },

  // ─── Form Card ───
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  inputLabel: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
    width: 100,
  },
  textInput: {
    flex: 1,
    ...typography.bodySm,
    color: colors.light.textPrimary,
    textAlign: 'right',
    paddingVertical: 0,
  },
  usernameWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  atSymbol: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginRight: 2,
  },
  rowErrorText: {
    ...typography.caption,
    color: colors.light.error,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    backgroundColor: '#FEE2E250', // very light red tint
  },

  // ─── Save Action ───
  actionContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  pinModalContainer: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  pinModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  pinModalContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  pinModalTitle: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  pinModalSubtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  pinInput: {
    ...typography.h2,
    color: colors.light.textPrimary,
    letterSpacing: 0,
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  pinErrorText: {
    ...typography.caption,
    color: colors.light.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
