"use client";

import { Announcement } from "@/types/announcement";
import { Calendar, ExternalLink, X } from "lucide-react";

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });

// ลิงก์ปลอดภัยเฉพาะ http/https — กัน scheme อันตราย (javascript:, data: ฯลฯ)
const isSafeLink = (link?: string) => !!link && (link.startsWith("http://") || link.startsWith("https://"));

// กล่องรูปแบบ "เห็นเต็มภาพไม่ตัดขอบ" — รูปจริง object-contain + พื้นหลังเบลอจากรูปเดียวกันเติมขอบ
export function Poster({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-50" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="relative h-full w-full object-contain" />
    </div>
  );
}

interface Props {
  announcement: Announcement;
  onClose: () => void;
}

// หน้าต่างรายละเอียดประกาศ (lightbox) — เห็นรูปเต็มภาพ + เนื้อหาครบ โดยไม่ต้องล็อกอิน
// ใช้ร่วมกันทั้งในหน้าข่าว (AnnouncementNewsSection) และในแกลเลอรี "รูปประกาศทั้งหมด"
export default function AnnouncementDetailModal({ announcement, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
          aria-label="ปิด"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto">
          {announcement.image_url && (
            <Poster src={announcement.image_url} alt={announcement.title} className="max-h-[60vh] w-full" />
          )}

          <div className="p-6 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {announcement.category?.name && (
                <span className="rounded-md bg-[#FFF0F0] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#CC0000]">
                  {announcement.category.name}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <Calendar size={16} /> {fmtDate(announcement.start_date)}
              </span>
            </div>

            <h3 className="mb-4 text-2xl font-extrabold leading-tight text-gray-900 sm:text-3xl">
              {announcement.title}
            </h3>

            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">
              {announcement.content}
            </div>

            {isSafeLink(announcement.link) && (
              <div className="mt-6">
                <a
                  href={announcement.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#CC0000] px-6 py-3 font-semibold text-white shadow-md shadow-[#CC0000]/30 transition-all hover:scale-105 hover:bg-[#990000]"
                >
                  <ExternalLink size={18} /> ไปยังลิงก์ที่เกี่ยวข้อง
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
