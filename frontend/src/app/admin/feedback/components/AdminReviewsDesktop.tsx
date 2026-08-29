"use client";

import type { ElementType } from "react";
import { Star, MessageSquareMore, Sparkles, List } from "lucide-react";
import Toast from "@/components/Toast";
import {
  ReviewStatCard,
  ReviewSearchInput,
  ReviewFilterTab,
  ReviewLoading,
  ReviewEmpty,
} from "@/components/review/ReviewUI";
import { CATEGORY_META } from "@/components/review/reviewFormat";
import { AdminReviewCard } from "./AdminReviewCard";
import type { AdminReviews, FilterTab } from "./useAdminReviews";

/** แท็บกรองด้านบน — สร้างจาก CATEGORY_META เพื่อไม่ให้ชื่อหัวข้อหลุดจากกัน */
const TABS: { key: FilterTab; label: string; icon: ElementType }[] = [
  { key: "all", label: "ทั้งหมด", icon: List },
  { key: "featured", label: "แสดงหน้าแรก", icon: Sparkles },
  { key: "course", label: CATEGORY_META.course.label, icon: CATEGORY_META.course.icon },
  { key: "coach", label: CATEGORY_META.coach.label, icon: CATEGORY_META.coach.icon },
  { key: "place", label: CATEGORY_META.place.label, icon: CATEGORY_META.place.icon },
  { key: "service", label: CATEGORY_META.service.label, icon: CATEGORY_META.service.icon },
  { key: "other", label: CATEGORY_META.other.label, icon: CATEGORY_META.other.icon },
];

/**
 * หน้ารีวิวฝั่งแอดมิน — เวอร์ชันหน้าจอคอมพิวเตอร์
 *
 * วางของอย่างเดียว ไม่เรียก API และไม่ตัดสินใจอะไร ทุกอย่างมาจาก useAdminReviews
 */
export function AdminReviewsDesktop({ manager }: { manager: AdminReviews }) {
  return (
    <div className="mx-auto max-w-7xl">
      {manager.toast && <Toast message={manager.toast.message} type={manager.toast.type} onClose={manager.clearToast} />}

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
          รีวิวและข้อเสนอแนะ (Reviews)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          รีวิวคอร์ส โค้ช สถานที่ บริการ และข้อเสนอแนะอื่นๆ จากลูกค้าที่ลงทะเบียนเรียน —
          เลือกรีวิวเพื่อแสดงในหน้าแรกของระบบ
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <ReviewStatCard
          label="รีวิวทั้งหมด"
          value={manager.stats.total.toString()}
          icon={<MessageSquareMore size={22} />}
          tone="red"
          caption="รีวิวจากลูกค้าทั้งหมดในระบบ"
        />
        <ReviewStatCard
          label="คะแนนเฉลี่ย"
          value={manager.stats.total > 0 ? manager.stats.avg.toFixed(1) : "-"}
          icon={<Star size={22} fill="currentColor" />}
          tone="amber"
          caption={`จากทั้งหมด ${manager.stats.total} รีวิว`}
          starValue={manager.stats.total > 0 ? Math.round(manager.stats.avg) : undefined}
        />
        <ReviewStatCard
          label="แสดงหน้าแรก"
          value={manager.stats.featured.toString()}
          icon={<Sparkles size={22} />}
          tone="orange"
          caption="รีวิวที่ถูกเลือกโชว์หน้าแรก"
        />
      </div>

      <div className="bg-white border-b border-slate-200 rounded-xl mb-6 shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = manager.tab === t.key;
              return (
                <ReviewFilterTab
                  key={t.key}
                  isActive={isActive}
                  label={t.label}
                  count={manager.counts[t.key]}
                  icon={<Icon className={`w-4 h-4 ${isActive ? "text-[#CC0000]" : "text-slate-400"}`} />}
                  onClick={() => manager.setTab(t.key)}
                />
              );
            })}
          </div>

          <ReviewSearchInput
            value={manager.search}
            onChange={manager.setSearch}
            placeholder="ค้นหาชื่อลูกค้า, คอร์ส, โค้ช..."
          />
        </div>
      </div>

      {manager.loading ? (
        <ReviewLoading />
      ) : manager.filtered.length === 0 ? (
        <ReviewEmpty message="ไม่พบรีวิวที่ตรงกับเงื่อนไข" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
  );
}
