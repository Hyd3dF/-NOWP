import { create } from 'zustand';
import type { ChatMessage } from '@/services/api/social';

interface ThreadCache {
  messages: ChatMessage[];
  fetchedAt: number;
}

interface ChatState {
  threads: Record<string, ThreadCache>;
  getMessages: (threadId: string) => ChatMessage[];
  setMessages: (threadId: string, messages: ChatMessage[]) => void;
  upsertMessage: (threadId: string, message: ChatMessage) => void;
  clearChats: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  threads: {},

  getMessages: (threadId) => get().threads[threadId]?.messages || [],

  setMessages: (threadId, messages) => {
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: {
          messages,
          fetchedAt: Date.now(),
        },
      },
    }));
  },

  upsertMessage: (threadId, message) => {
    set((state) => {
      const current = state.threads[threadId]?.messages || [];
      const next = current.some((item) => item.id === message.id)
        ? current.map((item) => (item.id === message.id ? message : item))
        : [...current, message];

      return {
        threads: {
          ...state.threads,
          [threadId]: {
            messages: next,
            fetchedAt: Date.now(),
          },
        },
      };
    });
  },

  clearChats: () => {
    set({ threads: {} });
  },
}));
