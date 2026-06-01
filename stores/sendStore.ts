import { create } from 'zustand';

interface SendState {
  recipientId: string | null;
  recipientName: string;
  recipientUsername: string;
  recipientAvatar: string | null;
  amount: string;
  note: string;
  lastTransactionRef: string;
  lastTransactionDate: string;
  lastAmount: string;
  lastRecipientName: string;
  setRecipient: (id: string, name: string, username: string, avatar: string | null) => void;
  setAmount: (amount: string) => void;
  setNote: (note: string) => void;
  setLastTransaction: (ref: string, date: string, amount: string, recipientName: string) => void;
  reset: () => void;
}

export const useSendStore = create<SendState>((set) => ({
  recipientId: null,
  recipientName: '',
  recipientUsername: '',
  recipientAvatar: null,
  amount: '',
  note: '',
  lastTransactionRef: '',
  lastTransactionDate: '',
  lastAmount: '',
  lastRecipientName: '',
  setRecipient: (id, name, username, avatar) =>
    set({ recipientId: id, recipientName: name, recipientUsername: username, recipientAvatar: avatar }),
  setAmount: (amount) => set({ amount }),
  setNote: (note) => set({ note }),
  setLastTransaction: (ref, date, amount, recipientName) =>
    set({ lastTransactionRef: ref, lastTransactionDate: date, lastAmount: amount, lastRecipientName: recipientName }),
  reset: () =>
    set({
      recipientId: null,
      recipientName: '',
      recipientUsername: '',
      recipientAvatar: null,
      amount: '',
      note: '',
      lastTransactionRef: '',
      lastTransactionDate: '',
      lastAmount: '',
      lastRecipientName: '',
    }),
}));
