export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  status: FriendStatus;
  createdAt: string;
  threadId?: string;
  user: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    phone: string;
    oroyaId?: string;
  };
}

export interface FriendRequest {
  id: string;
  requesterUserId: string;
  receiverUserId: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  respondedAt?: string;
  user: Friend['user'];
}
