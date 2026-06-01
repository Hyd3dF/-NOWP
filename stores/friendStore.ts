import { create } from 'zustand';
import { Friend, FriendRequest } from '../types/friend';
import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  sendFriendRequest,
} from '../services/api/social';

interface FriendState {
  friends: Friend[];
  requests: FriendRequest[];
  isLoading: boolean;
  isRequestsLoading: boolean;
  searchQuery: string;
  error: string;

  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  getFilteredFriends: () => Friend[];
  getRecentRecipients: () => Friend[];
  sendRequest: (oroyaId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  clearFriends: () => void;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  requests: [],
  isLoading: false,
  isRequestsLoading: false,
  searchQuery: '',
  error: '',

  fetchFriends: async () => {
    set({ isLoading: true, error: '' });
    try {
      const friends = await fetchFriends();
      set({ friends, isLoading: false });
    } catch (error) {
      set({
        friends: [],
        isLoading: false,
        error: 'Friends could not be loaded.',
      });
    }
  },

  fetchRequests: async () => {
    set({ isRequestsLoading: true, error: '' });
    try {
      const requests = await fetchFriendRequests();
      set({ requests, isRequestsLoading: false });
    } catch (error) {
      set({
        requests: [],
        isRequestsLoading: false,
        error: 'Friend requests could not be loaded.',
      });
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  getFilteredFriends: () => {
    const { friends, searchQuery } = get();
    const acceptedFriends = friends.filter((friend) => friend.status === 'accepted');

    if (!searchQuery.trim()) {
      return acceptedFriends;
    }

    const query = searchQuery.toLowerCase().trim();
    return acceptedFriends.filter(
      (friend) =>
        friend.user.displayName.toLowerCase().includes(query) ||
        friend.user.username.toLowerCase().includes(query) ||
        friend.user.oroyaId?.toLowerCase().includes(query),
    );
  },

  getRecentRecipients: () => {
    return get().friends.filter((friend) => friend.status === 'accepted').slice(0, 6);
  },

  sendRequest: async (oroyaId: string) => {
    await sendFriendRequest(oroyaId);
    await get().fetchRequests();
  },

  acceptRequest: async (requestId: string) => {
    await acceptFriendRequest(requestId);
    await Promise.all([get().fetchRequests(), get().fetchFriends()]);
  },

  clearFriends: () => {
    set({
      friends: [],
      requests: [],
      isLoading: false,
      isRequestsLoading: false,
      searchQuery: '',
      error: '',
    });
  },
}));
