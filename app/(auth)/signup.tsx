import React, { useRef, useState } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isValidEmail, isValidPassword, isValidPhone } from '@/utils/validation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfilePhoto {
  uri: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PHONE_COUNTRIES = [
  { label: 'Turkey', code: '+90', flag: 'TR' },
  { label: 'Canada', code: '+1', flag: 'CA' },
  { label: 'United States', code: '+1', flag: 'US' },
  { label: 'Mexico', code: '+52', flag: 'MX' },
  { label: 'Argentina', code: '+54', flag: 'AR' },
  { label: 'Brazil', code: '+55', flag: 'BR' },
  { label: 'Colombia', code: '+57', flag: 'CO' },
  { label: 'Venezuela', code: '+58', flag: 'VE' },
  { label: 'Chile', code: '+56', flag: 'CL' },
  { label: 'Russia', code: '+7', flag: 'RU' },
  { label: 'Albania', code: '+355', flag: 'AL' },
  { label: 'Andorra', code: '+376', flag: 'AD' },
  { label: 'Austria', code: '+43', flag: 'AT' },
  { label: 'Belarus', code: '+375', flag: 'BY' },
  { label: 'Belgium', code: '+32', flag: 'BE' },
  { label: 'Bosnia and Herzegovina', code: '+387', flag: 'BA' },
  { label: 'Bulgaria', code: '+359', flag: 'BG' },
  { label: 'Croatia', code: '+385', flag: 'HR' },
  { label: 'Cyprus', code: '+357', flag: 'CY' },
  { label: 'Czechia', code: '+420', flag: 'CZ' },
  { label: 'Denmark', code: '+45', flag: 'DK' },
  { label: 'Estonia', code: '+372', flag: 'EE' },
  { label: 'Finland', code: '+358', flag: 'FI' },
  { label: 'France', code: '+33', flag: 'FR' },
  { label: 'Germany', code: '+49', flag: 'DE' },
  { label: 'Hungary', code: '+36', flag: 'HU' },
  { label: 'Iceland', code: '+354', flag: 'IS' },
  { label: 'Ireland', code: '+353', flag: 'IE' },
  { label: 'Italy', code: '+39', flag: 'IT' },
  { label: 'Kosovo', code: '+383', flag: 'XK' },
  { label: 'Latvia', code: '+371', flag: 'LV' },
  { label: 'Liechtenstein', code: '+423', flag: 'LI' },
  { label: 'Lithuania', code: '+370', flag: 'LT' },
  { label: 'Luxembourg', code: '+352', flag: 'LU' },
  { label: 'Malta', code: '+356', flag: 'MT' },
  { label: 'Moldova', code: '+373', flag: 'MD' },
  { label: 'Monaco', code: '+377', flag: 'MC' },
  { label: 'Montenegro', code: '+382', flag: 'ME' },
  { label: 'Netherlands', code: '+31', flag: 'NL' },
  { label: 'North Macedonia', code: '+389', flag: 'MK' },
  { label: 'Norway', code: '+47', flag: 'NO' },
  { label: 'Poland', code: '+48', flag: 'PL' },
  { label: 'Portugal', code: '+351', flag: 'PT' },
  { label: 'Romania', code: '+40', flag: 'RO' },
  { label: 'San Marino', code: '+378', flag: 'SM' },
  { label: 'Serbia', code: '+381', flag: 'RS' },
  { label: 'Slovakia', code: '+421', flag: 'SK' },
  { label: 'Slovenia', code: '+386', flag: 'SI' },
  { label: 'Spain', code: '+34', flag: 'ES' },
  { label: 'Sweden', code: '+46', flag: 'SE' },
  { label: 'Switzerland', code: '+41', flag: 'CH' },
  { label: 'Ukraine', code: '+380', flag: 'UA' },
  { label: 'United Kingdom', code: '+44', flag: 'GB' },
  { label: 'Vatican City', code: '+379', flag: 'VA' },
];

const TOTAL_STEPS = 4;
const MAX_PROFILE_PHOTO_BASE64_CHARS = 2_000_000;

const STEP_META = [
  { icon: 'person-outline' as const, title: 'Personal Info', subtitle: 'Tell us about yourself' },
  { icon: 'call-outline' as const, title: 'Phone & Birthday', subtitle: 'How can we reach you?' },
  { icon: 'lock-closed-outline' as const, title: 'Security', subtitle: 'Secure your account' },
  { icon: 'camera-outline' as const, title: 'Profile Photo', subtitle: 'Almost done!' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flagEmoji(countryCode: string) {
  if (countryCode === 'XK') return '🇽🇰';
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getSignupErrorMessage(error: any) {
  const code = String(error?.code || error?.message || '');
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  const field = String(error?.field || error?.validationFields?.[0] || '');
  const debugSuffix =
    typeof __DEV__ !== 'undefined' && __DEV__ && code
      ? ` Debug: ${code}${error?.status ? `/${error.status}` : ''}${error?.requestId ? `/${error.requestId}` : ''}`
      : '';
  if (code === 'connection_failed') {
    return `We could not connect right now. Please check your connection and try again.${debugSuffix}`;
  }
  if (code === 'request_timeout') {
    return `Account creation took too long. Please check your connection and try again. If you already received a confirmation, try logging in.${debugSuffix}`;
  }
  if (code === 'email_already_exists') {
    return `An account already exists for this email. Please log in or reset your password.${debugSuffix}`;
  }
  if (code === 'request_body_too_large') {
    return `Your profile photo is too large. Please choose a smaller photo or continue without one.${debugSuffix}`;
  }
  if (code === 'invalid_profile_photo') {
    return `Your profile photo must be a JPEG, PNG, or WebP image. Please choose another photo or continue without one.${debugSuffix}`;
  }
  if (code === 'account_conflict') {
    return `An account with these details may already exist. Please review your email, username, or phone number.${debugSuffix}`;
  }
  if (code === 'pocketbase_validation_failed') {
    return `${getSignupFieldErrorMessage(field)}${debugSuffix}`;
  }
  if (code === 'validation_failed') {
    return `Please review the highlighted details and try again.${debugSuffix}`;
  }
  if (code === 'server_unavailable') {
    return `Account creation is temporarily unavailable. Please try again in a few minutes.${debugSuffix}`;
  }
  if (message && message !== code) {
    return `${message}${debugSuffix}`;
  }
  return `We could not create your account. Please review your details and try again.${debugSuffix}`;
}

function getSignupFieldErrorMessage(field: string) {
  if (field === 'phone') {
    return 'This phone number cannot be used. Please check it or use a different number.';
  }
  if (field === 'email') {
    return 'This email address cannot be used. Please check it or use a different email.';
  }
  if (field === 'username') {
    return 'This username cannot be used. Please choose a different username.';
  }
  if (field === 'date_of_birth') {
    return 'Please check your date of birth and try again.';
  }
  if (field === 'profile_photo_file') {
    return 'Your profile photo cannot be uploaded. Please choose another photo or continue without one.';
  }
  return 'We could not save one of your details. Please review your information and try again.';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SignupScreen() {
  const router = useRouter();
  const { signup, isLoading } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const submittingRef = useRef(false);

  // ── Step state ──
  const [step, setStep] = useState(0);

  // ── Form state (all preserved exactly) ──
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(PHONE_COUNTRIES[0]);
  const [draftPhoneCountry, setDraftPhoneCountry] = useState(PHONE_COUNTRIES[0]);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhoto | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');

  // ── Helpers (all preserved exactly) ──

  const formatDateOfBirth = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };

  const normalizePhone = () => {
    const localNumber = phone.replace(/[^0-9]/g, '');
    return `${phoneCountry.code}${localNumber}`;
  };

  const filteredCountries = PHONE_COUNTRIES.filter((country) => {
    const query = countrySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      country.label.toLowerCase().includes(query) ||
      country.code.includes(query) ||
      country.flag.toLowerCase().includes(query)
    );
  });

  const openCountryPicker = () => {
    Keyboard.dismiss();
    setDraftPhoneCountry(phoneCountry);
    setCountrySearch('');
    requestAnimationFrame(() => setCountryModalVisible(true));
  };

  const confirmCountryPicker = () => {
    setPhoneCountry(draftPhoneCountry);
    setCountrySearch('');
    setCountryModalVisible(false);
  };

  const cancelCountryPicker = () => {
    setCountrySearch('');
    setCountryModalVisible(false);
  };

  const pickProfilePhoto = async () => {
    setGeneralError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setGeneralError('Gallery permission is required to add a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (asset.base64 && asset.base64.length > MAX_PROFILE_PHOTO_BASE64_CHARS) {
      setGeneralError('This profile photo is too large. Please choose a smaller photo or continue without one.');
      return;
    }
    setProfilePhoto({
      uri: asset.uri,
      base64: asset.base64 || undefined,
      mimeType: asset.mimeType || 'image/jpeg',
      fileName: asset.fileName || `profile-${Date.now()}.jpg`,
    });
  };

  // ── Full validate (original, preserved exactly) ──

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim())) {
      nextErrors.username = 'Use 3-40 letters, numbers, dots, dashes or underscores';
    }
    if (!isValidEmail(email)) nextErrors.email = 'Please enter a valid email address';
    if (!isValidPhone(normalizePhone())) nextErrors.phone = 'Please enter a valid phone number';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
      nextErrors.dateOfBirth = 'Use YYYY-MM-DD format';
    }
    if (!isValidPassword(password)) nextErrors.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
    if (!/^\d{4}$/.test(pin)) nextErrors.pin = 'PIN must be 4 digits';
    if (pin !== confirmPin) nextErrors.confirmPin = 'PINs do not match';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // ── Per-step validation ──

  const validateStep = (s: number): boolean => {
    const nextErrors: Record<string, string> = {};

    if (s === 0) {
      if (!firstName.trim()) nextErrors.firstName = 'First name is required';
      if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
      if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim())) {
        nextErrors.username = 'Use 3-40 letters, numbers, dots, dashes or underscores';
      }
      if (!isValidEmail(email)) nextErrors.email = 'Please enter a valid email address';
    }

    if (s === 1) {
      if (!isValidPhone(normalizePhone())) nextErrors.phone = 'Please enter a valid phone number';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
        nextErrors.dateOfBirth = 'Use YYYY-MM-DD format';
      }
    }

    if (s === 2) {
      if (!isValidPassword(password)) nextErrors.password = 'Password must be at least 8 characters';
      if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';
      if (!/^\d{4}$/.test(pin)) nextErrors.pin = 'PIN must be 4 digits';
      if (pin !== confirmPin) nextErrors.confirmPin = 'PINs do not match';
    }

    // Step 3 (photo) has no required validation

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // ── Step transition with crossfade ──

  const transitionTo = (nextStep: number) => {
    Keyboard.dismiss();
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    if (step < TOTAL_STEPS - 1) {
      transitionTo(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setErrors({});
      transitionTo(step - 1);
    } else {
      router.back();
    }
  };

  // ── Submit (preserved exactly) ──

  const handleSignup = async () => {
    if (submittingRef.current || isLoading) return;
    submittingRef.current = true;
    setGeneralError('');
    if (!validate()) {
      submittingRef.current = false;
      return;
    }

    try {
      await signup({
        firstName,
        lastName,
        username,
        email,
        phone: normalizePhone(),
        password,
        pin,
        dateOfBirth: `${dateOfBirth.trim()} 00:00:00.000Z`,
        profilePhotoBase64: profilePhoto?.base64,
        profilePhotoMime: profilePhoto?.mimeType,
        profilePhotoName: profilePhoto?.fileName,
      });
      router.replace('/(tabs)/home');
    } catch (error: any) {
      setGeneralError(getSignupErrorMessage(error));
    } finally {
      submittingRef.current = false;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const meta = STEP_META[step];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.keyboardView}
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={16}>
            <Ionicons name="chevron-back" size={22} color={colors.light.textPrimary} />
          </Pressable>
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
            </View>
          </View>
          <View style={styles.topBarRightPlaceholder} />
        </View>

        {/* ── Scrollable content ── */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Animated.View style={{ opacity: fadeAnim, flex: 1, justifyContent: 'space-between' }}>
            <View>
              {/* ── Step header ── */}
              <View style={styles.stepHeader}>
                <Text style={styles.stepBadge}>STEP {step + 1} OF {TOTAL_STEPS}</Text>
                <Text style={styles.stepTitle}>{meta.title}</Text>
                <Text style={styles.stepSubtitle}>{meta.subtitle}</Text>
              </View>

              {/* ── Error banner ── */}
              {generalError ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={18} color={colors.light.error} style={{ marginRight: 8 }} />
                  <Text style={styles.errorText}>{generalError}</Text>
                </View>
              ) : null}

              {/* ── Step 0: Personal Info ── */}
              {step === 0 && (
                <View style={styles.sectionCard}>
                  <Input
                    label="First Name"
                    placeholder="Enter first name"
                    value={firstName}
                    onChangeText={setFirstName}
                    error={errors.firstName}
                    autoCapitalize="words"
                  />
                  <Input
                    label="Last Name"
                    placeholder="Enter last name"
                    value={lastName}
                    onChangeText={setLastName}
                    error={errors.lastName}
                    autoCapitalize="words"
                  />

                  <Input
                    label="Username"
                    placeholder="Choose a username"
                    value={username}
                    onChangeText={setUsername}
                    error={errors.username}
                    autoCapitalize="none"
                  />

                  <Input
                    label="Email Address"
                    placeholder="Email address"
                    value={email}
                    onChangeText={setEmail}
                    error={errors.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              )}

              {/* ── Step 1: Phone & Date of Birth ── */}
              {step === 1 && (
                <View style={styles.sectionCard}>
                  <View style={styles.countryField}>
                    <Text style={styles.fieldLabel}>Country</Text>
                    <Pressable style={styles.countrySelect} onPress={openCountryPicker}>
                      <View style={styles.countrySelectLeft}>
                        <Text style={styles.countryFlagInline}>{flagEmoji(phoneCountry.flag)}</Text>
                        <View style={styles.countryTextBlock}>
                          <Text style={styles.countrySelectName}>{phoneCountry.label}</Text>
                          <Text style={styles.countrySelectCode}>{phoneCountry.code}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.light.textTertiary} />
                    </Pressable>
                  </View>

                  <Input
                    label="Phone Number"
                    placeholder="Enter phone number"
                    value={phone}
                    onChangeText={(value) => setPhone(value.replace(/[^0-9]/g, ''))}
                    error={errors.phone}
                    keyboardType="phone-pad"
                  />

                  <Input
                    label="Date of Birth"
                    placeholder="YYYY-MM-DD"
                    value={dateOfBirth}
                    onChangeText={(value) => setDateOfBirth(formatDateOfBirth(value))}
                    error={errors.dateOfBirth}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
              )}

              {/* ── Step 2: Security ── */}
              {step === 2 && (
                <View style={styles.sectionCard}>
                  <Input
                    label="Password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChangeText={setPassword}
                    error={errors.password}
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  <Input
                    label="Confirm Password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    error={errors.confirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  <View style={styles.row}>
                    <Input
                      label="PIN"
                      placeholder="4 digits"
                      value={pin}
                      onChangeText={(value) => setPin(value.replace(/[^0-9]/g, '').slice(0, 4))}
                      error={errors.pin}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      style={styles.rowInput}
                    />
                    <Input
                      label="Confirm PIN"
                      placeholder="Repeat"
                      value={confirmPin}
                      onChangeText={(value) => setConfirmPin(value.replace(/[^0-9]/g, '').slice(0, 4))}
                      error={errors.confirmPin}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={4}
                      style={styles.rowInput}
                    />
                  </View>
                </View>
              )}

              {/* ── Step 3: Profile Photo ── */}
              {step === 3 && (
                <View style={styles.sectionCard}>
                  <View style={styles.photoSection}>
                    <Pressable onPress={pickProfilePhoto} style={styles.photoButton}>
                      {profilePhoto ? (
                        <Image source={{ uri: profilePhoto.uri }} style={styles.photo} />
                      ) : (
                        <View style={styles.photoPlaceholder}>
                          <Ionicons name="camera" size={32} color={colors.light.primary} />
                        </View>
                      )}
                      <View style={styles.photoBadge}>
                        <Ionicons name={profilePhoto ? 'pencil' : 'add'} size={14} color="#FFFFFF" />
                      </View>
                    </Pressable>

                    <Text style={styles.photoLabel}>
                      {profilePhoto ? 'Looking great! Tap to change.' : 'Tap to add a profile photo'}
                    </Text>
                    <Text style={styles.photoHint}>This step is optional. You can add one later.</Text>

                    <Button
                      title={profilePhoto ? 'Change Photo' : 'Choose from Gallery'}
                      onPress={pickProfilePhoto}
                      variant="outline"
                      fullWidth
                      icon={<Ionicons name="image-outline" size={18} color={colors.light.primary} />}
                      style={styles.photoBtn}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* ── Bottom action bar ── */}
            <View style={styles.bottomBar}>
              {step < TOTAL_STEPS - 1 ? (
                <Button
                  title="Next"
                  onPress={handleNext}
                  fullWidth
                  style={styles.actionBtn}
                />
              ) : (
                <Button
                  title="Create Account"
                  onPress={handleSignup}
                  loading={isLoading}
                  disabled={isLoading}
                  fullWidth
                  style={styles.actionBtn}
                />
              )}

              {step === 0 && (
                <View style={styles.footer}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <Pressable onPress={() => router.push('/(auth)/login')}>
                    <Text style={styles.loginLink}>Log In</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Country Picker Modal (preserved exactly) ── */}
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={countryModalVisible}
        onRequestClose={cancelCountryPicker}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={cancelCountryPicker} style={styles.modalAction}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Select Country</Text>
            <Pressable onPress={confirmCountryPicker} style={styles.modalAction}>
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.light.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search country or code"
              placeholderTextColor={colors.light.textSecondary}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ScrollView
            style={styles.countryList}
            contentContainerStyle={styles.countryListContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            {filteredCountries.map((country) => {
              const selected =
                country.label === draftPhoneCountry.label &&
                country.code === draftPhoneCountry.code;
              return (
                <Pressable
                  key={`${country.label}-${country.code}`}
                  onPress={() => setDraftPhoneCountry(country)}
                  style={[styles.countryRow, selected && styles.countryRowSelected]}
                >
                  <View style={styles.countryRowInfo}>
                    <Text style={styles.countryFlag}>{flagEmoji(country.flag)}</Text>
                    <View style={styles.countryTextBlock}>
                      <Text style={styles.countryRowName}>{country.label}</Text>
                      <Text style={styles.countryRowCode}>{country.code}</Text>
                    </View>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.light.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /* ── Layout ── */
  container: {
    flex: 1,
    backgroundColor: '#F0F2F8',
  },
  keyboardView: {
    flex: 1,
  },

  /* ── Top bar ── */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? spacing.sm : spacing.md,
    paddingBottom: spacing.sm,
    height: 56,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  progressTrack: {
    height: 4,
    width: '100%',
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.light.primary,
    borderRadius: 2,
  },
  topBarRightPlaceholder: {
    width: 40,
  },

  /* ── Scroll ── */
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },

  /* ── Step header ── */
  stepHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  stepBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.light.primary,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.light.textPrimary,
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: 4,
  },

  /* ── Section card ── */
  sectionCard: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },

  /* ── Fields ── */
  fieldLabel: {
    fontSize: typography.bodySm.fontSize,
    fontWeight: '500',
    color: colors.light.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0.1,
  },
  countryField: {
    marginBottom: spacing.lg,
  },
  countrySelect: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    borderColor: colors.light.border,
    backgroundColor: colors.light.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countrySelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  countryFlagInline: {
    fontSize: 24,
  },
  countrySelectName: {
    ...typography.body,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  countrySelectCode: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 1,
  },

  /* ── Row inputs ── */
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowInput: {
    flex: 1,
  },

  /* ── Photo step ── */
  photoSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  photoButton: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.light.primary,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDE9FE',
    borderWidth: 2,
    borderColor: colors.light.primaryLight,
    borderStyle: 'dashed',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.light.surface,
  },
  photoLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.light.textPrimary,
    textAlign: 'center',
  },
  photoHint: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  photoBtn: {
    marginTop: spacing.sm,
  },

  /* ── Error ── */
  errorContainer: {
    backgroundColor: '#FFF0F0',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    ...typography.bodySm,
    color: colors.light.error,
    flex: 1,
  },

  /* ── Bottom bar ── */
  bottomBar: {
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.lg,
    backgroundColor: 'transparent',
  },
  actionBtn: {
    borderRadius: borderRadius.md,
    minHeight: 52,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  footerText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  loginLink: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '700',
  },

  /* ── Country Picker Modal ── */
  modalContainer: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  modalHeader: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    backgroundColor: colors.light.surface,
  },
  modalAction: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.body,
    color: colors.light.textPrimary,
    fontWeight: '700',
  },
  modalCancel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    fontWeight: '600',
  },
  modalDone: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '700',
    textAlign: 'right',
  },
  searchBox: {
    margin: spacing.lg,
    minHeight: 46,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: colors.light.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.light.textPrimary,
    paddingVertical: spacing.sm,
  },
  countryList: {
    flex: 1,
  },
  countryListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  countryRow: {
    minHeight: 62,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.surface,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryRowInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryFlag: {
    width: 34,
    fontSize: 22,
    marginRight: spacing.sm,
  },
  countryTextBlock: {
    flex: 1,
  },
  countryRowSelected: {
    borderColor: colors.light.primary,
    backgroundColor: colors.light.primaryLight,
  },
  countryRowName: {
    ...typography.body,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  countryRowCode: {
    ...typography.caption,
    color: colors.light.textSecondary,
    marginTop: 2,
  },
});
