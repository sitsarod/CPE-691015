'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MapPin, ImagePlus, Loader2, X } from 'lucide-react';
import { HomeContent, HeroSlide, PublicCoach } from '@/types/homeContent';
import { homeContentAPI } from '@/services/homeContentAPI';
import { SectionId } from '../useHomeContentDraft';
import { SectionMeta } from '../registry';
import { Field, SectionHeader, inputClass } from './primitives';
import {
  StatListEditor,
  TileListEditor,
  FaqListEditor,
  SlideGrid,
  CoachGrid,
} from './editors';
import { HeroPreview } from './HeroPreview';

export interface SectionCtx {
  draft: HomeContent;
  setField: <K extends keyof HomeContent>(key: K, value: HomeContent[K]) => void;
  dirtyBySection: Record<SectionId, boolean>;
  slides: HeroSlide[];
  uploadingSlide: boolean;
  uploadSlide: (file: File) => void;
  toggleSlide: (slide: HeroSlide) => void;
  deleteSlide: (slide: HeroSlide) => void;
  moveSlide: (index: number, dir: -1 | 1) => void;
  coaches: PublicCoach[];
  toggleCoach: (coach: PublicCoach) => void;
}

const UnsavedChip = () => (
  <span className="flex-none rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11.5px] font-medium text-amber-600 whitespace-nowrap">
    แก้ไขแล้ว ยังไม่บันทึก
  </span>
);

// ---- อัปโหลดรูปภาพประกอบ (แทนการวางลิงก์) ----
function ImageUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleImage = async (file: File) => {
    try {
      setUploading(true);
      const url = await homeContentAPI.uploadImage(file);
      onChange(url);
    } catch (error) {
      alert(`อัปโหลดรูปไม่สำเร็จ: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <label
        className={`relative flex h-24 w-40 flex-none items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-colors hover:border-[#CC0000] ${
          uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'
        }`}
        title="อัปโหลด/เปลี่ยนรูป"
      >
        {uploading ? (
          <Loader2 size={20} className="animate-spin text-[#CC0000]" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="รูปภาพประกอบ" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-gray-400">
            <ImagePlus size={22} />
            <span className="text-xs">เลือกรูป</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) handleImage(f);
          }}
        />
      </label>
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-gray-400">JPG / PNG · อัปโหลดจากเครื่อง</p>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
          >
            <X size={14} /> ลบรูป
          </button>
        )}
      </div>
    </div>
  );
}

// ---- แต่ละหมวด (ส่วนหัวมาจาก meta) ----
function HeaderFor(meta: SectionMeta, right?: React.ReactNode) {
  return <SectionHeader number={meta.number} title={meta.title} subtitle={meta.subtitle} right={right} />;
}

export function SectionBody({ meta, ctx }: { meta: SectionMeta; ctx: SectionCtx }) {
  const { draft, setField } = ctx;

  switch (meta.id) {
    // 01 · Hero
    case 'hero':
      return (
        <>
          {HeaderFor(meta, ctx.dirtyBySection.hero ? <UnsavedChip /> : undefined)}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
            <div className="space-y-5">
              <Field label="ข้อความเล็กด้านบน (eyebrow)">
                <input
                  type="text"
                  value={draft.hero_eyebrow}
                  onChange={(e) => setField('hero_eyebrow', e.target.value)}
                  placeholder="เช่น สำหรับผู้ปกครอง · เปิดสอนตั้งแต่ปี 2562"
                  className={inputClass}
                />
              </Field>
              <Field label="หัวเรื่องใหญ่" hint="Enter = ขึ้นบรรทัดใหม่">
                <textarea
                  rows={2}
                  value={draft.hero_headline}
                  onChange={(e) => setField('hero_headline', e.target.value)}
                  placeholder={'พื้นฐานที่ถูกต้อง\nสำคัญกว่าชนะเร็ว'}
                  className={`${inputClass} resize-none leading-relaxed`}
                />
              </Field>
              <Field label="คำอธิบายใต้หัวเรื่อง">
                <textarea
                  rows={3}
                  value={draft.hero_subtext}
                  onChange={(e) => setField('hero_subtext', e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </Field>
              <Field label="สถิติใต้แบนเนอร์ (ตัวเลข + คำอธิบาย)">
                <StatListEditor
                  items={draft.hero_stats}
                  onChange={(v) => setField('hero_stats', v)}
                />
              </Field>
            </div>
            <HeroPreview draft={draft} slides={ctx.slides} />
          </div>
        </>
      );

    // 02 · Slides
    case 'slides':
      return (
        <>
          {HeaderFor(
            meta,
            <span className="text-[12.5px] text-gray-500 whitespace-nowrap">
              แสดงอยู่ {ctx.slides.filter((s) => s.is_active).length} จาก {ctx.slides.length} รูป
            </span>
          )}
          <SlideGrid
            slides={ctx.slides}
            uploading={ctx.uploadingSlide}
            onUpload={ctx.uploadSlide}
            onToggle={ctx.toggleSlide}
            onDelete={ctx.deleteSlide}
            onMove={ctx.moveSlide}
          />
        </>
      );

    // 03 · About
    case 'about': {
      const rawMap = draft.map_embed_url?.trim() ?? '';
      const mapSrc = rawMap.includes('<iframe') ? rawMap.match(/src="([^"]+)"/i)?.[1] ?? '' : rawMap;
      const showMap = mapSrc.startsWith('http');
      return (
        <>
          {HeaderFor(meta)}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <Field label="หัวข้อ">
                <input
                  type="text"
                  value={draft.about_title}
                  onChange={(e) => setField('about_title', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="เนื้อหา">
                <textarea
                  rows={6}
                  value={draft.about_content}
                  onChange={(e) => setField('about_content', e.target.value)}
                  placeholder="เล่าเกี่ยวกับโรงเรียน วิสัยทัศน์ จุดเด่น..."
                  className={`${inputClass} resize-none`}
                />
              </Field>
              <Field label="รูปภาพประกอบ">
                <ImageUploadField
                  value={draft.about_image_url}
                  onChange={(url) => setField('about_image_url', url)}
                />
              </Field>
            </div>
            <Field label="แผนที่ที่ตั้ง (Google Maps)">
              <div className="space-y-3">
                {showMap ? (
                  <iframe
                    src={mapSrc}
                    title="แผนที่ที่ตั้ง"
                    className="h-40 w-full rounded-xl border border-gray-200"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-300">
                    <MapPin size={28} />
                  </div>
                )}
                <textarea
                  rows={4}
                  value={draft.map_embed_url}
                  onChange={(e) => setField('map_embed_url', e.target.value)}
                  placeholder="วาง src หรือทั้งก้อน <iframe ...> จาก Google Maps"
                  className={`${inputClass} px-3 py-2 text-xs resize-none`}
                />
                {draft.map_embed_url && (
                  <button
                    type="button"
                    onClick={() => setField('map_embed_url', '')}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    ลบแผนที่
                  </button>
                )}
                <p className="text-xs text-gray-400">
                  Google Maps → “แชร์” → “ฝังแผนที่” → คัดลอกโค้ด แล้วนำมาวางที่นี่
                </p>
              </div>
            </Field>
          </div>
        </>
      );
    }

    // 04 · Courses & Coaches (ข้อความ)
    case 'courses':
      return (
        <>
          {HeaderFor(meta, ctx.dirtyBySection.courses ? <UnsavedChip /> : undefined)}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-700">ส่วนคอร์สเรียน</p>
              <Field label="หัวข้อ">
                <input type="text" value={draft.courses_title} onChange={(e) => setField('courses_title', e.target.value)} className={inputClass} />
              </Field>
              <Field label="คำโปรย">
                <input type="text" value={draft.courses_subtitle} onChange={(e) => setField('courses_subtitle', e.target.value)} className={inputClass} />
              </Field>
              <Field label="หมายเหตุใต้ตารางคอร์ส">
                <input
                  type="text"
                  value={draft.courses_footnote}
                  onChange={(e) => setField('courses_footnote', e.target.value)}
                  placeholder="เช่น รวมค่าคอร์ทและลูกขนไก่ · ยืมไม้ฟรีตลอดคอร์ส"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-700">ส่วนโค้ช</p>
              <Field label="หัวข้อ">
                <input type="text" value={draft.coaches_title} onChange={(e) => setField('coaches_title', e.target.value)} className={inputClass} />
              </Field>
              <Field label="คำโปรย">
                <input type="text" value={draft.coaches_subtitle} onChange={(e) => setField('coaches_subtitle', e.target.value)} className={inputClass} />
              </Field>
              <Field label="ข้อความปิดท้ายส่วนโค้ช">
                <input
                  type="text"
                  value={draft.coaches_note}
                  onChange={(e) => setField('coaches_note', e.target.value)}
                  placeholder="เช่น โค้ชทุกคนผ่านการตรวจประวัติ..."
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
          <div className="mt-6">
            <Field label="สถิติส่วนโค้ช (ตัวเลข + คำอธิบาย)">
              <StatListEditor items={draft.coach_stats} onChange={(v) => setField('coach_stats', v)} />
            </Field>
          </div>
        </>
      );

    // 05 · Coaches (เลือกแสดง)
    case 'coaches':
      return (
        <>
          {HeaderFor(
            meta,
            <span className="text-[12.5px] text-gray-500 whitespace-nowrap">
              เลือกแล้ว {ctx.coaches.filter((c) => c.feature_on_home).length} จาก {ctx.coaches.length} คน
            </span>
          )}
          <p className="-mt-2 mb-5 max-w-[66ch] text-[13.5px] leading-relaxed text-gray-500">
            ดึงข้อมูลโค้ชจริงจากระบบ · โค้ชเป็นจุดขายหลักของหน้าแรก คนที่เลือกไว้จะแสดงพร้อมประวัติและใบรับรอง
          </p>
          <CoachGrid coaches={ctx.coaches} onToggle={ctx.toggleCoach} />
        </>
      );

    // 06 · Facility
    case 'facility':
      return (
        <>
          {HeaderFor(meta)}
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field label="หัวข้อ">
                <input type="text" value={draft.facility_title} onChange={(e) => setField('facility_title', e.target.value)} placeholder="เช่น ภาพบรรยากาศ" className={inputClass} />
              </Field>
              <Field label="คำโปรย (อังกฤษ)">
                <input type="text" value={draft.facility_subtitle} onChange={(e) => setField('facility_subtitle', e.target.value)} placeholder="เช่น Facility" className={inputClass} />
              </Field>
            </div>
            <Field label="ช่องภาพ — อัปโหลดรูปจริงได้ หรือใส่แค่ชื่อ (ช่อง 'กว้าง' จะกินพื้นที่ใหญ่บนจอใหญ่)">
              <TileListEditor items={draft.facility_tiles} onChange={(v) => setField('facility_tiles', v)} />
            </Field>
          </div>
        </>
      );

    // 07 · FAQ
    case 'faq':
      return (
        <>
          {HeaderFor(meta)}
          <FaqListEditor items={draft.faq_items} onChange={(v) => setField('faq_items', v)} />
        </>
      );

    // 08 · Reviews
    case 'reviews':
      return (
        <>
          {HeaderFor(meta)}
          <label className="flex cursor-pointer select-none items-center gap-3">
            <input
              type="checkbox"
              checked={draft.show_featured_reviews}
              onChange={(e) => setField('show_featured_reviews', e.target.checked)}
              className="h-5 w-5 accent-[#CC0000]"
            />
            <span className="text-sm font-medium text-gray-700">แสดงส่วนรีวิวบนหน้าแรก</span>
          </label>
          {draft.show_featured_reviews && (
            <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field label="หัวข้อ">
                <input type="text" value={draft.reviews_title} onChange={(e) => setField('reviews_title', e.target.value)} className={inputClass} />
              </Field>
              <Field label="คำโปรย">
                <input type="text" value={draft.reviews_subtitle} onChange={(e) => setField('reviews_subtitle', e.target.value)} className={inputClass} />
              </Field>
            </div>
          )}
          <p className="mt-5 text-xs text-gray-500">
            เลือกว่าจะให้รีวิวไหนแสดงหน้าแรกได้ที่หน้า{' '}
            <Link href="/admin/feedback" className="font-medium text-[#CC0000] hover:underline">
              จัดการคำติชม
            </Link>
          </p>
        </>
      );

    // 09 · CTA
    case 'cta':
      return (
        <>
          {HeaderFor(meta)}
          <div className="space-y-4">
            <Field label="หัวข้อ" hint="Enter = ขึ้นบรรทัดใหม่">
              <textarea
                rows={2}
                value={draft.footer_cta_title}
                onChange={(e) => setField('footer_cta_title', e.target.value)}
                placeholder={'พร้อมเริ่มเรียน\nกับเราแล้วหรือยัง?'}
                className={`${inputClass} resize-none`}
              />
            </Field>
            <Field label="คำโปรย">
              <input
                type="text"
                value={draft.footer_cta_subtitle}
                onChange={(e) => setField('footer_cta_subtitle', e.target.value)}
                placeholder="เช่น ทดลองเรียนฟรี 1 ครั้ง ไม่มีข้อผูกมัด"
                className={inputClass}
              />
            </Field>
          </div>
        </>
      );

    // 10 · Social
    case 'social': {
      const socialFields: { key: keyof HomeContent; label: string; placeholder: string }[] = [
        { key: 'facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
        { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/youraccount' },
        { key: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@youraccount' },
        { key: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
        { key: 'line_url', label: 'LINE', placeholder: 'https://line.me/ti/p/~yourid' },
      ];
      return (
        <>
          {HeaderFor(meta)}
          <p className="-mt-2 mb-5 text-[13.5px] text-gray-500">
            เว้นว่างช่องไหน ระบบจะไม่แสดงไอคอนช่องนั้นบนหน้าแรก
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {socialFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type="url"
                  value={draft[f.key] as string}
                  onChange={(e) => setField(f.key, e.target.value as HomeContent[typeof f.key])}
                  placeholder={f.placeholder}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </>
      );
    }

    // 11 · Contact
    case 'contact':
      return (
        <>
          {HeaderFor(meta)}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label="ชื่อโรงเรียน / ธุรกิจ">
              <input type="text" value={draft.school_name} onChange={(e) => setField('school_name', e.target.value)} placeholder="เช่น Koyama Badminton School" className={inputClass} />
            </Field>
            <Field label="เบอร์โทร">
              <input type="tel" value={draft.contact_phone} onChange={(e) => setField('contact_phone', e.target.value)} placeholder="เช่น 02-123-4567" className={inputClass} />
            </Field>
            <Field label="อีเมล">
              <input type="email" value={draft.contact_email} onChange={(e) => setField('contact_email', e.target.value)} placeholder="เช่น info@example.com" className={inputClass} />
            </Field>
            <Field label="เวลาทำการ">
              <textarea rows={3} value={draft.opening_hours} onChange={(e) => setField('opening_hours', e.target.value)} placeholder={'จันทร์–ศุกร์ 10:00–20:00\nเสาร์–อาทิตย์ 09:00–18:00'} className={`${inputClass} resize-none`} />
            </Field>
            <div className="md:col-span-2">
              <Field label="ที่อยู่">
                <textarea rows={3} value={draft.contact_address} onChange={(e) => setField('contact_address', e.target.value)} placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" className={`${inputClass} resize-none`} />
              </Field>
            </div>
          </div>
        </>
      );

    // 12 · Legal
    case 'legal':
      return (
        <>
          {HeaderFor(meta, ctx.dirtyBySection.legal ? <UnsavedChip /> : undefined)}
          <div className="space-y-6">
            <Field label="นโยบายความเป็นส่วนตัว (PDPA)">
              <textarea rows={8} value={draft.privacy_policy} onChange={(e) => setField('privacy_policy', e.target.value)} placeholder="อธิบายว่าเก็บข้อมูลอะไร ใช้ทำอะไร เก็บนานแค่ไหน สิทธิของเจ้าของข้อมูล..." className={`${inputClass} resize-y`} />
            </Field>
            <Field label="ข้อกำหนดการใช้งาน (Terms of Service)">
              <textarea rows={8} value={draft.terms_of_service} onChange={(e) => setField('terms_of_service', e.target.value)} placeholder="เงื่อนไขการใช้บริการ สิทธิและหน้าที่ของผู้ใช้ การชำระเงิน การยกเลิก..." className={`${inputClass} resize-y`} />
            </Field>
            <p className="text-xs text-gray-400">
              แสดงเป็นหน้าแยก (/privacy, /terms) และมีลิงก์ท้ายหน้า · เว้นว่างไว้ = ไม่แสดงลิงก์นั้น
            </p>
          </div>
        </>
      );

    default:
      return null;
  }
}
