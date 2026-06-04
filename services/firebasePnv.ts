import { NativeModules, Platform } from 'react-native';

interface FirebasePnvNativeModule {
  getVerifiedPhoneNumber?: (privacyPolicyUrl: string) => Promise<{
    token?: string;
    phoneNumber?: string;
  }>;
}

export class FirebasePnvUnavailableError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebasePnvUnavailableError';
    this.code = code;
  }
}

export async function requestFirebasePhoneVerification() {
  if (Platform.OS !== 'android') {
    throw new FirebasePnvUnavailableError(
      'firebase_pnv_android_only',
      'Firebase Phone Number Verification is Android-only in this build.',
    );
  }

  const privacyPolicyUrl = process.env.EXPO_PUBLIC_FIREBASE_PNV_PRIVACY_POLICY_URL?.trim() || '';
  if (!/^https:\/\//i.test(privacyPolicyUrl)) {
    throw new FirebasePnvUnavailableError(
      'firebase_pnv_privacy_policy_missing',
      'Firebase PNV requires an HTTPS privacy policy URL.',
    );
  }

  const module = NativeModules.FirebasePhoneNumberVerification as FirebasePnvNativeModule | undefined;
  if (!module?.getVerifiedPhoneNumber) {
    throw new FirebasePnvUnavailableError(
      'firebase_pnv_native_module_missing',
      'Firebase PNV native module is missing. Use an Android development build, not Expo Go.',
    );
  }

  const result = await module.getVerifiedPhoneNumber(privacyPolicyUrl);
  const token = typeof result?.token === 'string' ? result.token.trim() : '';
  if (!token) {
    throw new FirebasePnvUnavailableError(
      'firebase_pnv_token_missing',
      'Firebase PNV did not return a signed token.',
    );
  }

  return {
    token,
    phoneNumber: typeof result?.phoneNumber === 'string' ? result.phoneNumber : '',
  };
}
