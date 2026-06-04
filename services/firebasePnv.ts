import { NativeModules } from 'react-native';

interface FirebasePnvNativeModule {
  getVerifiedPhoneNumber?: () => Promise<{
    token?: string;
    phoneNumber?: string;
  }>;
}

export async function requestFirebasePhoneVerification() {
  const module = NativeModules.FirebasePhoneNumberVerification as FirebasePnvNativeModule | undefined;
  if (!module?.getVerifiedPhoneNumber) {
    throw new Error('firebase_pnv_native_module_missing');
  }

  const result = await module.getVerifiedPhoneNumber();
  const token = typeof result?.token === 'string' ? result.token.trim() : '';
  if (!token) {
    throw new Error('firebase_pnv_token_missing');
  }

  return {
    token,
    phoneNumber: typeof result?.phoneNumber === 'string' ? result.phoneNumber : '',
  };
}
