import { apiFetch } from './apiClient';
import {
  AutoQA,
  ChatSession,
  CreateAutoQAReq,
  UpdateAutoQAReq,
  CreateChatSessionReq,
  UpdateChatSessionReq,
  AskQuestionReq,
  AskQuestionResponse,
  AdminReplyReq,
  ChatUploadResponse,
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

  // ลูกค้าแก้ไขข้อความของตัวเอง
  editChatMessage: async (sessionId: number, msgId: number, question: string): Promise<AutoQA> => {
    const res = await apiFetch<ApiResponse<AutoQA>>(`/chat-sessions/${sessionId}/messages/${msgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ question }),
    });
    return res.data;
  },

  // ลูกค้าลบข้อความของตัวเอง
  deleteChatMessage: async (sessionId: number, msgId: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/chat-sessions/${sessionId}/messages/${msgId}`, {
      method: 'DELETE',
    });
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

  adminReplyChatSession: async (id: number, req: AdminReplyReq): Promise<AutoQA> => {
    const res = await apiFetch<ApiResponse<AutoQA>>(`/admin/chat-sessions/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  // อัปโหลดไฟล์แนบในแชท (รูป/PDF) — ใช้ได้ทั้ง guest และแอดมิน (endpoint สาธารณะ)
  uploadChatAttachment: async (file: File): Promise<ChatUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token.trim().replace(/[\r\n]/g, '')}`;

    const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
    const response = await fetch(`${BASE_URL}/chat-uploads`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let msg = 'อัปโหลดไฟล์ไม่สำเร็จ';
      try {
        const p = await response.json();
        if (p?.error) msg = p.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return response.json();
  },
};
