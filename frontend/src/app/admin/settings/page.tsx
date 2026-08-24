'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { homeContentAPI } from '@/services/homeContentAPI';
import { HomeContent, HeroSlide, PublicCoach } from '@/types/homeContent';
import { MAX_UPLOAD_MB, validateImageSize } from '@/utils/imageUpload';
import {
  Users,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MapPin,
  Loader2,
  Check,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<HomeContent | null>(null);
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [coaches, setCoaches] = useState<PublicCoach[]>([]);

  // content form state
  const [savingContent, setSavingContent] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // slide upload state
  const [uploadingSlide, setUploadingSlide] = useState(false);
  const slideFileRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [c, s, co] = await Promise.all([
        homeContentAPI.getHomeContent(),
        homeContentAPI.getSlides(),
        homeContentAPI.getAllCoaches(),
      ]);
      setContent(c);
      setSlides(s);
      setCoaches(co);
    } catch (error) {
      console.error('โหลดข้อมูลหน้าแรกไม่สำเร็จ:', error);
      alert('ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อ');
    } finally {
      setLoading(false);
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

  // ---------- Hero slides ----------
  const handleAddSlide = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeError = validateImageSize(file);
    if (sizeError) {
      alert(sizeError);
      if (slideFileRef.current) slideFileRef.current.value = '';
      return;
    }
    try {
      setUploadingSlide(true);
      const url = await homeContentAPI.uploadImage(file);
      const created = await homeContentAPI.createSlide({
        image_url: url,
        sort_order: slides.length,
      });
      setSlides((prev) => [...prev, created]);
    } catch (error: any) {
      alert(`เพิ่มรูปสไลด์ไม่สำเร็จ: ${error.message}`);
    } finally {
      setUploadingSlide(false);
      if (slideFileRef.current) slideFileRef.current.value = '';
    }
  };

  const handleDeleteSlide = async (id: number) => {
    if (!window.confirm('ต้องการลบรูปสไลด์นี้หรือไม่?')) return;
    try {
      await homeContentAPI.deleteSlide(id);
      setSlides((prev) => prev.filter((s) => s.id !== id));
    } catch (error: any) {
      alert(`ลบไม่สำเร็จ: ${error.message}`);
    }
  };

  const handleToggleSlideActive = async (slide: HeroSlide) => {
    try {
      const updated = await homeContentAPI.updateSlide(slide.id, { is_active: !slide.is_active });
      setSlides((prev) => prev.map((s) => (s.id === slide.id ? updated : s)));
    } catch (error: any) {
      alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
    }
  };

  const handleUpdateCaption = async (slide: HeroSlide, caption: string) => {
    if (caption === slide.caption) return;
    try {
      const updated = await homeContentAPI.updateSlide(slide.id, { caption });
      setSlides((prev) => prev.map((s) => (s.id === slide.id ? updated : s)));
    } catch (error: any) {
      alert(`อัปเดตคำบรรยายไม่สำเร็จ: ${error.message}`);
    }
  };

  const moveSlide = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSlides(reordered);
    try {
      await homeContentAPI.reorderSlides(reordered.map((s) => s.id));
    } catch (error: any) {
      alert(`จัดลำดับไม่สำเร็จ: ${error.message}`);
      loadAll();
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

      {/* ===== รูปสไลด์ ===== */}
      <SectionCard title="รูปสไลด์ (Hero Slider)"
        desc={`รูปภาพขนาดใหญ่ที่เลื่อนสลับด้านบนสุดของหน้าแรก — แสดงเป็นแบนเนอร์สัดส่วน 16:9 ควรอัปแนวนอน 1920×1080 พิกเซล (16:9) เพื่อให้พอดีแบนเนอร์และเห็นรูปเต็มทั้งภาพทุกขนาดจอ ขนาดไฟล์ไม่เกิน ${MAX_UPLOAD_MB} MB ต่อรูป`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {slides.map((slide, index) => (
            <div key={slide.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slide.image_url} alt={slide.caption || `slide ${index + 1}`}
                  className="w-full h-40 object-cover" />
                {!slide.is_active && (
                  <span className="absolute top-2 left-2 rounded-full bg-gray-900/70 text-white text-xs px-2 py-0.5">
                    ซ่อนอยู่
                  </span>
                )}
                <span className="absolute top-2 right-2 rounded-full bg-white/90 text-gray-700 text-xs font-bold px-2 py-0.5">
                  #{index + 1}
                </span>
              </div>
              <div className="p-3 space-y-3">
                <input
                  type="text"
                  defaultValue={slide.caption}
                  onBlur={(e) => handleUpdateCaption(slide, e.target.value)}
                  placeholder="คำบรรยาย (ไม่บังคับ)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveSlide(index, -1)} disabled={index === 0}
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed" title="เลื่อนขึ้น">
                      <ArrowUp size={16} />
                    </button>
                    <button onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1}
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed" title="เลื่อนลง">
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleSlideActive(slide)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        slide.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {slide.is_active ? 'แสดงอยู่' : 'ซ่อนอยู่'}
                    </button>
                    <button onClick={() => handleDeleteSlide(slide.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50" title="ลบ">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* ปุ่มเพิ่มรูป */}
          <button
            type="button"
            onClick={() => slideFileRef.current?.click()}
            disabled={uploadingSlide}
            className="flex flex-col items-center justify-center gap-2 h-full min-h-[220px] rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-[#CC0000] hover:text-[#CC0000] transition-colors disabled:opacity-50"
          >
            {uploadingSlide ? <Loader2 className="h-8 w-8 animate-spin" /> : <Plus className="h-8 w-8" />}
            <span className="text-sm font-medium">{uploadingSlide ? 'กำลังอัปโหลด...' : 'เพิ่มรูปสไลด์'}</span>
          </button>
          <input type="file" accept="image/*" className="hidden" ref={slideFileRef} onChange={handleAddSlide} />
        </div>
        {slides.length === 0 && (
          <p className="mt-3 text-xs text-gray-400">ยังไม่มีรูปสไลด์ — หน้าแรกจะใช้รูปเริ่มต้นชั่วคราวจนกว่าจะเพิ่มรูป</p>
        )}
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
