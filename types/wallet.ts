export interface Wallet {
  id: string;
  userId: string;
  currency: string;
  balance: number;
  isDefault: boolean;
  createdAt: string;
}
