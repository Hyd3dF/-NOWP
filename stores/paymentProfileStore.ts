import { create } from 'zustand';
import { api } from '../services/api/client';

export interface PaymentProfile {
  user_id: string;
  payment_tag: string;
  display_name: string;
  qr_payload: string;
  is_active: boolean;
}

interface PaymentProfileResponse {
  success: boolean;
  paymentProfile: PaymentProfile;
}

interface PaymentProfileState {
  profile: PaymentProfile | null;
  isLoading: boolean;
  error: string;
  fetchPaymentProfile: () => Promise<PaymentProfile | null>;
  clearPaymentProfile: () => void;
}

export const usePaymentProfileStore = create<PaymentProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  error: '',

  fetchPaymentProfile: async () => {
    set({ profile: null, isLoading: true, error: '' });
    try {
      const response = await api.get<PaymentProfileResponse>('/users/payment-profile');
      set({ profile: response.paymentProfile, isLoading: false });
      return response.paymentProfile;
    } catch (error: any) {
      set({
        error: 'Payment profile could not be loaded',
        isLoading: false,
      });
      return null;
    }
  },

  clearPaymentProfile: () => {
    set({ profile: null, isLoading: false, error: '' });
  },
}));
