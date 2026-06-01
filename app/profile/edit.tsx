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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { isValidPhone, isValidUsername } from '@/utils/validation';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatarUrl || null);

  const [nameError, setNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);

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
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarUri(result.assets[0].uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      Alert.alert('Could Not Open Photos', 'Please try again or choose a different photo.');
    }
  };

  const handleSave = async () => {
    setNameError('');
    setUsernameError('');
    setPhoneError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

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
      setPhoneError('Enter a valid phone number, including country code.');
      valid = false;
    }

    if (!valid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }

    setSaving(true);

    try {
      await updateProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        phone: phone.trim(),
        avatarUrl: avatarUri,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    } catch {
      Alert.alert('Profile Not Saved', 'We could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Edit Profile" showBack onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <Avatar name={displayName || 'User'} uri={avatarUri} size={96} />
              <Pressable style={styles.editAvatarBtn} onPress={handlePickAvatar}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.avatarHint}>Change profile photo</Text>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <Input
              label="Full Name"
              placeholder="Alex Johnson"
              value={displayName}
              onChangeText={setDisplayName}
              error={nameError}
            />

            <Input
              label="Username"
              placeholder="alexj"
              value={username}
              onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              error={usernameError}
              autoCapitalize="none"
              icon={<Text style={styles.atSymbol}>@</Text>}
            />

            <Input
              label="Phone Number"
              placeholder="+1234567890"
              value={phone}
              onChangeText={setPhone}
              error={phoneError}
              keyboardType="phone-pad"
            />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  avatarWrapper: {
    position: 'relative',
    ...shadows.card,
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
  form: {
    gap: spacing.sm,
  },
  atSymbol: {
    ...typography.body,
    color: colors.light.textTertiary,
    fontWeight: '600',
  },
  actionContainer: {
    marginTop: spacing.xl,
  },
});
