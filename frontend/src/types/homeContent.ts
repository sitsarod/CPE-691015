// ระบบจัดการเนื้อหาหน้าแรกสาธารณะ (Landing Page CMS)

export interface HeroSlide {
  id: number;
  image_url: string;
  caption: string;
  link_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface PublicCoach {
  id: number;
  firstName: string;
  lastName: string;
  nickname: string;
  specialization: string;
  profile_picture: string;
  feature_on_home: boolean;
}

export interface HomeContent {
  id: number;
  about_title: string;
  about_content: string;
  about_image_url: string;
  coaches_title: string;
  coaches_subtitle: string;
  courses_title: string;
  courses_subtitle: string;
  show_featured_reviews: boolean;
  reviews_title: string;
  reviews_subtitle: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  line_url: string;
  updated_at: string;
}

// ก้อนข้อมูลรวมที่หน้าแรกสาธารณะดึงในครั้งเดียว
export interface PublicHome {
  content: HomeContent;
  slides: HeroSlide[];
  featured_coaches: PublicCoach[];
}

export interface UpdateHomeContentReq {
  about_title?: string;
  about_content?: string;
  about_image_url?: string;
  coaches_title?: string;
  coaches_subtitle?: string;
  courses_title?: string;
  courses_subtitle?: string;
  show_featured_reviews?: boolean;
  reviews_title?: string;
  reviews_subtitle?: string;
  facebook_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  line_url?: string;
}

export interface CreateHeroSlideReq {
  image_url: string;
  caption?: string;
  link_url?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateHeroSlideReq {
  image_url?: string;
  caption?: string;
  link_url?: string;
  sort_order?: number;
  is_active?: boolean;
}
