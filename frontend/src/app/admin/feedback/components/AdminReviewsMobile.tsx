"use client";

import { useRef } from "react";
import { Star, MessageSquareMore, Sparkles } from "lucide-react";
import Toast from "@/components/Toast";
import {
  ReviewStatCard,
  ReviewSearchInput,
  ReviewLoading,
  ReviewEmpty,
} from "@/components/review/ReviewUI";
import { CATEGORY_META } from "@/components/review/reviewFormat";
import { AdminReviewCard } from "./AdminReviewCard";
import type { AdminReviews, FilterTab } from "./useAdminReviews";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "featured", label: "แสดงหน้าแรก" },
  { key: "course", label: CATEGORY_META.course.label },
  { key: "coach", label: CATEGORY_META.coach.label },
  { key: "place", label: CATEGORY_META.place.label },
  { key: "service", label: CATEGORY_META.service.label },
  { key: "other", label: CATEGORY_META.other.label },
];

/**
 * หน้ารีวิวฝั่งแอดมิน — เวอร์ชันมือถือ (ยังไม่ได้ทำ)
 *
 * ⚠️ ต่อสายกับ page.tsx ไว้แล้ว แต่ข้างในยังว่าง
 * ถ้าอยากให้มือถือใช้งานได้ไปพลางก่อน ไปที่ page.tsx แล้วเรียก
 * AdminReviewsDesktop อย่างเดียว
 *
 * ─── ข้อควรระวังตอนออกแบบ ───
 *
 * แท็บกรองมีเจ็ดอัน (ทั้งหมด/หน้าแรก/คอร์ส/โค้ช/สถานที่/บริการ/อื่นๆ)
 * บนมือถือต้องเลื่อนแนวนอนซึ่งคนมักไม่รู้ว่าเลื่อนได้ ใช้เมนูเลือกแบบ dropdown
 * หรือแผ่นเลื่อนขึ้นจะเห็นตัวเลือกครบกว่า
 *
 * ⚠️ ปุ่มลบรีวิวลบแล้วกู้คืนไม่ได้ บนมือถืออย่าวางไว้ติดปุ่ม "แสดงหน้าแรก"
 * ซึ่งเป็นปุ่มที่กดบ่อย เพราะนิ้วพลาดง่ายกว่าเมาส์มาก
 *
 * การ์ดรีวิวใช้ชิ้นส่วนกลางจาก components/review ได้เลย (ReviewAuthor,
 * ReviewTargetBadges, RatingWithNumber) ไม่ต้องเขียนใหม่
 */

export function AdminReviewsMobile({ manager }: { manager: AdminReviews }) {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollToList = () => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-24">
      {manager.toast && (
        <Toast
          message={manager.toast.message}
          type={manager.toast.type}
          onClose={manager.clearToast}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          รีวิวและข้อเสนอแนะ
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          จัดการรีวิว เลือกรีวิวเพื่อแสดงหน้าแรก
        </p>
      </div>

      {/* Stats - Horizontal Scroll (หน้าตาเดียวกับหน้าโค้ช/ผู้เรียน) */}
      <div className="no-scrollbar px-4 py-4 flex snap-x snap-mandatory gap-3 overflow-x-auto">
        <div className="snap-start shrink-0 w-[210px]">
          <ReviewStatCard
            label="รีวิวทั้งหมด"
            value={manager.stats.total.toString()}
            icon={<MessageSquareMore size={22} />}
            tone="red"
            caption="รีวิวจากลูกค้าทั้งหมดในระบบ"
          />
        </div>
        <div className="snap-start shrink-0 w-[210px]">
          <ReviewStatCard
            label="คะแนนเฉลี่ย"
            value={manager.stats.total > 0 ? manager.stats.avg.toFixed(1) : "-"}
            icon={<Star size={22} fill="currentColor" />}
            tone="amber"
            caption={`จากทั้งหมด ${manager.stats.total} รีวิว`}
            starValue={manager.stats.total > 0 ? Math.round(manager.stats.avg) : undefined}
          />
        </div>
        <div className="snap-start shrink-0 w-[210px]">
          <ReviewStatCard
            label="แสดงหน้าแรก"
            value={manager.stats.featured.toString()}
            icon={<Sparkles size={22} />}
            tone="orange"
            caption="รีวิวที่ถูกเลือกโชว์หน้าแรก"
          />
        </div>
      </div>

      {/* Filters & Search */}
      <div className="px-4 space-y-3 mb-4">
        <div className="relative">
          <select
            value={manager.tab}
            onChange={(e) => {
              manager.setTab(e.target.value as FilterTab);
              scrollToList();
            }}
            className="w-full appearance-none bg-white border border-gray-200 text-gray-700 py-3 px-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#CC0000] focus:border-transparent text-sm font-medium shadow-sm"
          >
            {TABS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} ({manager.counts[t.key]})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
            <svg
              className="h-4 w-4 fill-current"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
            >
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>

        <ReviewSearchInput
          value={manager.search}
          onChange={manager.setSearch}
          placeholder="ค้นหาชื่อ, คอร์ส, โค้ช..."
        />
      </div>

      {/* List */}
      <div ref={listRef} className="scroll-mt-4 px-4 pb-6 flex-1">
        {manager.loading ? (
          <div className="py-10">
            <ReviewLoading />
          </div>
        ) : manager.filtered.length === 0 ? (
          <div className="py-10">
            <ReviewEmpty message="ไม่พบรีวิวที่ตรงกับเงื่อนไข" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {manager.filtered.map((review) => (
              <AdminReviewCard
                key={review.id}
                review={review}
                onToggleFeatured={() => manager.toggleFeatured(review)}
                onDelete={() => manager.deleteReview(review.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
