import { apiFetch } from './apiClient';
import {
  AutoQA,
  ChatSession,
  CreateAutoQAReq,
  UpdateAutoQAReq,
  CreateChatSessionReq,
  UpdateChatSessionReq,
  AskQuestionReq,
  AskQuestionResponse
} from '../types/autoQa';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

export const autoQaAPI = {
  // --- Public Endpoints ---

  getPublicAutoQAs: async (): Promise<AutoQA[]> => {
    const res = await apiFetch<ApiResponse<AutoQA[]>>('/auto-qas/public');
    return res.data;
  },

  createChatSession: async (req: CreateChatSessionReq): Promise<ChatSession> => {
    const res = await apiFetch<ApiResponse<ChatSession>>('/chat-sessions', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  getChatSessionById: async (id: number): Promise<ChatSession> => {
    const res = await apiFetch<ApiResponse<ChatSession>>(`/chat-sessions/${id}`);
    return res.data;
  },

  askQuestion: async (sessionId: number, req: AskQuestionReq): Promise<AskQuestionResponse> => {
    const res = await apiFetch<ApiResponse<AskQuestionResponse>>(`/chat-sessions/${sessionId}/ask`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  // --- Admin Endpoints ---

  getAllAutoQAs: async (): Promise<AutoQA[]> => {
    const res = await apiFetch<ApiResponse<AutoQA[]>>('/admin/auto-qas');
    return res.data;
  },

  createAutoQA: async (req: CreateAutoQAReq): Promise<AutoQA> => {
    const res = await apiFetch<ApiResponse<AutoQA>>('/admin/auto-qas', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  updateAutoQA: async (id: number, req: UpdateAutoQAReq): Promise<AutoQA> => {
    const res = await apiFetch<ApiResponse<AutoQA>>(`/admin/auto-qas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  deleteAutoQA: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/admin/auto-qas/${id}`, {
      method: 'DELETE',
    });
  },

  getAllChatSessions: async (): Promise<ChatSession[]> => {
    const res = await apiFetch<ApiResponse<ChatSession[]>>('/admin/chat-sessions');
    return res.data;
  },

  updateChatSession: async (id: number, req: UpdateChatSessionReq): Promise<ChatSession> => {
    const res = await apiFetch<ApiResponse<ChatSession>>(`/admin/chat-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  deleteChatSession: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/admin/chat-sessions/${id}`, {
      method: 'DELETE',
    });
  },

  adminReplyChatSession: async (id: number, answer: string): Promise<AutoQA> => {
    const res = await apiFetch<ApiResponse<AutoQA>>(`/admin/chat-sessions/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
    return res.data;
  }
};
