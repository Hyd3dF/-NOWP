import { NativeModules } from 'react-native';

type PhoneConfirmation = {
  confirm: (code: string) => Promise<{
    user?: {
      phoneNumber?: string | null;
      getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    } | null;
  } | null>;
};

let pendingConfirmation: PhoneConfirmation | null = null;

declare const require: (moduleName: string) => unknown;

export class FirebasePhoneAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirebasePhoneAuthError';
    this.code = code;
  }
}

export function isFirebasePhoneAuthAvailable() {
  return Boolean(NativeModules.RNFBAppModule && NativeModules.RNFBAuthModule);
}

export async function startFirebasePhoneOtp(phoneNumber: string) {
  assertFirebaseNativeAvailable();
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) {
    throw new FirebasePhoneAuthError(
      'firebase_auth_phone_invalid',
      'Phone number must include the country code.',
    );
  }

  try {
    const auth = getFirebaseAuth();
    pendingConfirmation = await auth().signInWithPhoneNumber(cleanPhone);
    return { phoneNumber: cleanPhone };
  } catch (error) {
    throw mapFirebasePhoneAuthError(error);
  }
}

export async function confirmFirebasePhoneOtp(code: string) {
  assertFirebaseNativeAvailable();
  if (!pendingConfirmation) {
    throw new FirebasePhoneAuthError(
      'firebase_auth_confirmation_missing',
      'Start SMS verification again before entering the code.',
    );
  }
  if (!/^\d{6}$/.test(code.trim())) {
    throw new FirebasePhoneAuthError(
      'firebase_auth_code_format',
      'Enter the 6-digit SMS code.',
    );
  }

  try {
    const credential = await pendingConfirmation.confirm(code.trim());
    const idToken = await credential?.user?.getIdToken?.(true);
    pendingConfirmation = null;
    if (!idToken) {
      throw new FirebasePhoneAuthError(
      'firebase_auth_token_missing',
        'Phone verification did not return a verified token.',
      );
    }
    return {
      firebaseIdToken: idToken,
      phoneNumber: credential?.user?.phoneNumber || '',
    };
  } catch (error) {
    if (error instanceof FirebasePhoneAuthError) throw error;
    throw mapFirebasePhoneAuthError(error);
  }
}

function assertFirebaseNativeAvailable() {
  if (!isFirebasePhoneAuthAvailable()) {
    throw new FirebasePhoneAuthError(
      'firebase_auth_native_module_missing',
      'Phone verification is not available in this test build.',
    );
  }
}

function getFirebaseAuth(): () => { signInWithPhoneNumber: (phoneNumber: string) => Promise<PhoneConfirmation> } {
  assertFirebaseNativeAvailable();
  const authModule = require('@react-native-firebase/auth') as {
    default?: () => { signInWithPhoneNumber: (phoneNumber: string) => Promise<PhoneConfirmation> };
  } | (() => { signInWithPhoneNumber: (phoneNumber: string) => Promise<PhoneConfirmation> });
  if (typeof authModule === 'function') return authModule;
  if (typeof authModule.default === 'function') return authModule.default;
  throw new FirebasePhoneAuthError(
    'firebase_auth_native_module_missing',
    'Phone verification is not available in this test build.',
  );
}

function mapFirebasePhoneAuthError(error: unknown) {
  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const rawMessage =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  const code = rawCode.replace(/^auth\//, 'firebase_auth_').replace(/-/g, '_');
  const mapped = code || 'firebase_auth_failed';
  const messages: Record<string, string> = {
    firebase_auth_app_not_authorized: 'This Android app is not authorized in Firebase. Check SHA fingerprints.',
    firebase_auth_missing_client_identifier: 'Firebase Android client configuration is missing or outdated.',
    firebase_auth_invalid_phone_number: 'Phone number is invalid.',
    firebase_auth_quota_exceeded: 'SMS verification limit has been reached. Try again later.',
    firebase_auth_too_many_requests: 'Too many SMS attempts. Try again later.',
    firebase_auth_invalid_verification_code: 'The SMS code is incorrect.',
    firebase_auth_session_expired: 'The SMS code expired. Request a new code.',
    firebase_auth_missing_verification_code: 'Enter the SMS code.',
  };
  return new FirebasePhoneAuthError(
    mapped,
    messages[mapped] || rawMessage || 'Phone verification failed.',
  );
}
