import { api } from './client';
import type { Friend, FriendRequest } from '@/types/friend';

export interface FriendUser {
  id: string;
  displayName: string;
  username: string;
  phone: string;
  avatarUrl: string | null;
  oroyaId: string;
}

export interface ChatThread {
  id: string;
  friendship_id?: string;
  user_a_id: string;
  user_b_id: string;
  last_message?: string;
  last_message_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  receiverUserId: string;
  message: string;
  status: string;
  createdAt: string;
  readAt?: string;
}

export async function fetchFriends() {
  const response = await api.get<{ success: boolean; friends: Friend[] }>('/friends');
  return response.friends;
}

export async function searchFriendUsers(query: string) {
  const encoded = encodeURIComponent(query.trim());
  if (!encoded) return [];
  const response = await api.get<{ success: boolean; users: FriendUser[] }>(`/friends/search?q=${encoded}`);
  return response.users;
}

export async function fetchFriendRequests() {
  const response = await api.get<{ success: boolean; requests: FriendRequest[] }>('/friends/requests');
  return response.requests;
}

export async function sendFriendRequest(oroyaId: string) {
  const response = await api.post<{ success: boolean; request: unknown }>('/friends/request', {
    oroya_id: oroyaId.trim(),
  });
  return response.request;
}

export async function acceptFriendRequest(requestId: string) {
  const response = await api.post<{ success: boolean; thread: ChatThread }>('/friends/accept', {
    request_id: requestId,
  });
  return response.thread;
}

export async function openChat(friendId: string) {
  const response = await api.post<{ success: boolean; thread: ChatThread }>('/chats/open', {
    friend_id: friendId,
  });
  return response.thread;
}

export async function fetchChatMessages(threadId: string) {
  const encoded = encodeURIComponent(threadId);
  const response = await api.get<{ success: boolean; messages: ChatMessage[] }>(
    `/chats/messages?thread_id=${encoded}`,
  );
  return response.messages;
}

export async function sendChatMessage(threadId: string, message: string) {
  const response = await api.post<{ success: boolean; message: ChatMessage }>('/chats/messages', {
    thread_id: threadId,
    message,
  });
  return response.message;
}
