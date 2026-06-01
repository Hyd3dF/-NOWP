import { create } from 'zustand';

interface DepositPayment {
  id: string;
  reference_id: string;
  payment_id: string;
  payment_address: string;
  payment_url: string;
  status: string;
  amount: number;
  currency: string;
  network: string;
  expires_at?: string;
}

interface DepositState {
  selectedCoinId: string;
  payment: DepositPayment | null;
  setSelectedCoin: (coinId: string) => void;
  setPayment: (payment: DepositPayment | null) => void;
  clearPayment: () => void;
}

export const useDepositStore = create<DepositState>((set) => ({
  selectedCoinId: 'btc',
  payment: null,
  setSelectedCoin: (coinId) => set({ selectedCoinId: coinId }),
  setPayment: (payment) => set({ payment }),
  clearPayment: () => set({ payment: null }),
}));

export type { DepositPayment };
