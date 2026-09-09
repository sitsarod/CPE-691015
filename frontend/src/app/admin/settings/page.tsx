'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { homeContentAPI } from '@/services/homeContentAPI';
import { HomeContent, PublicCoach, StatItem, FacilityTile, FaqItem, HeroSlide } from '@/types/homeContent';
import {
  Users,
  MapPin,
  Loader2,
  Check,
  Plus,
  Trash2,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<HomeContent | null>(null);
  const [coaches, setCoaches] = useState<PublicCoach[]>([]);

  // content form state
  const [savingContent, setSavingContent] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // รูปสไลด์ hero (จัดการแยกจากประกาศ)
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [uploadingSlide, setUploadingSlide] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [c, co, sl] = await Promise.all([
        homeContentAPI.getHomeContent(),
        homeContentAPI.getAllCoaches(),
        homeContentAPI.getSlides(),
      ]);
      setContent(c);
      setCoaches(co);
      setSlides(sl);
    } catch (error) {
      console.error('โหลดข้อมูลหน้าแรกไม่สำเร็จ:', error);
      alert('ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Hero slides ----------
  // อัปโหลดรูปใหม่ → สร้างสไลด์ต่อท้าย (active ทันที)
  const handleUploadSlide = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // เคลียร์เพื่อให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    try {
      setUploadingSlide(true);
      const image_url = await homeContentAPI.uploadImage(file);
      const created = await homeContentAPI.createSlide({ image_url, sort_order: slides.length });
      setSlides((prev) => [...prev, created]);
    } catch (error) {
      alert(`อัปโหลดรูปไม่สำเร็จ: ${(error as Error).message}`);
    } finally {
      setUploadingSlide(false);
    }
  };

  // เปิด/ปิดการแสดงสไลด์บนหน้าแรก
  const handleToggleSlide = async (slide: HeroSlide) => {
    try {
      const updated = await homeContentAPI.updateSlide(slide.id, { is_active: !slide.is_active });
      setSlides((prev) => prev.map((s) => (s.id === slide.id ? updated : s)));
    } catch (error) {
      alert(`อัปเดตไม่สำเร็จ: ${(error as Error).message}`);
    }
  };

  const handleDeleteSlide = async (slide: HeroSlide) => {
    if (!confirm('ลบรูปสไลด์นี้?')) return;
    try {
      await homeContentAPI.deleteSlide(slide.id);
      setSlides((prev) => prev.filter((s) => s.id !== slide.id));
    } catch (error) {
      alert(`ลบไม่สำเร็จ: ${(error as Error).message}`);
    }
  };

  // สลับลำดับกับเพื่อนบ้าน แล้วบันทึกลำดับใหม่ (optimistic)
  const handleMoveSlide = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSlides(reordered);
    try {
      await homeContentAPI.reorderSlides(reordered.map((s) => s.id));
    } catch (error) {
      alert(`จัดลำดับไม่สำเร็จ: ${(error as Error).message}`);
      loadAll(); // ดึงลำดับจริงกลับมาเมื่อพลาด
    }
  };

  const setField = <K extends keyof HomeContent>(key: K, value: HomeContent[K]) => {
    setContent((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSaveContent = async () => {
    if (!content) return;
    try {
      setSavingContent(true);
      const updated = await homeContentAPI.updateHomeContent({
        about_title: content.about_title,
        about_content: content.about_content,
        about_image_url: content.about_image_url,
        map_embed_url: content.map_embed_url,
        coaches_title: content.coaches_title,
        coaches_subtitle: content.coaches_subtitle,
        courses_title: content.courses_title,
        courses_subtitle: content.courses_subtitle,
        show_featured_reviews: content.show_featured_reviews,
        reviews_title: content.reviews_title,
        reviews_subtitle: content.reviews_subtitle,
        facebook_url: content.facebook_url,
        instagram_url: content.instagram_url,
        tiktok_url: content.tiktok_url,
        youtube_url: content.youtube_url,
        line_url: content.line_url,
        school_name: content.school_name,
        contact_address: content.contact_address,
        contact_phone: content.contact_phone,
        contact_email: content.contact_email,
        opening_hours: content.opening_hours,
        privacy_policy: content.privacy_policy,
        terms_of_service: content.terms_of_service,
        // เนื้อหาหลักหน้าแรก
        hero_eyebrow: content.hero_eyebrow,
        hero_headline: content.hero_headline,
        hero_subtext: content.hero_subtext,
        courses_footnote: content.courses_footnote,
        coaches_note: content.coaches_note,
        facility_title: content.facility_title,
        facility_subtitle: content.facility_subtitle,
        footer_cta_title: content.footer_cta_title,
        footer_cta_subtitle: content.footer_cta_subtitle,
        // ข้อมูลชุดซ้ำ (ส่ง [] เมื่อว่างเพื่อล้างค่า)
        hero_stats: content.hero_stats ?? [],
        coach_stats: content.coach_stats ?? [],
        facility_tiles: content.facility_tiles ?? [],
        faq_items: content.faq_items ?? [],
      });
      setContent(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (error: any) {
      alert(`บันทึกไม่สำเร็จ: ${error.message}`);
    } finally {
      setSavingContent(false);
    }
  };

  // ---------- Coaches ----------
  const handleToggleCoach = async (coach: PublicCoach) => {
    try {
      const updated = await homeContentAPI.setCoachFeature(coach.id, !coach.feature_on_home);
      setCoaches((prev) => prev.map((c) => (c.id === coach.id ? updated : c)));
    } catch (error: any) {
      alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
    }
  };

  if (loading || !content) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-[#CC0000]" />
      </div>
    );
  }

  // แผนที่: รองรับทั้ง src ตรงๆ และการวาง <iframe .../> ทั้งก้อน แล้วดึง src มาพรีวิว
  const rawMap = content.map_embed_url?.trim() ?? '';
  const mapPreviewSrc = rawMap.includes('<iframe')
    ? rawMap.match(/src="([^"]+)"/i)?.[1] ?? ''
    : rawMap;
  const showMapPreview = mapPreviewSrc.startsWith('http');

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">จัดการหน้าแรก</h1>
        <p className="mt-2 text-sm text-gray-500">
          แก้ไขเนื้อหาที่แสดงบนหน้าแรกสาธารณะ (หน้าที่ผู้เข้าชมเห็นก่อนเข้าสู่ระบบ)
        </p>
      </div>

      {/* ===== รูปสไลด์ Hero (จัดการแยกจากประกาศ) ===== */}
      <SectionCard title="รูปสไลด์แบนเนอร์ (Hero)"
        desc="รูปสไลด์บนสุดของหน้าแรก — อัปโหลด จัดลำดับ เปิด/ปิด และลบได้ที่นี่ (แยกจากประกาศข่าวสาร)">
        <div className="space-y-4">
          {/* ปุ่มอัปโหลด */}
          <label className={`inline-flex items-center gap-2 rounded-xl border border-dashed border-[#CC0000]/40 bg-[#FFF6F6] px-5 py-3 text-sm font-medium text-[#CC0000] transition-colors hover:bg-[#FFECEC] ${uploadingSlide ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
            {uploadingSlide ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            {uploadingSlide ? 'กำลังอัปโหลด...' : 'เพิ่มรูปสไลด์'}
            <input type="file" accept="image/*" onChange={handleUploadSlide} disabled={uploadingSlide} className="hidden" />
          </label>

          {slides.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีรูปสไลด์ — หน้าแรกจะใช้รูปเริ่มต้นจนกว่าจะเพิ่มรูป</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {slides.map((slide, i) => (
                <div key={slide.id}
                  className={`group relative overflow-hidden rounded-xl border ${slide.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                  {/* รูปตัวอย่าง */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slide.image_url} alt={`สไลด์ ${i + 1}`} className="aspect-video w-full object-cover bg-gray-100" />

                  {/* ป้ายสถานะ/ลำดับ */}
                  <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                    #{i + 1}{!slide.is_active && ' · ซ่อนอยู่'}
                  </span>

                  {/* แถบเครื่องมือ */}
                  <div className="flex items-center justify-between gap-1 border-t border-gray-100 bg-white px-2 py-2">
                    <div className="flex items-center gap-1">
                      <IconBtn label="เลื่อนขึ้น" disabled={i === 0} onClick={() => handleMoveSlide(i, -1)}>
                        <ArrowUp size={16} />
                      </IconBtn>
                      <IconBtn label="เลื่อนลง" disabled={i === slides.length - 1} onClick={() => handleMoveSlide(i, 1)}>
                        <ArrowDown size={16} />
                      </IconBtn>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconBtn label={slide.is_active ? 'ซ่อนจากหน้าแรก' : 'แสดงบนหน้าแรก'} onClick={() => handleToggleSlide(slide)}>
                        {slide.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      </IconBtn>
                      <IconBtn label="ลบ" danger onClick={() => handleDeleteSlide(slide)}>
                        <Trash2 size={16} />
                      </IconBtn>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ===== เกี่ยวกับเรา ===== */}
      <SectionCard title="เกี่ยวกับเรา (About)"
        desc="ข้อมูลแนะนำโรงเรียน/ธุรกิจของคุณ">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Field label="หัวข้อ">
              <input type="text" value={content.about_title}
                onChange={(e) => setField('about_title', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
            <Field label="เนื้อหา">
              <textarea rows={6} value={content.about_content}
                onChange={(e) => setField('about_content', e.target.value)}
                placeholder="เล่าเกี่ยวกับโรงเรียน วิสัยทัศน์ จุดเด่น..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
            </Field>
          </div>
          <Field label="แผนที่ที่ตั้ง (Google Maps)">
            <div className="space-y-3">
              {showMapPreview ? (
                <iframe src={mapPreviewSrc} title="แผนที่ที่ตั้ง"
                  className="w-full h-40 rounded-xl border border-gray-200" loading="lazy" />
              ) : (
                <div className="w-full h-40 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                  <MapPin size={28} />
                </div>
              )}
              <textarea rows={4} value={content.map_embed_url}
                onChange={(e) => setField('map_embed_url', e.target.value)}
                placeholder='วางลิงก์ฝังจาก Google Maps ที่นี่ (วาง src หรือทั้งก้อน <iframe ...>)'
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
              {content.map_embed_url && (
                <button type="button" onClick={() => setField('map_embed_url', '')}
                  className="text-sm text-red-500 hover:text-red-700">ลบแผนที่</button>
              )}
              <p className="text-xs text-gray-400">
                Google Maps → ปุ่ม “แชร์” → “ฝังแผนที่” → คัดลอกโค้ด แล้วนำมาวางที่นี่
              </p>
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* ===== ลิงก์โซเชียลมีเดีย ===== */}
      <SectionCard title="ลิงก์โซเชียลมีเดีย"
        desc="ใส่ลิงก์ช่องทางโซเชียลของคุณ — เว้นว่างช่องไหน ระบบจะไม่แสดงไอคอนช่องนั้นบนหน้าแรก (แสดงทั้งส่วนเกี่ยวกับเราและท้ายหน้า)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Facebook">
            <input type="url" value={content.facebook_url}
              onChange={(e) => setField('facebook_url', e.target.value)}
              placeholder="https://facebook.com/yourpage"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="Instagram">
            <input type="url" value={content.instagram_url}
              onChange={(e) => setField('instagram_url', e.target.value)}
              placeholder="https://instagram.com/youraccount"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="TikTok">
            <input type="url" value={content.tiktok_url}
              onChange={(e) => setField('tiktok_url', e.target.value)}
              placeholder="https://tiktok.com/@youraccount"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="YouTube">
            <input type="url" value={content.youtube_url}
              onChange={(e) => setField('youtube_url', e.target.value)}
              placeholder="https://youtube.com/@yourchannel"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="LINE">
            <input type="url" value={content.line_url}
              onChange={(e) => setField('line_url', e.target.value)}
              placeholder="https://line.me/ti/p/~yourid หรือ URL กลุ่ม/OA"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
        </div>
      </SectionCard>

      {/* ===== ข้อมูลติดต่อ (footer) ===== */}
      <SectionCard title="ข้อมูลติดต่อ (ท้ายหน้า)"
        desc="ข้อมูลที่แสดงในส่วนท้ายหน้า (footer) ของหน้าแรก — เว้นว่างช่องไหน จะไม่แสดงบรรทัดนั้น">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="ชื่อโรงเรียน / ธุรกิจ">
            <input type="text" value={content.school_name}
              onChange={(e) => setField('school_name', e.target.value)}
              placeholder="เช่น Koyama Badminton School"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="เบอร์โทร">
            <input type="tel" value={content.contact_phone}
              onChange={(e) => setField('contact_phone', e.target.value)}
              placeholder="เช่น 02-123-4567"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="อีเมล">
            <input type="email" value={content.contact_email}
              onChange={(e) => setField('contact_email', e.target.value)}
              placeholder="เช่น info@example.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="เวลาทำการ">
            <textarea rows={3} value={content.opening_hours}
              onChange={(e) => setField('opening_hours', e.target.value)}
              placeholder="เช่น จันทร์–ศุกร์ 10:00–20:00&#10;เสาร์–อาทิตย์ 09:00–18:00"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
          </Field>
          <div className="md:col-span-2">
            <Field label="ที่อยู่">
              <textarea rows={3} value={content.contact_address}
                onChange={(e) => setField('contact_address', e.target.value)}
                placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* ===== เอกสารทางกฎหมาย ===== */}
      <SectionCard title="เอกสารทางกฎหมาย"
        desc="เนื้อหานโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งาน — แสดงเป็นหน้าแยก (/privacy, /terms) และมีลิงก์ท้ายหน้า เว้นว่างไว้ = ไม่แสดงลิงก์นั้น">
        <div className="space-y-6">
          <Field label="นโยบายความเป็นส่วนตัว (PDPA)">
            <textarea rows={8} value={content.privacy_policy}
              onChange={(e) => setField('privacy_policy', e.target.value)}
              placeholder="อธิบายว่าเก็บข้อมูลอะไร ใช้ทำอะไร เก็บนานแค่ไหน สิทธิของเจ้าของข้อมูล และช่องทางติดต่อ..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-y" />
          </Field>
          <Field label="ข้อกำหนดการใช้งาน (Terms of Service)">
            <textarea rows={8} value={content.terms_of_service}
              onChange={(e) => setField('terms_of_service', e.target.value)}
              placeholder="เงื่อนไขการใช้บริการ สิทธิและหน้าที่ของผู้ใช้ การชำระเงิน การยกเลิก ฯลฯ..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-y" />
          </Field>
          <p className="text-xs text-gray-400">
            หมายเหตุ: นโยบายการเก็บ “ข้อมูลใบหน้า” (PDPA) มีระบบแยกเฉพาะตอนลงทะเบียนใบหน้าอยู่แล้ว
            ส่วนช่องนี้เป็นนโยบายความเป็นส่วนตัวภาพรวมของเว็บไซต์
          </p>
        </div>
      </SectionCard>

      {/* ===== หัวข้อส่วนต่างๆ ===== */}
      <SectionCard title="หัวข้อของแต่ละส่วน"
        desc="ข้อความหัวข้อและคำโปรยของส่วนบุคลากรและคอร์สเรียนบนหน้าแรก">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-sm font-bold text-gray-700">ส่วนบุคลากร</p>
            <Field label="หัวข้อ">
              <input type="text" value={content.coaches_title}
                onChange={(e) => setField('coaches_title', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
            <Field label="คำโปรย">
              <input type="text" value={content.coaches_subtitle}
                onChange={(e) => setField('coaches_subtitle', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
          </div>
          <div className="space-y-4">
            <p className="text-sm font-bold text-gray-700">ส่วนคอร์สเรียน</p>
            <Field label="หัวข้อ">
              <input type="text" value={content.courses_title}
                onChange={(e) => setField('courses_title', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
            <Field label="คำโปรย">
              <input type="text" value={content.courses_subtitle}
                onChange={(e) => setField('courses_subtitle', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* ===== Hero (แบนเนอร์บนสุด) ===== */}
      <SectionCard title="แบนเนอร์บนสุด (Hero)"
        desc="ข้อความที่ทับอยู่บนรูปสไลด์บนสุดของหน้าแรก">
        <div className="space-y-4">
          <Field label="ข้อความเล็กด้านบน (eyebrow)">
            <input type="text" value={content.hero_eyebrow}
              onChange={(e) => setField('hero_eyebrow', e.target.value)}
              placeholder="เช่น สำหรับผู้ปกครอง · เปิดสอนตั้งแต่ปี 2562"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="หัวเรื่องใหญ่ (ขึ้นบรรทัดใหม่ = Enter)">
            <textarea rows={2} value={content.hero_headline}
              onChange={(e) => setField('hero_headline', e.target.value)}
              placeholder={"พื้นฐานที่ถูกต้อง\nสำคัญกว่าชนะเร็ว"}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
          </Field>
          <Field label="คำอธิบายใต้หัวเรื่อง">
            <textarea rows={3} value={content.hero_subtext}
              onChange={(e) => setField('hero_subtext', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
          </Field>
          <Field label="สถิติใต้แบนเนอร์ (ตัวเลข + คำอธิบาย)">
            <StatListEditor items={content.hero_stats} onChange={(v) => setField('hero_stats', v)} />
          </Field>
        </div>
      </SectionCard>

      {/* ===== ข้อความคอร์ส & โค้ช ===== */}
      <SectionCard title="ข้อความส่วนคอร์ส & โค้ช"
        desc="หมายเหตุใต้ตารางคอร์ส สถิติและข้อความปิดท้ายส่วนโค้ช">
        <div className="space-y-4">
          <Field label="หมายเหตุใต้ตารางคอร์ส">
            <input type="text" value={content.courses_footnote}
              onChange={(e) => setField('courses_footnote', e.target.value)}
              placeholder="เช่น รวมค่าคอร์ทและลูกขนไก่ · ยืมไม้ฟรีตลอดคอร์ส"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="ข้อความปิดท้ายส่วนโค้ช">
            <input type="text" value={content.coaches_note}
              onChange={(e) => setField('coaches_note', e.target.value)}
              placeholder="เช่น โค้ชทุกคนผ่านการตรวจประวัติ..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
          <Field label="สถิติส่วนโค้ช (ตัวเลข + คำอธิบาย)">
            <StatListEditor items={content.coach_stats} onChange={(v) => setField('coach_stats', v)} />
          </Field>
        </div>
      </SectionCard>

      {/* ===== ภาพบรรยากาศ ===== */}
      <SectionCard title="ภาพบรรยากาศ (สนาม)"
        desc="หัวข้อและช่องภาพในส่วนภาพบรรยากาศ — ช่อง 'กว้าง' จะกินพื้นที่ใหญ่/สูง 2 แถวบนจอใหญ่">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="หัวข้อ">
              <input type="text" value={content.facility_title}
                onChange={(e) => setField('facility_title', e.target.value)}
                placeholder="เช่น ภาพบรรยากาศ"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
            <Field label="คำโปรย (อังกฤษ)">
              <input type="text" value={content.facility_subtitle}
                onChange={(e) => setField('facility_subtitle', e.target.value)}
                placeholder="เช่น Facility"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
          </div>
          <Field label="ช่องภาพ">
            <TileListEditor items={content.facility_tiles} onChange={(v) => setField('facility_tiles', v)} />
          </Field>
        </div>
      </SectionCard>

      {/* ===== คำถามที่พบบ่อย ===== */}
      <SectionCard title="คำถามที่พบบ่อย (FAQ)"
        desc="รายการคำถาม–คำตอบที่แสดงในส่วน FAQ ของหน้าแรก">
        <FaqListEditor items={content.faq_items} onChange={(v) => setField('faq_items', v)} />
      </SectionCard>

      {/* ===== CTA ท้ายหน้า ===== */}
      <SectionCard title="ข้อความชวนสมัคร (ท้ายหน้า)"
        desc="หัวข้อและคำโปรยของแถบชวนสมัครในส่วนท้ายหน้า (footer)">
        <div className="space-y-4">
          <Field label="หัวข้อ (ขึ้นบรรทัดใหม่ = Enter)">
            <textarea rows={2} value={content.footer_cta_title}
              onChange={(e) => setField('footer_cta_title', e.target.value)}
              placeholder={"พร้อมเริ่มเรียน\nกับเราแล้วหรือยัง?"}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none resize-none" />
          </Field>
          <Field label="คำโปรย">
            <input type="text" value={content.footer_cta_subtitle}
              onChange={(e) => setField('footer_cta_subtitle', e.target.value)}
              placeholder="เช่น ทดลองเรียนฟรี 1 ครั้ง ไม่มีข้อผูกมัด"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
          </Field>
        </div>
      </SectionCard>

      {/* ===== บุคลากร ===== */}
      <SectionCard title="เลือกบุคลากรที่แสดงหน้าแรก"
        desc="ติ๊กเลือกโค้ชที่ต้องการโชว์ในส่วนบุคลากร (ดึงข้อมูลจริงจากระบบ)">
        {coaches.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีข้อมูลโค้ชในระบบ</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {coaches.map((coach) => {
              const name = coach.nickname || [coach.firstName, coach.lastName].filter(Boolean).join(' ') || `โค้ช #${coach.id}`;
              return (
                <button key={coach.id} onClick={() => handleToggleCoach(coach)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    coach.feature_on_home ? 'border-[#CC0000] bg-[#FFF0F0]' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                  {coach.profile_picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coach.profile_picture} alt={name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
                      <Users size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 truncate">{name}</p>
                    <p className="text-xs text-gray-500 truncate">{coach.specialization || '—'}</p>
                  </div>
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                    coach.feature_on_home ? 'bg-[#CC0000] text-white' : 'border border-gray-300'
                  }`}>
                    {coach.feature_on_home && <Check size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ===== รีวิว featured ===== */}
      <SectionCard title="เสียงจากผู้เรียน (รีวิว)"
        desc="แสดงรีวิวที่คุณเลือกไว้ให้ขึ้นหน้าแรก">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={content.show_featured_reviews}
            onChange={(e) => setField('show_featured_reviews', e.target.checked)}
            className="w-5 h-5 accent-[#CC0000]" />
          <span className="text-sm font-medium text-gray-700">แสดงส่วนรีวิวบนหน้าแรก</span>
        </label>
        {content.show_featured_reviews && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="หัวข้อ">
              <input type="text" value={content.reviews_title}
                onChange={(e) => setField('reviews_title', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
            <Field label="คำโปรย">
              <input type="text" value={content.reviews_subtitle}
                onChange={(e) => setField('reviews_subtitle', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none" />
            </Field>
          </div>
        )}
        <p className="mt-4 text-xs text-gray-500">
          เลือกว่าจะให้รีวิวไหนแสดงหน้าแรกได้ที่หน้า{' '}
          <Link href="/admin/feedback" className="text-[#CC0000] font-medium hover:underline">จัดการคำติชม</Link>
        </p>
      </SectionCard>

      {/* แถบปุ่มลอย: ดูหน้าแรก + บันทึก */}
      <div className="sticky bottom-6 z-10 flex justify-end">
        <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200/80 bg-white/80 p-1.5 shadow-xl shadow-black/10 backdrop-blur-md">
          <Link
            href="/"
            target="_blank"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            ดูหน้าแรก
          </Link>
          <button
            onClick={handleSaveContent}
            disabled={savingContent}
            className="min-w-[180px] rounded-xl bg-[#CC0000] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-[#CC0000]/30 transition-all hover:bg-[#990000] hover:shadow-lg hover:shadow-[#CC0000]/30 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {savingContent ? 'กำลังบันทึก...' : savedFlash ? 'บันทึกแล้ว' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------
function SectionCard({
  title, desc, children,
}: {
  title: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {desc && <p className="text-sm text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ปุ่มเพิ่มแถวในตัวแก้ไขรายการ (ใช้ร่วมทุก editor)
function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[#CC0000] hover:text-[#990000] transition-colors">
      <Plus size={16} /> {label}
    </button>
  );
}

// ปุ่มไอคอนเล็ก (ใช้ในแถบเครื่องมือของรูปสไลด์)
function IconBtn({
  children, label, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`grid place-items-center w-8 h-8 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? 'text-gray-500 hover:bg-red-50 hover:text-red-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}>
      {children}
    </button>
  );
}

// ปุ่มลบแถว
function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="ลบแถว"
      className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
      <Trash2 size={16} />
    </button>
  );
}

const editorInputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none';

// ตัวแก้ไขรายการสถิติ (value + label) — ใช้กับ hero_stats และ coach_stats
function StatListEditor({
  items, onChange,
}: {
  items: StatItem[] | null | undefined;
  onChange: (v: StatItem[]) => void;
}) {
  const list = items ?? [];
  const update = (i: number, key: keyof StatItem, value: string) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  return (
    <div className="space-y-2">
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="text" value={it.value} placeholder="ตัวเลข เช่น 100%"
            onChange={(e) => update(i, 'value', e.target.value)}
            className={`${editorInputClass} w-32 flex-shrink-0`} />
          <input type="text" value={it.label} placeholder="คำอธิบาย เช่น มีใบรับรอง"
            onChange={(e) => update(i, 'label', e.target.value)}
            className={editorInputClass} />
          <RemoveRowButton onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowButton onClick={() => onChange([...list, { value: '', label: '' }])} label="เพิ่มสถิติ" />
    </div>
  );
}

// ตัวแก้ไขช่องภาพบรรยากาศ (label + wide)
function TileListEditor({
  items, onChange,
}: {
  items: FacilityTile[] | null | undefined;
  onChange: (v: FacilityTile[]) => void;
}) {
  const list = items ?? [];
  const update = (i: number, patch: Partial<FacilityTile>) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-2">
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="text" value={it.label} placeholder="ชื่อภาพ เช่น คอร์ทหลัก มุมกว้าง"
            onChange={(e) => update(i, { label: e.target.value })}
            className={editorInputClass} />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap select-none">
            <input type="checkbox" checked={!!it.wide}
              onChange={(e) => update(i, { wide: e.target.checked })}
              className="w-4 h-4 accent-[#CC0000]" />
            กว้าง
          </label>
          <RemoveRowButton onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowButton onClick={() => onChange([...list, { label: '', wide: false }])} label="เพิ่มช่องภาพ" />
    </div>
  );
}

// ตัวแก้ไขคำถามที่พบบ่อย (question + answer)
function FaqListEditor({
  items, onChange,
}: {
  items: FaqItem[] | null | undefined;
  onChange: (v: FaqItem[]) => void;
}) {
  const list = items ?? [];
  const update = (i: number, key: keyof FaqItem, value: string) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  return (
    <div className="space-y-3">
      {list.map((it, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-gray-200 p-3">
          <div className="flex-1 space-y-2">
            <input type="text" value={it.question} placeholder="คำถาม"
              onChange={(e) => update(i, 'question', e.target.value)}
              className={`${editorInputClass} font-medium`} />
            <textarea rows={2} value={it.answer} placeholder="คำตอบ"
              onChange={(e) => update(i, 'answer', e.target.value)}
              className={`${editorInputClass} resize-none`} />
          </div>
          <RemoveRowButton onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowButton onClick={() => onChange([...list, { question: '', answer: '' }])} label="เพิ่มคำถาม" />
    </div>
  );
}
