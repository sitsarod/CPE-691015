"use client";

import type { ReactNode, ElementType } from "react";
import { BookOpen, UserRound, Sparkles, MessageSquareMore, Loader2, Search } from "lucide-react";
import type { Review } from "@/types/review";
import { StarRating } from "./StarRating";
import { CATEGORY_META, customerName, customerInitial, formatReviewDate, isGeneralCategory } from "./reviewFormat";

/**
 * ชิ้นส่วนหน้าตาที่หน้ารีวิวใช้ร่วมกัน
 *
 * เดิมหน้ารีวิวของแอดมินกับของโค้ชมีการ์ดสถิติ การ์ดรีวิว แถบค้นหา และกล่องว่าง
 * เขียนไว้คนละชุดแต่หน้าตาเหมือนกัน พอมีคนแก้สีที่หน้าหนึ่ง อีกหน้าก็เพี้ยนตาม
 * ไม่ทัน รวมมาไว้ที่เดียว
 */

/** การ์ดสรุปตัวเลขด้านบนของหน้ารีวิว */
export function ReviewStatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: "gray" | "amber" | "red";
}) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-50 text-amber-500",
    red: "bg-rose-50 text-[#CC0000]",
  };

  return (
    <div className="flex items-center gap-4 p-5 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`p-3 rounded-lg ${tones[tone]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-black text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/** ป้ายบอกว่ารีวิวนี้พูดถึงอะไร (หัวข้อทั่วไป / คอร์ส / โค้ช) */
export function ReviewTargetBadges({ review }: { review: Review }) {
  const GeneralIcon = CATEGORY_META[review.category]?.icon as ElementType | undefined;

  return (
    <div className="flex flex-wrap gap-2">
      {isGeneralCategory(review.category) && GeneralIcon && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
          <GeneralIcon size={13} />
          {CATEGORY_META[review.category].label}
        </span>
      )}
      {review.course && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
          <BookOpen size={13} />
          {review.course.course_name}
        </span>
      )}
      {review.coach && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700">
          <UserRound size={13} />
          โค้ช {review.coach.nickname}
        </span>
      )}
    </div>
  );
}

/** หัวการ์ดรีวิว — วงกลมตัวอักษรแรก ชื่อผู้รีวิว และวันที่ */
export function ReviewAuthor({ review }: { review: Review }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-full bg-rose-50 text-[#CC0000] flex items-center justify-center font-bold flex-shrink-0">
        {customerInitial(review)}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 truncate">{customerName(review)}</p>
        <p className="text-xs text-gray-400">{formatReviewDate(review.created_at)}</p>
      </div>
    </div>
  );
}

/** ป้าย "แสดงหน้าแรก" */
export function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-[#CC0000] flex-shrink-0">
      <Sparkles size={12} />
      หน้าแรก
    </span>
  );
}

/** คะแนนดาวพร้อมตัวเลขกำกับ */
export function RatingWithNumber({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <StarRating value={value} size={size} />
      <span className="text-sm font-semibold text-gray-500">{value}.0</span>
    </div>
  );
}

/** ช่องค้นหาของหน้ารีวิว */
export function ReviewSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative px-4 pb-3 md:pb-0 md:pr-4">
      <Search size={18} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full md:w-72 pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] outline-none transition-all"
      />
    </div>
  );
}

/** ปุ่มแท็บกรองด้านบนรายการรีวิว */
export function ReviewFilterTab({
  isActive,
  label,
  count,
  icon,
  onClick,
}: {
  isActive: boolean;
  label: string;
  count: number;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
        isActive
          ? "border-[#CC0000] text-[#CC0000] bg-rose-50/50 font-bold"
          : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isActive ? "bg-[#CC0000] text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** กล่องระหว่างโหลดข้อมูล */
export function ReviewLoading() {
  return (
    <div className="bg-white/50 backdrop-blur-xs flex items-center justify-center p-12 rounded-2xl border border-slate-200">
      <div className="text-slate-500 font-bold text-xs animate-pulse flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        กำลังโหลดข้อมูลรีวิว...
      </div>
    </div>
  );
}

/** กล่องเมื่อไม่มีรีวิวให้แสดง */
export function ReviewEmpty({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 py-16 text-center text-gray-400">
      <MessageSquareMore size={40} className="mx-auto mb-3 opacity-40" />
      {message}
    </div>
  );
}
