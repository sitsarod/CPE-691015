import { HomeContent, HeroSlide, PublicCoach } from '@/types/homeContent';
import { SectionId } from './useHomeContentDraft';

export type SectionGroup = 'content' | 'legal';

export interface SectionMeta {
  id: SectionId;
  number: string; // '01'
  label: string; // ป้ายในสารบัญ
  title: string; // หัวข้อในแผงแก้ไข (ไทย)
  subtitle?: string; // ชื่ออังกฤษ inline
  group: SectionGroup;
}

// เรียงตามดีไซน์ 1b
export const SECTIONS: SectionMeta[] = [
  { id: 'hero', number: '01', label: 'แบนเนอร์ (Hero)', title: 'แบนเนอร์บนสุด', subtitle: 'Hero', group: 'content' },
  { id: 'slides', number: '02', label: 'รูปสไลด์', title: 'รูปสไลด์แบนเนอร์', subtitle: 'Slides', group: 'content' },
  { id: 'about', number: '03', label: 'เกี่ยวกับเรา', title: 'เกี่ยวกับเรา', subtitle: 'About', group: 'content' },
  { id: 'courses', number: '04', label: 'คอร์ส & โค้ช', title: 'คอร์ส & โค้ช', subtitle: 'Courses & Coaches', group: 'content' },
  { id: 'coaches', number: '05', label: 'บุคลากรที่แสดง', title: 'บุคลากรที่แสดงบนหน้าแรก', subtitle: 'Coaches', group: 'content' },
  { id: 'facility', number: '06', label: 'ภาพบรรยากาศ', title: 'ภาพบรรยากาศ', subtitle: 'Facility', group: 'content' },
  { id: 'faq', number: '07', label: 'คำถามที่พบบ่อย', title: 'คำถามที่พบบ่อย', subtitle: 'FAQ', group: 'content' },
  { id: 'reviews', number: '08', label: 'รีวิว', title: 'เสียงจากผู้เรียน', subtitle: 'Reviews', group: 'content' },
  { id: 'cta', number: '09', label: 'CTA ท้ายหน้า', title: 'ข้อความชวนสมัคร (ท้ายหน้า)', subtitle: 'CTA', group: 'content' },
  { id: 'social', number: '10', label: 'โซเชียลมีเดีย', title: 'โซเชียลมีเดีย', subtitle: 'Social', group: 'legal' },
  { id: 'contact', number: '11', label: 'ข้อมูลติดต่อ', title: 'ข้อมูลติดต่อ (ท้ายหน้า)', subtitle: 'Contact', group: 'legal' },
  { id: 'legal', number: '12', label: 'เอกสารทางกฎหมาย', title: 'เอกสารทางกฎหมาย', subtitle: 'Legal', group: 'legal' },
];

export const SOCIAL_KEYS: (keyof HomeContent)[] = [
  'facebook_url',
  'instagram_url',
  'tiktok_url',
  'youtube_url',
  'line_url',
];

const isFilled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

// ป้ายนับ/สถานะด้านขวาของแถวสารบัญ (นับสด). warn = ใช้โทนเตือน (amber)
export function sectionChip(
  sid: SectionId,
  draft: HomeContent,
  slides: HeroSlide[],
  coaches: PublicCoach[]
): { text: string | null; warn?: boolean } {
  switch (sid) {
    case 'slides':
      return { text: String(slides.length) };
    case 'coaches':
      return { text: `${coaches.filter((c) => c.feature_on_home).length} / ${coaches.length}` };
    case 'facility':
      return { text: String((draft.facility_tiles ?? []).length) };
    case 'faq':
      return { text: String((draft.faq_items ?? []).length) };
    case 'reviews':
      return { text: draft.show_featured_reviews ? 'เปิด' : 'ปิด' };
    case 'social':
      return { text: `${SOCIAL_KEYS.filter((k) => isFilled(draft[k])).length} / 5` };
    case 'legal': {
      const empty = !isFilled(draft.privacy_policy) && !isFilled(draft.terms_of_service);
      return empty ? { text: 'ว่าง', warn: true } : { text: null };
    }
    default:
      return { text: null };
  }
}

// บรรทัดอธิบายใต้ชื่อหมวด (ใช้ในลิสต์มือถือ)
export function sectionHint(
  sid: SectionId,
  draft: HomeContent,
  slides: HeroSlide[],
  coaches: PublicCoach[]
): string {
  switch (sid) {
    case 'hero':
      return 'หัวเรื่อง คำอธิบาย และสถิติ';
    case 'slides':
      return `แสดงอยู่ ${slides.filter((s) => s.is_active).length} จาก ${slides.length} รูป`;
    case 'about':
      return 'ข้อความและแผนที่';
    case 'courses':
      return 'หัวข้อ หมายเหตุ และสถิติ';
    case 'coaches':
      return `เลือกแล้ว ${coaches.filter((c) => c.feature_on_home).length} จาก ${coaches.length} คน`;
    case 'facility':
      return `${(draft.facility_tiles ?? []).length} ช่องภาพ`;
    case 'faq': {
      const items = draft.faq_items ?? [];
      const noAns = items.filter((f) => !f.answer.trim()).length;
      return noAns > 0 ? `${items.length} คำถาม · ${noAns} ยังไม่มีคำตอบ` : `${items.length} คำถาม`;
    }
    case 'reviews':
      return draft.show_featured_reviews ? 'แสดงส่วนรีวิวบนหน้าแรก' : 'ซ่อนส่วนรีวิว';
    case 'cta':
      return 'ข้อความชวนสมัครท้ายหน้า';
    case 'social':
      return `ใส่ลิงก์แล้ว ${SOCIAL_KEYS.filter((k) => isFilled(draft[k])).length} จาก 5 ช่อง`;
    case 'contact':
      return 'ที่อยู่ โทร อีเมล เวลาทำการ';
    case 'legal': {
      const p = isFilled(draft.privacy_policy);
      const t = isFilled(draft.terms_of_service);
      if (!p && !t) return 'ยังไม่ได้กรอกทั้ง 2 ฉบับ';
      if (p && t) return 'กรอกครบทั้ง 2 ฉบับ';
      return 'ยังกรอกไม่ครบ';
    }
    default:
      return '';
  }
}
