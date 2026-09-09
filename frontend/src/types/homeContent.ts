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
  coach_license: string;
  profile_picture: string;
  home_image: string; // รูปการ์ดโค้ชหน้าแรก (แอดมินตั้งเอง)
  bio: string; // รายละเอียดเพิ่มเติม แสดงตอนคลิกโค้ชในหน้าแรก
  feature_on_home: boolean;
}

// ข้อมูลชุดซ้ำที่แก้ผ่าน CMS (เก็บเป็น JSON array ฝั่ง backend)
export interface StatItem {
  value: string;
  label: string;
}

export interface FacilityTile {
  label: string;
  wide?: boolean;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface HomeContent {
  id: number;
  about_title: string;
  about_content: string;
  about_image_url: string;
  map_embed_url: string;
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
  school_name: string;
  contact_address: string;
  contact_phone: string;
  contact_email: string;
  opening_hours: string;
  privacy_policy: string;
  terms_of_service: string;

  // เนื้อหาหลักหน้าแรก (แก้ผ่าน /admin/settings)
  hero_eyebrow: string;
  hero_headline: string;
  hero_subtext: string;
  courses_footnote: string;
  coaches_note: string;
  facility_title: string;
  facility_subtitle: string;
  footer_cta_title: string;
  footer_cta_subtitle: string;

  // ข้อมูลชุดซ้ำ (อาจเป็น null จาก backend เมื่อยังไม่ตั้งค่า)
  hero_stats: StatItem[] | null;
  coach_stats: StatItem[] | null;
  facility_tiles: FacilityTile[] | null;
  faq_items: FaqItem[] | null;

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
  map_embed_url?: string;
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
  school_name?: string;
  contact_address?: string;
  contact_phone?: string;
  contact_email?: string;
  opening_hours?: string;
  privacy_policy?: string;
  terms_of_service?: string;

  // เนื้อหาหลักหน้าแรก
  hero_eyebrow?: string;
  hero_headline?: string;
  hero_subtext?: string;
  courses_footnote?: string;
  coaches_note?: string;
  facility_title?: string;
  facility_subtitle?: string;
  footer_cta_title?: string;
  footer_cta_subtitle?: string;

  // ข้อมูลชุดซ้ำ
  hero_stats?: StatItem[];
  coach_stats?: StatItem[];
  facility_tiles?: FacilityTile[];
  faq_items?: FaqItem[];
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
