import { apiFetch } from './apiClient';
import {
  Announcement,
  Category,
  CreateAnnouncementReq,
  UpdateAnnouncementReq,
  CreateCategoryReq,
  UpdateCategoryReq,
} from '../types/announcement';

// Define the response wrappers based on backend return structure (e.g. { data: ... })
interface ApiResponse<T> {
  data: T;
  message?: string;
}

export const announcementAPI = {
  // Public: คืนเฉพาะประกาศที่กำลังแสดงผล (active) — ใช้กับหน้าเว็บสาธารณะ
  // audience: 'guest' = หน้าแรกก่อนล็อกอิน, 'member' = แดชบอร์ดลูกค้าที่ล็อกอินแล้ว
  // ไม่ระบุ = ไม่กรอง visibility (ใช้เมื่อยังไม่ทราบกลุ่มเป้าหมาย)
  getPublicAnnouncements: async (audience?: 'guest' | 'member'): Promise<Announcement[]> => {
    const qs = audience ? `?audience=${audience}` : '';
    const res = await apiFetch<ApiResponse<Announcement[]>>(`/announcements${qs}`);
    return res.data;
  },

  // Admin: คืนประกาศทั้งหมด (รวมที่หมดอายุ/ยังไม่เริ่ม) — ใช้กับหน้าจัดการของแอดมิน
  getAllAnnouncements: async (): Promise<Announcement[]> => {
    const res = await apiFetch<ApiResponse<Announcement[]>>('/admin/announcements');
    return res.data;
  },

  getAnnouncementById: async (id: number): Promise<Announcement> => {
    const res = await apiFetch<ApiResponse<Announcement>>(`/announcements/${id}`);
    return res.data;
  },

  incrementViewCount: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/announcements/${id}/view`, {
      method: 'POST',
    });
  },

  getAllCategories: async (): Promise<Category[]> => {
    const res = await apiFetch<ApiResponse<Category[]>>('/announcements/categories');
    return res.data;
  },

  // Protected Admin Endpoints
  createCategory: async (req: CreateCategoryReq): Promise<Category> => {
    const res = await apiFetch<ApiResponse<Category>>('/announcements/categories', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  updateCategory: async (id: number, req: UpdateCategoryReq): Promise<Category> => {
    const res = await apiFetch<ApiResponse<Category>>(`/announcements/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  deleteCategory: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/announcements/categories/${id}`, {
      method: 'DELETE',
    });
  },

  createAnnouncement: async (req: CreateAnnouncementReq): Promise<Announcement> => {
    const res = await apiFetch<ApiResponse<Announcement>>('/announcements', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  updateAnnouncement: async (id: number, req: UpdateAnnouncementReq): Promise<Announcement> => {
    const res = await apiFetch<ApiResponse<Announcement>>(`/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  deleteAnnouncement: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  uploadImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'news'); // แยกเก็บรูปข่าว/ประกาศไว้โฟลเดอร์ news

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token.trim().replace(/[\r\n]/g, '')}`;
    }

    const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
    const response = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Image upload failed');
    }

    const data = await response.json();
    return data.url;
  }
};
