import { create } from 'zustand';
import { Wallet } from '../types/wallet';
import { api } from '../services/api/client';

interface BackendWallet {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  created_at?: string;
  created?: string;
}

interface WalletsResponse {
  success: boolean;
  wallets: BackendWallet[];
}

interface WalletState {
  wallet: Wallet | null;
  isBalanceVisible: boolean;
  isLoading: boolean;
  error: string;

  fetchWallet: () => Promise<void>;
  toggleBalanceVisibility: () => void;
  updateBalance: (amount: number) => void;
  clearWallet: () => void;
}

function mapWallet(wallet: BackendWallet, index: number): Wallet {
  return {
    id: wallet.id,
    userId: wallet.user_id,
    currency: wallet.currency,
    balance: Number(wallet.balance || 0),
    isDefault: index === 0 || wallet.currency === 'USD',
    createdAt: wallet.created_at || wallet.created || new Date().toISOString(),
  };
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  isBalanceVisible: true,
  isLoading: false,
  error: '',

  fetchWallet: async () => {
    set({ isLoading: true, error: '' });

    try {
      const response = await api.get<WalletsResponse>('/wallets/me');
      const wallet = response.wallets[0] ? mapWallet(response.wallets[0], 0) : null;
      set({ wallet, isLoading: false });
    } catch (error: any) {
      set({
        error: 'Wallet balance could not be loaded. Pull to refresh or try again later.',
        isLoading: false,
      });
    }
  },

  toggleBalanceVisibility: () => {
    set((state) => ({
      isBalanceVisible: !state.isBalanceVisible,
    }));
  },

  updateBalance: (amount: number) => {
    const wallet = get().wallet;
    if (!wallet) return;

    set({
      wallet: {
        ...wallet,
        balance: wallet.balance + amount,
      },
    });
  },

  clearWallet: () => {
    set({ wallet: null, isBalanceVisible: true, isLoading: false, error: '' });
  },
}));
