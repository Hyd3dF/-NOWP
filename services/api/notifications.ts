import { api } from './client';

export interface AppNotification {
  id: string;
  type: 'friend_request' | 'friend_accept' | 'system' | string;
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  linkUrl?: string;
  referenceCollection?: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
  metadata?: Record<string, unknown>;
}

export async function fetchNotifications() {
  const response = await api.get<{
    success: boolean;
    unreadCount: number;
    notifications: AppNotification[];
  }>('/notifications');
  return response;
}

export async function markNotificationRead(notificationId: string) {
  const response = await api.post<{ success: boolean }>('/notifications/read', {
    notification_id: notificationId,
  });
  return response.success;
}
