export type TransactionType = 'send' | 'receive' | 'request' | 'topup' | 'withdrawal';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Transaction {
  id: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  receiverName: string;
  senderAvatar: string | null;
  receiverAvatar: string | null;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  note: string;
  reference: string;
  createdAt: string;
}
