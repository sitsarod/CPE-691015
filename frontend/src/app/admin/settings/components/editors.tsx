'use client';

import React, { useState } from 'react';
import {
  Users,
  Check,
  Loader2,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Trash2,
  ChevronDown,
  X,
  Star,
} from 'lucide-react';
import { StatItem, FacilityTile, FaqItem, HeroSlide, PublicCoach } from '@/types/homeContent';
import { homeContentAPI } from '@/services/homeContentAPI';
import {
  smallInputClass,
  AddRowButton,
  RemoveRowButton,
  IconBtn,
  DragHandle,
} from './primitives';

// input พื้นฐานของแถว (ไม่กำหนดความกว้างเอง เพื่อคุมความกว้างด้วย flex ภายนอก)
const rowInput =
  'rounded-lg border border-gray-200 px-3 py-2 outline-none transition-colors focus:border-[#CC0000] focus:ring-2 focus:ring-[#CC0000]/20';

// ---------- สถิติ (value + label) — hero_stats / coach_stats ----------
export function StatListEditor({
  items,
  onChange,
  addLabel = 'เพิ่มสถิติ',
}: {
  items: StatItem[] | null | undefined;
  onChange: (v: StatItem[]) => void;
  addLabel?: string;
}) {
  const list = items ?? [];
  const update = (i: number, key: keyof StatItem, value: string) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  return (
    <div className="divide-y divide-gray-100 border-t border-gray-200">
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-2 py-3">
          <DragHandle />
          <input
            type="text"
            value={it.value}
            placeholder="เช่น 12"
            onChange={(e) => update(i, 'value', e.target.value)}
            className={`${rowInput} w-20 flex-none text-center font-semibold text-[#CC0000] tabular-nums`}
          />
          <input
            type="text"
            value={it.label}
            placeholder="คำอธิบาย เช่น เหรียญระดับจังหวัด"
            onChange={(e) => update(i, 'label', e.target.value)}
            className={`${rowInput} min-w-0 flex-1`}
          />
          <RemoveRowButton onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <div className="pt-3">
        <AddRowButton onClick={() => onChange([...list, { value: '', label: '' }])} label={addLabel} />
      </div>
    </div>
  );
}

// ---------- ช่องภาพบรรยากาศ (label + wide) ----------
export function TileListEditor({
  items,
  onChange,
}: {
  items: FacilityTile[] | null | undefined;
  onChange: (v: FacilityTile[]) => void;
}) {
  const list = items ?? [];
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const update = (i: number, patch: Partial<FacilityTile>) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const handleImage = async (i: number, file: File) => {
    try {
      setUploadingIdx(i);
      const url = await homeContentAPI.uploadImage(file);
      update(i, { image_url: url });
    } catch (error) {
      alert(`อัปโหลดรูปไม่สำเร็จ: ${(error as Error).message}`);
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <div className="divide-y divide-gray-100 border-t border-gray-200">
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-2 py-3">
          <DragHandle />
          {/* รูปช่อง — อัปโหลด/เปลี่ยนได้ (ว่าง = หน้าแรกใช้ placeholder) */}
          <label
            className={`relative flex h-11 w-16 flex-none items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition-colors hover:border-[#CC0000] ${
              uploadingIdx === null ? 'cursor-pointer' : 'pointer-events-none'
            }`}
            title="อัปโหลด/เปลี่ยนรูป"
          >
            {uploadingIdx === i ? (
              <Loader2 size={16} className="animate-spin text-[#CC0000]" />
            ) : it.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={16} className="text-gray-400" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingIdx !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleImage(i, f);
              }}
            />
          </label>
          {it.image_url && (
            <button
              type="button"
              onClick={() => update(i, { image_url: '' })}
              aria-label="ลบรูป"
              title="ลบรูป"
              className="grid h-8 w-8 flex-none place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={15} />
            </button>
          )}
          <input
            type="text"
            value={it.label}
            placeholder="ชื่อภาพ / คำบรรยาย เช่น คอร์ทหลัก"
            onChange={(e) => update(i, { label: e.target.value })}
            className={`${rowInput} min-w-0 flex-1`}
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap select-none">
            <input
              type="checkbox"
              checked={!!it.wide}
              onChange={(e) => update(i, { wide: e.target.checked })}
              className="w-4 h-4 accent-[#CC0000]"
            />
            กว้าง
          </label>
          <RemoveRowButton onClick={() => onChange(list.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <div className="pt-3">
        <AddRowButton
          onClick={() => onChange([...list, { label: '', wide: false }])}
          label="เพิ่มช่องภาพ"
        />
      </div>
    </div>
  );
}

// ---------- FAQ (question + answer) — accordion เปิดทีละข้อ, ไฮไลต์แถวที่ยังไม่มีคำตอบ ----------
export function FaqListEditor({
  items,
  onChange,
}: {
  items: FaqItem[] | null | undefined;
  onChange: (v: FaqItem[]) => void;
}) {
  const list = items ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(list.length ? 0 : null);

  const update = (i: number, key: keyof FaqItem, value: string) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));

  const remove = (i: number) => {
    onChange(list.filter((_, idx) => idx !== i));
    setOpenIndex((cur) => (cur === i ? null : cur !== null && cur > i ? cur - 1 : cur));
  };

  const add = () => {
    onChange([...list, { question: '', answer: '' }]);
    setOpenIndex(list.length);
  };

  return (
    <div className="border-t border-gray-200">
      <div className="divide-y divide-gray-100">
        {list.map((it, i) => {
          const open = openIndex === i;
          const noAnswer = !it.answer.trim();
          return (
            <div key={i}>
              <div className="flex items-center gap-3 py-3.5">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex flex-1 items-center gap-3 min-w-0 text-left"
                >
                  <ChevronDown
                    size={16}
                    className={`flex-none text-gray-400 transition-transform duration-200 ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                  <span className="flex-1 truncate text-sm font-medium text-gray-800">
                    {it.question || <span className="text-gray-400">คำถามใหม่</span>}
                  </span>
                </button>
                <span className="flex-none text-xs text-gray-400 whitespace-nowrap">
                  {noAnswer ? 'ยังไม่มีคำตอบ' : 'มีคำตอบแล้ว'}
                </span>
                <RemoveRowButton onClick={() => remove(i)} />
              </div>
              <div
                className="grid transition-all duration-200 ease-in-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="space-y-2 pb-4">
                    <input
                      type="text"
                      value={it.question}
                      placeholder="คำถาม"
                      onChange={(e) => update(i, 'question', e.target.value)}
                      className={`${smallInputClass} font-medium`}
                    />
                    <textarea
                      rows={3}
                      value={it.answer}
                      placeholder="คำตอบ"
                      onChange={(e) => update(i, 'answer', e.target.value)}
                      className={`${smallInputClass} resize-none`}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pt-3">
        <AddRowButton onClick={add} label="เพิ่มคำถาม" />
      </div>
    </div>
  );
}

// ---------- สไลด์ Hero (บันทึกทันที) ----------
export function SlideGrid({
  slides,
  uploading,
  onUpload,
  onToggle,
  onDelete,
  onMove,
}: {
  slides: HeroSlide[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onToggle: (slide: HeroSlide) => void;
  onDelete: (slide: HeroSlide) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(file);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`overflow-hidden rounded-xl border border-gray-200 ${
            slide.is_active ? '' : 'opacity-50'
          }`}
        >
          <div className="relative aspect-video bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.image_url}
              alt={`สไลด์ ${i + 1}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute left-0 top-0 bg-[#CC0000] px-2 py-0.5 text-xs font-medium text-white">
              #{i + 1}
              {!slide.is_active && ' · ซ่อน'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 border-t border-gray-100 bg-white px-2 py-2">
            <div className="flex items-center gap-1">
              <IconBtn label="เลื่อนขึ้น" disabled={i === 0} onClick={() => onMove(i, -1)}>
                <ArrowUp size={16} />
              </IconBtn>
              <IconBtn
                label="เลื่อนลง"
                disabled={i === slides.length - 1}
                onClick={() => onMove(i, 1)}
              >
                <ArrowDown size={16} />
              </IconBtn>
            </div>
            <div className="flex items-center gap-1">
              <IconBtn
                label={slide.is_active ? 'ซ่อนจากหน้าแรก' : 'แสดงบนหน้าแรก'}
                onClick={() => onToggle(slide)}
              >
                {slide.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
              </IconBtn>
              <IconBtn label="ลบ" danger onClick={() => onDelete(slide)}>
                <Trash2 size={16} />
              </IconBtn>
            </div>
          </div>
        </div>
      ))}

      {/* ช่องอัปโหลด (dashed) */}
      <label
        className={`flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#CC0000]/40 bg-[#FFF6F6] text-center transition-colors hover:bg-[#FFECEC] ${
          uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'
        }`}
      >
        {uploading ? (
          <Loader2 size={22} className="animate-spin text-[#CC0000]" />
        ) : (
          <ImagePlus size={22} className="text-[#CC0000]" />
        )}
        <span className="text-sm font-medium text-[#CC0000]">
          {uploading ? 'กำลังอัปโหลด...' : 'ลากรูปมาวาง / เลือกไฟล์'}
        </span>
        <span className="text-xs text-gray-400">JPG / PNG · แนะนำ 1920×820</span>
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={uploading}
          className="hidden"
        />
      </label>
    </div>
  );
}

// ---------- เลือกโค้ชที่แสดงหน้าแรก (บันทึกทันที) ----------
export function CoachGrid({
  coaches,
  onToggle,
  onSetHead,
}: {
  coaches: PublicCoach[];
  onToggle: (coach: PublicCoach) => void;
  onSetHead: (coach: PublicCoach) => void;
}) {
  if (coaches.length === 0) {
    return <p className="text-sm text-gray-400">ยังไม่มีข้อมูลโค้ชในระบบ</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {coaches.map((coach) => {
        const name =
          coach.nickname ||
          [coach.firstName, coach.lastName].filter(Boolean).join(' ') ||
          `โค้ช #${coach.id}`;
        return (
          // ⚠️ ห้ามเป็น <button> ครอบทั้งใบ เพราะข้างในมีปุ่ม "ตั้งเป็นหัวหน้า" อีกตัว
          // ปุ่มซ้อนปุ่มเป็น HTML ที่ไม่ถูกต้อง เบราว์เซอร์จะยิง onClick ตัวนอกไปด้วย
          <div
            key={coach.id}
            className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
              coach.feature_on_home
                ? 'border-[#CC0000] bg-[#FFF0F0]'
                : 'border-gray-200'
            }`}
          >
          <button
            onClick={() => onToggle(coach)}
            className="flex items-center gap-3 text-left"
          >
            {coach.profile_picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coach.profile_picture}
                alt={name}
                className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <Users size={18} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-800">{name}</p>
              <p className="truncate text-xs text-gray-500">{coach.specialization || '—'}</p>
            </div>
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md ${
                coach.feature_on_home ? 'bg-[#CC0000] text-white' : 'border border-gray-300'
              }`}
            >
              {coach.feature_on_home && <Check size={14} />}
            </span>
          </button>

          <button
            onClick={() => onSetHead(coach)}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
              coach.is_head_coach
                ? 'border-[#CC0000] bg-[#CC0000] text-white'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Star size={13} className={coach.is_head_coach ? 'fill-current' : ''} />
            {coach.is_head_coach ? 'หัวหน้าผู้ฝึกสอน' : 'ตั้งเป็นหัวหน้า'}
          </button>
          </div>
        );
      })}
    </div>
  );
}
