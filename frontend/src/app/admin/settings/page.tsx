'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { homeContentAPI } from '@/services/homeContentAPI';
import { HomeContent, HeroSlide, PublicCoach } from '@/types/homeContent';
import { MAX_UPLOAD_MB, validateImageSize } from '@/utils/imageUpload';
import {
  Images,
  Info,
  Heading,
  Users,
  Star,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Loader2,
  Save,
  ExternalLink,
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

  // about image upload state
  const [uploadingAbout, setUploadingAbout] = useState(false);
  const aboutFileRef = useRef<HTMLInputElement>(null);

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
        coaches_title: content.coaches_title,
        coaches_subtitle: content.coaches_subtitle,
        courses_title: content.courses_title,
        courses_subtitle: content.courses_subtitle,
        show_featured_reviews: content.show_featured_reviews,
        reviews_title: content.reviews_title,
        reviews_subtitle: content.reviews_subtitle,
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

  // ---------- About image ----------
  const handleAboutImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeError = validateImageSize(file);
    if (sizeError) {
      alert(sizeError);
      if (aboutFileRef.current) aboutFileRef.current.value = '';
      return;
    }
    try {
      setUploadingAbout(true);
      const url = await homeContentAPI.uploadImage(file);
      setField('about_image_url', url);
    } catch (error: any) {
      alert(`อัปโหลดรูปไม่สำเร็จ: ${error.message}`);
    } finally {
      setUploadingAbout(false);
      if (aboutFileRef.current) aboutFileRef.current.value = '';
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

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#CC0000]">
            <span className="h-px w-7 bg-[#CC0000]" />
            <span className="text-xs font-black uppercase tracking-[0.25em]">ตั้งค่าเว็บไซต์</span>
          </div>
          <h1 className="mt-2.5 text-3xl font-black tracking-tight text-gray-900">จัดการหน้าแรก</h1>
          <p className="mt-2 text-sm text-gray-500">
            แก้ไขเนื้อหาที่แสดงบนหน้าแรกสาธารณะ (หน้าที่ผู้เข้าชมเห็นก่อนเข้าสู่ระบบ)
          </p>
        </div>
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          <ExternalLink size={16} />
          ดูหน้าแรก
        </Link>
      </div>

      {/* ===== รูปสไลด์ ===== */}
      <SectionCard icon={<Images className="h-5 w-5 text-[#CC0000]" />} title="รูปสไลด์ (Hero Slider)"
        desc={`รูปภาพขนาดใหญ่ที่เลื่อนสลับด้านบนสุดของหน้าแรก แนะนำสัดส่วนแนวนอน (เช่น 1920×1080) — ขนาดไฟล์ไม่เกิน ${MAX_UPLOAD_MB} MB ต่อรูป`}>
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
      <SectionCard icon={<Info className="h-5 w-5 text-[#CC0000]" />} title="เกี่ยวกับเรา (About)"
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
          <Field label="รูปประกอบ">
            <div className="space-y-3">
              {content.about_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={content.about_image_url} alt="about" className="w-full h-40 object-cover rounded-xl border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                  <ImageIcon size={28} />
                </div>
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => aboutFileRef.current?.click()} disabled={uploadingAbout}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium">
                  {uploadingAbout ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                  {content.about_image_url ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                </button>
                {content.about_image_url && (
                  <button type="button" onClick={() => setField('about_image_url', '')}
                    className="text-sm text-red-500 hover:text-red-700">ลบรูป</button>
                )}
              </div>
              <p className="text-xs text-gray-400">ขนาดไฟล์ไม่เกิน {MAX_UPLOAD_MB} MB</p>
              <input type="file" accept="image/*" className="hidden" ref={aboutFileRef} onChange={handleAboutImage} />
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* ===== หัวข้อส่วนต่างๆ ===== */}
      <SectionCard icon={<Heading className="h-5 w-5 text-[#CC0000]" />} title="หัวข้อของแต่ละส่วน"
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
      <SectionCard icon={<Users className="h-5 w-5 text-[#CC0000]" />} title="เลือกบุคลากรที่แสดงหน้าแรก"
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
      <SectionCard icon={<Star className="h-5 w-5 text-[#CC0000]" />} title="เสียงจากผู้เรียน (รีวิว)"
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

      {/* Save bar */}
      <div className="sticky bottom-4 flex justify-end">
        <button onClick={handleSaveContent} disabled={savingContent}
          className="flex items-center gap-2 rounded-xl bg-[#CC0000] px-6 py-3 font-bold text-white shadow-lg shadow-[#CC0000]/25 hover:bg-[#990000] transition-colors disabled:opacity-50">
          {savingContent ? <Loader2 size={18} className="animate-spin" /> : savedFlash ? <Check size={18} /> : <Save size={18} />}
          {savingContent ? 'กำลังบันทึก...' : savedFlash ? 'บันทึกแล้ว' : 'บันทึกการเปลี่ยนแปลง'}
        </button>
      </div>
    </div>
  );
}

// ---------- helpers ----------
function SectionCard({
  icon, title, desc, children,
}: {
  icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0F0]">{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          {desc && <p className="text-sm text-gray-500 mt-0.5">{desc}</p>}
        </div>
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
