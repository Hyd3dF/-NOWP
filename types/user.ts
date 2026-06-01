export interface User {
  id: string;
  email: string;
  phone: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  kycStatus: 'none' | 'pending' | 'verified' | 'rejected';
  isActive: boolean;
  createdAt: string;
}

export interface UserProfile extends User {
  bio?: string;
  defaultCurrency: string;
}
