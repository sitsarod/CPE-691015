import { apiFetch } from './apiClient';
import {
  HomeContent,
  HeroSlide,
  PublicHome,
  PublicCoach,
  UpdateHomeContentReq,
  CreateHeroSlideReq,
  UpdateHeroSlideReq,
} from '../types/homeContent';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

export const homeContentAPI = {
  // --- Public ---
  getPublicHome: async (): Promise<PublicHome> => {
    const res = await apiFetch<ApiResponse<PublicHome>>('/home-content');
    return res.data;
  },

  getPublicCoaches: async (): Promise<PublicCoach[]> => {
    const res = await apiFetch<ApiResponse<PublicCoach[]>>('/home-content/coaches');
    return res.data;
  },

  // --- Admin: content ---
  getHomeContent: async (): Promise<HomeContent> => {
    const res = await apiFetch<ApiResponse<HomeContent>>('/admin/home-content');
    return res.data;
  },

  updateHomeContent: async (req: UpdateHomeContentReq): Promise<HomeContent> => {
    const res = await apiFetch<ApiResponse<HomeContent>>('/admin/home-content', {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  // --- Admin: hero slides ---
  getSlides: async (): Promise<HeroSlide[]> => {
    const res = await apiFetch<ApiResponse<HeroSlide[]>>('/admin/home-content/slides');
    return res.data;
  },

  createSlide: async (req: CreateHeroSlideReq): Promise<HeroSlide> => {
    const res = await apiFetch<ApiResponse<HeroSlide>>('/admin/home-content/slides', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  updateSlide: async (id: number, req: UpdateHeroSlideReq): Promise<HeroSlide> => {
    const res = await apiFetch<ApiResponse<HeroSlide>>(`/admin/home-content/slides/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  deleteSlide: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/admin/home-content/slides/${id}`, {
      method: 'DELETE',
    });
  },

  reorderSlides: async (orderedIds: number[]): Promise<void> => {
    await apiFetch<{ message: string }>('/admin/home-content/reorder-slides', {
      method: 'PATCH',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
  },

  // --- Admin: coaches (เลือกโค้ชที่แสดงหน้าแรก) ---
  getAllCoaches: async (): Promise<PublicCoach[]> => {
    const res = await apiFetch<ApiResponse<PublicCoach[]>>('/admin/home-content/coaches');
    return res.data;
  },

  setCoachFeature: async (id: number, featureOnHome: boolean): Promise<PublicCoach> => {
    const res = await apiFetch<ApiResponse<PublicCoach>>(
      `/admin/home-content/coaches/${id}/feature`,
      {
        method: 'PATCH',
        body: JSON.stringify({ feature_on_home: featureOnHome }),
      }
    );
    return res.data;
  },

  // reuse pattern เดียวกับ announcementAPI.uploadImage — โพสต์ไป /upload พร้อม Bearer token
  uploadImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'home'); // รูปเนื้อหาหน้าแรก แยกเก็บไว้โฟลเดอร์ home

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

    const text = await response.text();
    let payload: { url?: string; error?: string; message?: string } | null = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      // แสดงข้อความ error จริงจาก backend เพื่อให้วินิจฉัยได้ (เช่น auth/Cloudinary)
      const message =
        payload?.error || payload?.message || `อัปโหลดไม่สำเร็จ (HTTP ${response.status})`;
      throw new Error(message);
    }

    if (!payload?.url) {
      throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับ URL กลับมาจากเซิร์ฟเวอร์');
    }

    return payload.url;
  },
};
