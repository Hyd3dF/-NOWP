import { User, UserProfile } from '../../types/user';
import { Wallet } from '../../types/wallet';
import { Transaction } from '../../types/transaction';
import { Friend } from '../../types/friend';

export const CURRENT_USER: UserProfile = {
  id: 'user-001',
  email: 'alex@oroya.app',
  phone: '+1234567890',
  username: 'alexj',
  displayName: 'Alex Johnson',
  avatarUrl: null,
  kycStatus: 'verified',
  isActive: true,
  createdAt: '2025-01-15T10:00:00Z',
  bio: 'Building the future of payments',
  defaultCurrency: 'USD',
};

export const MOCK_WALLET: Wallet = {
  id: 'wallet-001',
  userId: 'user-001',
  currency: 'USD',
  balance: 0,
  isDefault: true,
  createdAt: '2025-01-15T10:00:00Z',
};

export const MOCK_USERS: User[] = [];

export const MOCK_TRANSACTIONS: Transaction[] = [];

export const MOCK_FRIENDS: Friend[] = [];

export const RECENT_RECIPIENT_IDS: string[] = [];
