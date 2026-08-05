import { apiFetch } from './apiClient';
import { Review, UpdateReviewReq, CreateReviewReq, CourseCoach } from '../types/review';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

export const reviewAPI = {
  // Public — รีวิวที่ถูกเลือกให้แสดงหน้าแรก
  getFeaturedReviews: async (): Promise<Review[]> => {
    const res = await apiFetch<ApiResponse<Review[]>>('/reviews/featured');
    return res.data;
  },

  // Customer — ส่งรีวิว (customer_id ผูกกับ JWT ฝั่ง backend)
  createReview: async (req: CreateReviewReq): Promise<Review> => {
    const res = await apiFetch<ApiResponse<Review>>('/reviews', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  // Customer — รีวิวทั้งหมดของตัวเอง
  getMyReviews: async (): Promise<Review[]> => {
    const res = await apiFetch<ApiResponse<Review[]>>('/reviews/me');
    return res.data;
  },

  // Customer — โค้ชที่สอนในคอร์ส (ไว้เลือกรีวิวโค้ช)
  getCourseCoaches: async (courseId: number): Promise<CourseCoach[]> => {
    const res = await apiFetch<ApiResponse<CourseCoach[]>>(`/reviews/courses/${courseId}/coaches`);
    return res.data;
  },

  // Coach — รีวิวที่ลูกค้ารีวิวถึงโค้ชที่ล็อกอินอยู่ (coach_id ผูกกับ JWT)
  getCoachReviews: async (): Promise<Review[]> => {
    const res = await apiFetch<ApiResponse<Review[]>>('/coaches/me/reviews');
    return res.data;
  },

  // Admin — รีวิวทั้งหมด
  getAllReviews: async (): Promise<Review[]> => {
    const res = await apiFetch<ApiResponse<Review[]>>('/admin/reviews');
    return res.data;
  },

  // Admin — แก้ไขคะแนน/ข้อความ
  updateReview: async (id: number, req: UpdateReviewReq): Promise<Review> => {
    const res = await apiFetch<ApiResponse<Review>>(`/admin/reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
    return res.data;
  },

  // Admin — เลือก/ยกเลิกการแสดงรีวิวในหน้าแรก
  setFeatured: async (id: number, isFeatured: boolean): Promise<Review> => {
    const res = await apiFetch<ApiResponse<Review>>(`/admin/reviews/${id}/feature`, {
      method: 'PATCH',
      body: JSON.stringify({ is_featured: isFeatured }),
    });
    return res.data;
  },

  // Admin — ลบรีวิว
  deleteReview: async (id: number): Promise<void> => {
    await apiFetch<{ message: string }>(`/admin/reviews/${id}`, {
      method: 'DELETE',
    });
  },
};
