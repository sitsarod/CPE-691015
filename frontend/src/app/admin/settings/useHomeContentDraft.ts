'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { homeContentAPI } from '@/services/homeContentAPI';
import { HomeContent, PublicCoach, HeroSlide, UpdateHomeContentReq } from '@/types/homeContent';

import { useGlobalToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
// ---- คีย์ของแต่ละหมวด (ใช้ diff draft vs saved เพื่อหา "จุดที่แก้ยังไม่บันทึก") ----
// เฉพาะ field ที่อยู่ใน content blob (สไลด์/โค้ชบันทึกทันที ไม่นับรวม)
export type SectionId =
  | 'hero'
  | 'slides'
  | 'about'
  | 'courses'
  | 'coaches'
  | 'facility'
  | 'faq'
  | 'reviews'
  | 'cta'
  | 'social'
  | 'contact'
  | 'legal';

export const SECTION_FIELDS: Record<SectionId, (keyof HomeContent)[]> = {
  hero: ['hero_eyebrow', 'hero_headline', 'hero_subtext', 'hero_stats'],
  slides: [], // จัดการแยก (บันทึกทันที)
  about: ['about_title', 'about_content', 'about_image_url', 'map_embed_url'],
  courses: [
    'courses_title',
    'courses_subtitle',
    'courses_footnote',
    'coaches_title',
    'coaches_subtitle',
    'coach_stats',
  ],
  coaches: [], // จัดการแยก (บันทึกทันที)
  facility: ['facility_title', 'facility_subtitle', 'facility_tiles'],
  faq: ['faq_items'],
  reviews: ['show_featured_reviews', 'reviews_title', 'reviews_subtitle'],
  cta: ['footer_cta_title', 'footer_cta_subtitle'],
  social: ['facebook_url', 'instagram_url', 'tiktok_url', 'youtube_url', 'line_url'],
  contact: ['school_name', 'contact_address', 'contact_phone', 'contact_email', 'opening_hours'],
  legal: ['privacy_policy', 'terms_of_service'],
};

// เทียบค่าแบบ deep (พอสำหรับ string/boolean/array ของ object ตื้น ๆ)
const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  const na = a === '' || a === null || a === undefined;
  const nb = b === '' || b === null || b === undefined;
  if (na && nb) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  return false;
};

// สร้าง payload สำหรับ PATCH จาก draft (whitelist + ส่ง [] เมื่อ array ว่างเพื่อล้างค่า)
const toUpdateReq = (c: HomeContent): UpdateHomeContentReq => ({
  about_title: c.about_title,
  about_content: c.about_content,
  about_image_url: c.about_image_url,
  map_embed_url: c.map_embed_url,
  coaches_title: c.coaches_title,
  coaches_subtitle: c.coaches_subtitle,
  courses_title: c.courses_title,
  courses_subtitle: c.courses_subtitle,
  show_featured_reviews: c.show_featured_reviews,
  reviews_title: c.reviews_title,
  reviews_subtitle: c.reviews_subtitle,
  facebook_url: c.facebook_url,
  instagram_url: c.instagram_url,
  tiktok_url: c.tiktok_url,
  youtube_url: c.youtube_url,
  line_url: c.line_url,
  school_name: c.school_name,
  contact_address: c.contact_address,
  contact_phone: c.contact_phone,
  contact_email: c.contact_email,
  opening_hours: c.opening_hours,
  privacy_policy: c.privacy_policy,
  terms_of_service: c.terms_of_service,
  hero_eyebrow: c.hero_eyebrow,
  hero_headline: c.hero_headline,
  hero_subtext: c.hero_subtext,
  courses_footnote: c.courses_footnote,
  facility_title: c.facility_title,
  facility_subtitle: c.facility_subtitle,
  footer_cta_title: c.footer_cta_title,
  footer_cta_subtitle: c.footer_cta_subtitle,
  hero_stats: c.hero_stats ?? [],
  coach_stats: c.coach_stats ?? [],
  facility_tiles: c.facility_tiles ?? [],
  faq_items: c.faq_items ?? [],
});

export interface UseHomeContentDraft {
  loading: boolean;
  saving: boolean;
  savedFlash: boolean;
  // content blob (แก้ในเครื่องจนกด "บันทึก")
  saved: HomeContent | null;
  draft: HomeContent | null;
  setField: <K extends keyof HomeContent>(key: K, value: HomeContent[K]) => void;
  dirtyBySection: Record<SectionId, boolean>;
  unsavedCount: number; // จำนวนหมวดที่แก้ยังไม่บันทึก
  save: () => Promise<void>;
  // สไลด์ (บันทึกทันที)
  slides: HeroSlide[];
  uploadingSlide: boolean;
  uploadSlide: (file: File) => Promise<void>;
  toggleSlide: (slide: HeroSlide) => Promise<void>;
  deleteSlide: (slide: HeroSlide) => Promise<void>;
  moveSlide: (index: number, dir: -1 | 1) => Promise<void>;
  setSlideFocal: (id: number, x: number, y: number) => Promise<void>;
  setSlideZoom: (id: number, zoom: number) => Promise<void>;
  // โค้ช (บันทึกทันที)
  coaches: PublicCoach[];
  toggleCoach: (coach: PublicCoach) => Promise<void>;
  setHeadCoach: (coach: PublicCoach) => Promise<void>;
}

export function useHomeContentDraft(): UseHomeContentDraft {
  const showToast = useGlobalToast();
  const confirmAction = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [saved, setSaved] = useState<HomeContent | null>(null);
  const [draft, setDraft] = useState<HomeContent | null>(null);

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [uploadingSlide, setUploadingSlide] = useState(false);
  const [coaches, setCoaches] = useState<PublicCoach[]>([]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [c, co, sl] = await Promise.all([
        homeContentAPI.getHomeContent(),
        homeContentAPI.getAllCoaches(),
        homeContentAPI.getSlides(),
      ]);
      setSaved(c);
      setDraft(c);
      // backend ส่ง list ว่างเป็น null — กัน .filter/.length ในหน้า settings พังตอนยังไม่มีสไลด์/โค้ช
      setCoaches(co ?? []);
      setSlides(sl ?? []);
    } catch (error) {
      console.error('โหลดข้อมูลหน้าแรกไม่สำเร็จ:', error);
      showToast('ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อ', "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const setField = useCallback(<K extends keyof HomeContent>(key: K, value: HomeContent[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const dirtyBySection = useMemo(() => {
    const out = {} as Record<SectionId, boolean>;
    (Object.keys(SECTION_FIELDS) as SectionId[]).forEach((sid) => {
      out[sid] =
        !!saved &&
        !!draft &&
        SECTION_FIELDS[sid].some((f) => !isEqual(draft[f], saved[f]));
    });
    return out;
  }, [saved, draft]);

  const unsavedCount = useMemo(
    () => Object.values(dirtyBySection).filter(Boolean).length,
    [dirtyBySection]
  );

  const save = useCallback(async () => {
    if (!draft) return;
    try {
      setSaving(true);
      const updated = await homeContentAPI.updateHomeContent(toUpdateReq(draft));
      setSaved(updated);
      setDraft(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (error) {
      showToast(`บันทึกไม่สำเร็จ: ${(error as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, showToast]);

  // ---------- สไลด์ (บันทึกทันที) ----------
  const uploadSlide = useCallback(
    async (file: File) => {
      try {
        setUploadingSlide(true);
        const image_url = await homeContentAPI.uploadImage(file);
        const created = await homeContentAPI.createSlide({ image_url, sort_order: slides.length });
        setSlides((prev) => [...prev, created]);
      } catch (error) {
        showToast(`อัปโหลดรูปไม่สำเร็จ: ${(error as Error).message}`, "error");
      } finally {
        setUploadingSlide(false);
      }
    },
    [slides.length, showToast]
  );

  const toggleSlide = useCallback(async (slide: HeroSlide) => {
    try {
      const updated = await homeContentAPI.updateSlide(slide.id, { is_active: !slide.is_active });
      setSlides((prev) => prev.map((s) => (s.id === slide.id ? updated : s)));
    } catch (error) {
      showToast(`อัปเดตไม่สำเร็จ: ${(error as Error).message}`, "error");
    }
  }, [showToast]);

  // ตั้งจุดโฟกัสของสไลด์ (0-100) — อัปเดต local ทันทีให้ preview ลื่น แล้วค่อยยิง API
  // เรียกตอน "ปล่อยเมาส์" ครั้งเดียว ไม่ใช่ทุก pixel ระหว่างลาก จึงไม่ถล่ม API
  const setSlideFocal = useCallback(
    async (id: number, x: number, y: number) => {
      const fx = Math.round(Math.min(100, Math.max(0, x)));
      const fy = Math.round(Math.min(100, Math.max(0, y)));
      let prev: HeroSlide | undefined;
      setSlides((list) =>
        list.map((s) => {
          if (s.id === id) prev = s;
          return s.id === id ? { ...s, focal_x: fx, focal_y: fy } : s;
        })
      );
      try {
        const updated = await homeContentAPI.updateSlide(id, { focal_x: fx, focal_y: fy });
        setSlides((list) => list.map((s) => (s.id === id ? updated : s)));
      } catch (error) {
        // ย้อนค่ากลับถ้าบันทึกไม่สำเร็จ
        if (prev) setSlides((list) => list.map((s) => (s.id === id ? prev! : s)));
        alert(`บันทึกจุดโฟกัสไม่สำเร็จ: ${(error as Error).message}`);
      }
    },
    []
  );

  // ตั้งระดับซูมของสไลด์ (100-300 = 1x-3x) — อัปเดต local ทันทีให้ preview ลื่น แล้วค่อยยิง API
  // เรียกตอน "ปล่อยแถบเลื่อน" ครั้งเดียว ไม่ใช่ทุกก้าวระหว่างลาก จึงไม่ถล่ม API
  const setSlideZoom = useCallback(
    async (id: number, zoom: number) => {
      const z = Math.round(Math.min(300, Math.max(100, zoom)));
      let prev: HeroSlide | undefined;
      setSlides((list) =>
        list.map((s) => {
          if (s.id === id) prev = s;
          return s.id === id ? { ...s, zoom: z } : s;
        })
      );
      try {
        const updated = await homeContentAPI.updateSlide(id, { zoom: z });
        setSlides((list) => list.map((s) => (s.id === id ? updated : s)));
      } catch (error) {
        // ย้อนค่ากลับถ้าบันทึกไม่สำเร็จ
        if (prev) setSlides((list) => list.map((s) => (s.id === id ? prev! : s)));
        alert(`บันทึกระดับซูมไม่สำเร็จ: ${(error as Error).message}`);
      }
    },
    []
  );

  const deleteSlide = useCallback(async (slide: HeroSlide) => {
    if (!(await confirmAction({ message: 'ลบรูปสไลด์นี้?', tone: 'danger' }))) return;
    try {
      await homeContentAPI.deleteSlide(slide.id);
      setSlides((prev) => prev.filter((s) => s.id !== slide.id));
    } catch (error) {
      showToast(`ลบไม่สำเร็จ: ${(error as Error).message}`, "error");
    }
  }, [confirmAction, showToast]);

  const moveSlide = useCallback(
    async (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= slides.length) return;
      const reordered = [...slides];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      setSlides(reordered);
      try {
        await homeContentAPI.reorderSlides(reordered.map((s) => s.id));
      } catch (error) {
        showToast(`จัดลำดับไม่สำเร็จ: ${(error as Error).message}`, "error");
        loadAll();
      }
    },
    [slides, loadAll, showToast]
  );

  // ---------- โค้ช (บันทึกทันที) ----------
  const toggleCoach = useCallback(async (coach: PublicCoach) => {
    try {
      const updated = await homeContentAPI.setCoachFeature(coach.id, !coach.feature_on_home);
      setCoaches((prev) => prev.map((c) => (c.id === coach.id ? updated : c)));
    } catch (error) {
      showToast(`อัปเดตไม่สำเร็จ: ${(error as Error).message}`, "error");
    }
  }, [showToast]);

  // ⚠️ ตั้งหัวหน้าคนใหม่ = backend ปลดคนเดิมให้เอง จึงต้องล้างธงของทุกคนในฝั่ง UI ด้วย
  // ถ้าอัปเดตเฉพาะแถวที่กด หน้าจอจะโชว์หัวหน้าโค้ชสองคนจนกว่าจะรีโหลด
  const setHeadCoach = useCallback(async (coach: PublicCoach) => {
    const next = !coach.is_head_coach;
    try {
      const updated = await homeContentAPI.setHeadCoach(coach.id, next);
      setCoaches((prev) =>
        prev.map((c) =>
          c.id === coach.id ? updated : next ? { ...c, is_head_coach: false } : c
        )
      );
    } catch (error) {
      showToast(`อัปเดตไม่สำเร็จ: ${(error as Error).message}`, "error");
    }
  }, [showToast]);

  return {
    loading,
    saving,
    savedFlash,
    saved,
    draft,
    setField,
    dirtyBySection,
    unsavedCount,
    save,
    slides,
    uploadingSlide,
    uploadSlide,
    toggleSlide,
    deleteSlide,
    moveSlide,
    setSlideFocal,
    setSlideZoom,
    coaches,
    toggleCoach,
    setHeadCoach,
  };
}
