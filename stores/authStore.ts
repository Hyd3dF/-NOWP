import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api, setDeviceToken, setUnauthorizedHandler } from '../services/api/client';
import { UserProfile } from '../types/user';
import { usePaymentProfileStore } from './paymentProfileStore';
import { useFriendStore } from './friendStore';
import { useSendStore } from './sendStore';
import { useTransactionStore } from './transactionStore';
import { useWalletStore } from './walletStore';
import { useChatStore } from './chatStore';
import { useDepositStore } from './depositStore';
import { changeSecurityPin } from '../services/api/security';

interface BackendUser {
  id: string;
  email: string;
  phone?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  profile_photo_url?: string;
  avatar?: string;
  verification_status?: 'unverified' | 'pending' | 'verified' | 'rejected';
  created?: string;
  created_at?: string;
}

interface AuthResponse {
  success: boolean;
  token: string;
  user: BackendUser;
}

interface MeResponse {
  success: boolean;
  user: BackendUser;
}

interface UpdateProfileResponse {
  success: boolean;
  user: BackendUser;
}

export interface SignupInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  pin: string;
  dateOfBirth: string;
  profilePhotoBase64?: string;
  profilePhotoMime?: string;
  profilePhotoName?: string;
}

type ProfileUpdateInput = Partial<UserProfile> & {
  profilePhotoBase64?: string;
  profilePhotoMime?: string;
  profilePhotoName?: string;
};

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  pin: string;
  biometricsEnabled: boolean;

  initAuth: () => Promise<void>;
  invalidateSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  verifyPin: (pin: string) => boolean;
  updateProfile: (updates: ProfileUpdateInput) => Promise<void>;
  setBiometricsEnabled: (enabled: boolean) => Promise<void>;
}

const SECURE_KEYS = {
  USER: 'oroya_user',
  TOKEN: 'oroya_token',
  PIN: 'oroya_pin',
  BIOMETRICS: 'oroya_biometrics_enabled',
};
const PIN_CONFIGURED_VALUE = 'configured';
const SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

function mapBackendUser(user: BackendUser): UserProfile {
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.name ||
    user.username ||
    user.email;

  return {
    id: user.id,
    email: user.email,
    phone: user.phone || '',
    username: user.username || '',
    displayName,
    avatarUrl: user.profile_photo_url || null,
    kycStatus: mapVerificationStatus(user.verification_status),
    isActive: true,
    createdAt: user.created_at || user.created || new Date().toISOString(),
    defaultCurrency: 'USD',
  };
}

function mapVerificationStatus(status?: string): UserProfile['kycStatus'] {
  if (status === 'pending' || status === 'verified' || status === 'rejected') {
    return status;
  }
  return 'none';
}

async function persistSession(user: UserProfile, token: string) {
  await Promise.all([
    SecureStore.setItemAsync(SECURE_KEYS.USER, JSON.stringify(user), SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(SECURE_KEYS.TOKEN, token, SECURE_STORE_OPTIONS),
  ]);
}

async function clearStoredSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_KEYS.USER),
    SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN),
    SecureStore.deleteItemAsync(SECURE_KEYS.PIN),
    SecureStore.deleteItemAsync(SECURE_KEYS.BIOMETRICS),
  ]);
}

function clearClientSessionState() {
  usePaymentProfileStore.getState().clearPaymentProfile();
  useWalletStore.getState().clearWallet();
  useFriendStore.getState().clearFriends();
  useChatStore.getState().clearChats();
  useTransactionStore.getState().clearTransactions();
  useDepositStore.getState().clearPayment();
  useSendStore.getState().reset();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  pin: '',
  biometricsEnabled: false,

  initAuth: async () => {
    try {
      const [userStr, token, pin, biometricsEnabledStr] = await Promise.all([
        SecureStore.getItemAsync(SECURE_KEYS.USER),
        SecureStore.getItemAsync(SECURE_KEYS.TOKEN),
        SecureStore.getItemAsync(SECURE_KEYS.PIN),
        SecureStore.getItemAsync(SECURE_KEYS.BIOMETRICS),
      ]);

      const biometricsEnabled = biometricsEnabledStr === 'true';

      if (!userStr || !token) {
        set({ biometricsEnabled, isInitialized: true });
        return;
      }

      try {
        const response = await api.get<MeResponse>('/users/me');
        const user = mapBackendUser(response.user);
        await SecureStore.setItemAsync(SECURE_KEYS.USER, JSON.stringify(user));
        set({
          user,
          pin: pin ? PIN_CONFIGURED_VALUE : '',
          isAuthenticated: true,
          biometricsEnabled,
          isInitialized: true,
        });
      } catch {
        await clearStoredSession();
        clearClientSessionState();
        set({
          user: null,
          isAuthenticated: false,
          pin: '',
          biometricsEnabled,
          isInitialized: true,
        });
      }
    } catch {
      console.warn('Failed to initialize auth state');
      set({ isInitialized: true });
    }
  },

  invalidateSession: async () => {
    try {
      await clearStoredSession();
    } catch {
      console.warn('Failed to clear expired session');
    }

    clearClientSessionState();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
      pin: '',
      biometricsEnabled: false,
    });
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await api.post<AuthResponse>(
        '/auth/login',
        { identity: email.trim().toLowerCase(), password },
        undefined,
        true,
      );
      const user = mapBackendUser(response.user);
      await persistSession(user, response.token);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  signup: async (input: SignupInput) => {
    set({ isLoading: true });
    try {
      await api.post<{ success: boolean; requiresLogin: boolean }>(
        '/auth/register',
        {
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          username: input.username.trim(),
          email: input.email.trim().toLowerCase(),
          phone: input.phone.trim(),
          password: input.password,
          passwordConfirm: input.password,
          pin: input.pin,
          date_of_birth: input.dateOfBirth,
          profile_photo_base64: input.profilePhotoBase64 || undefined,
          profile_photo_mime: input.profilePhotoMime || undefined,
          profile_photo_name: input.profilePhotoName || undefined,
        },
        undefined,
        true,
      );

      const loginResponse = await api.post<AuthResponse>(
        '/auth/login',
        {
          identity: input.email.trim().toLowerCase(),
          password: input.password,
        },
        undefined,
        true,
      );

      const user = mapBackendUser(loginResponse.user);
      await Promise.all([
        persistSession(user, loginResponse.token),
        SecureStore.setItemAsync(SECURE_KEYS.PIN, PIN_CONFIGURED_VALUE, SECURE_STORE_OPTIONS),
      ]);
      set({ user, pin: PIN_CONFIGURED_VALUE, isAuthenticated: true, isLoading: false });
    } catch (error) {
      await setDeviceToken(null);
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await api.post('/auth/logout').catch(() => {});
      await clearStoredSession();
    } catch {
      console.warn('Failed to clear secure storage during logout');
    }

    await setDeviceToken(null);

    clearClientSessionState();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      pin: '',
      biometricsEnabled: false,
    });
  },

  setPin: async (pin: string) => {
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.PIN, PIN_CONFIGURED_VALUE, SECURE_STORE_OPTIONS);
    } catch {
      console.warn('Failed to save PIN securely');
    }
    set({ pin: PIN_CONFIGURED_VALUE });
  },

  changePin: async (currentPin: string, newPin: string) => {
    await changeSecurityPin(currentPin, newPin);
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.PIN, PIN_CONFIGURED_VALUE, SECURE_STORE_OPTIONS);
    } catch {
      console.warn('Failed to save updated PIN securely');
    }
    set({ pin: PIN_CONFIGURED_VALUE });
  },

  verifyPin: () => false,

  updateProfile: async (updates: ProfileUpdateInput) => {
    const currentUser = get().user;
    if (!currentUser) return;

    const response = await api.post<UpdateProfileResponse>('/users/me/update', {
      display_name: updates.displayName ?? currentUser.displayName,
      username: updates.username ?? currentUser.username,
      phone: updates.phone ?? currentUser.phone,
      profile_photo_base64: updates.profilePhotoBase64 || undefined,
      profile_photo_mime: updates.profilePhotoMime || undefined,
      profile_photo_name: updates.profilePhotoName || undefined,
    });
    const updatedUser = mapBackendUser(response.user);

    try {
      await SecureStore.setItemAsync(SECURE_KEYS.USER, JSON.stringify(updatedUser), SECURE_STORE_OPTIONS);
    } catch {
      console.warn('Failed to update user profile in secure storage');
    }

    set({ user: updatedUser });
  },

  setBiometricsEnabled: async (enabled: boolean) => {
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.BIOMETRICS, enabled ? 'true' : 'false', SECURE_STORE_OPTIONS);
    } catch {
      console.warn('Failed to save biometrics setting');
    }
    set({ biometricsEnabled: enabled });
  },

  loginWithBiometrics: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync(SECURE_KEYS.TOKEN);
      if (!token) {
        throw new Error('No saved session found.');
      }

      const response = await api.get<MeResponse>('/users/me');
      const user = mapBackendUser(response.user);
      await SecureStore.setItemAsync(SECURE_KEYS.USER, JSON.stringify(user), SECURE_STORE_OPTIONS);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
}));

setUnauthorizedHandler(() => useAuthStore.getState().invalidateSession());
