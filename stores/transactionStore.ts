import { create } from 'zustand';
import { Transaction, TransactionStatus } from '../types/transaction';
import { api } from '../services/api/client';

type TransactionFilter = 'all' | 'sent' | 'received' | 'pending' | 'failed';

interface BackendTransaction {
  id: string;
  sender_id?: string;
  receiver_id?: string;
  sender_name?: string;
  receiver_name?: string;
  sender_avatar?: string | null;
  receiver_avatar?: string | null;
  amount: number | string;
  currency?: string;
  type?: string;
  status?: string;
  note?: string | null;
  reference?: string;
  reference_id?: string;
  created_at?: string;
  created?: string;
}

interface TransactionsResponse {
  success?: boolean;
  transactions?: BackendTransaction[];
}

interface TransactionState {
  transactions: Transaction[];
  isLoading: boolean;
  error: string;
  filter: TransactionFilter;

  fetchTransactions: () => Promise<void>;
  setFilter: (filter: TransactionFilter) => void;
  getFilteredTransactions: () => Transaction[];
  addTransaction: (txn: Transaction) => void;
  getTransactionById: (id: string) => Transaction | undefined;
  clearTransactions: () => void;
}

function normalizeType(type?: string): Transaction['type'] {
  if (type === 'send' || type === 'receive' || type === 'request' || type === 'topup' || type === 'withdrawal') {
    return type;
  }

  if (type === 'deposit') return 'receive';
  return 'send';
}

function normalizeStatus(status?: string): TransactionStatus {
  if (status === 'pending' || status === 'completed' || status === 'failed' || status === 'cancelled') {
    return status;
  }

  return 'completed';
}

function mapTransaction(txn: BackendTransaction): Transaction {
  const type = normalizeType(txn.type);
  const fallbackName = type === 'receive' || type === 'topup' ? 'External wallet' : 'Recipient';

  return {
    id: txn.id,
    senderId: txn.sender_id || '',
    receiverId: txn.receiver_id || '',
    senderName: txn.sender_name || (type === 'receive' ? fallbackName : 'You'),
    receiverName: txn.receiver_name || (type === 'send' || type === 'withdrawal' ? fallbackName : 'You'),
    senderAvatar: txn.sender_avatar || null,
    receiverAvatar: txn.receiver_avatar || null,
    amount: Number(txn.amount || 0),
    currency: txn.currency || 'USD',
    type,
    status: normalizeStatus(txn.status),
    note: txn.note || '',
    reference: txn.reference || txn.reference_id || txn.id,
    createdAt: txn.created_at || txn.created || new Date().toISOString(),
  };
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  isLoading: false,
  error: '',
  filter: 'all',

  fetchTransactions: async () => {
    set({ isLoading: true, error: '' });

    try {
      const response = await api.get<TransactionsResponse>('/transactions/me');
      const transactions = Array.isArray(response.transactions)
        ? response.transactions.map(mapTransaction)
        : [];
      set({
        transactions,
        isLoading: false,
      });
    } catch {
      set({
        transactions: [],
        isLoading: false,
        error: 'Transactions could not be loaded. Pull to refresh or try again later.',
      });
    }
  },

  setFilter: (filter: TransactionFilter) => {
    set({ filter });
  },

  getFilteredTransactions: () => {
    const { transactions, filter } = get();

    switch (filter) {
      case 'sent':
        return transactions.filter((txn) => txn.type === 'send');
      case 'received':
        return transactions.filter((txn) => txn.type === 'receive');
      case 'pending':
        return transactions.filter(
          (txn) => txn.status === ('pending' as TransactionStatus),
        );
      case 'failed':
        return transactions.filter(
          (txn) => txn.status === ('failed' as TransactionStatus),
        );
      case 'all':
      default:
        return transactions;
    }
  },

  addTransaction: (txn: Transaction) => {
    set((state) => ({
      transactions: [txn, ...state.transactions],
    }));
  },

  getTransactionById: (id: string) => {
    return get().transactions.find((txn) => txn.id === id);
  },

  clearTransactions: () => {
    set({ transactions: [], isLoading: false, error: '', filter: 'all' });
  },
}));
