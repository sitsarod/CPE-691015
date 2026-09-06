export interface Category {
  id: number;
  name: string;
}

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

// ใครเห็นประกาศนี้ได้บ้าง: "all" = ทุกคน, "guest" = เฉพาะผู้เยี่ยมชมที่ยังไม่ล็อกอิน,
// "member" = เฉพาะสมาชิกที่ล็อกอินแล้ว
export type AnnouncementVisibility = 'all' | 'guest' | 'member';

export interface Announcement {
  id: number;
  title: string;
  content: string;
  image_url: string;
  link?: string;
  visibility: AnnouncementVisibility;
  user_id: number;
  user?: User;
  category_id: number;
  category?: Category;
  start_date: string;
  end_date: string;
  view_count: number;
  created_at: string;
  updated_at: string;
}

// user_id ไม่ต้องส่งแล้ว — backend ดึงจาก JWT ของแอดมินที่ล็อกอินอยู่เอง
export interface CreateAnnouncementReq {
  title: string;
  content: string;
  image_url: string;
  link?: string;
  visibility?: AnnouncementVisibility;
  category_id: number;
  start_date: string;
  end_date: string;
}

export interface UpdateAnnouncementReq {
  title?: string;
  content?: string;
  image_url?: string;
  link?: string;
  visibility?: AnnouncementVisibility;
  category_id?: number;
  start_date?: string;
  end_date?: string;
}

export interface CreateCategoryReq {
  name: string;
}

export interface UpdateCategoryReq {
  name: string;
}
