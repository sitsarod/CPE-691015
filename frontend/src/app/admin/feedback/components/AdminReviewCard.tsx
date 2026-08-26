"use client";

import { Sparkles, Trash2 } from "lucide-react";
import type { Review } from "@/types/review";
import {
  ReviewAuthor,
  ReviewTargetBadges,
  RatingWithNumber,
  FeaturedBadge,
} from "@/components/review/ReviewUI";

/**
 * การ์ดรีวิวฝั่งแอดมิน
 *
 * ต่างจากของโค้ชตรงที่มีปุ่มจัดการสองปุ่ม (แสดงหน้าแรก / ลบ) จึงแยกไว้ที่นี่
 * ส่วนหัวการ์ด ป้ายหัวข้อ และคะแนน ใช้ชิ้นส่วนกลางจาก components/review
 */
export function AdminReviewCard({
  review,
  onToggleFeatured,
  onDelete,
}: {
  review: Review;
  onToggleFeatured: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border p-5 flex flex-col gap-4 transition-shadow hover:shadow-md ${
        review.is_featured ? "border-[#CC0000]/30 ring-1 ring-[#CC0000]/10" : "border-gray-200 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <ReviewAuthor review={review} />
        {review.is_featured && <FeaturedBadge />}
      </div>

      <ReviewTargetBadges review={review} />

      <RatingWithNumber value={review.rating} size={18} />

      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{review.comment}</p>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          onClick={onToggleFeatured}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            review.is_featured
              ? "bg-[#CC0000] text-white hover:bg-[#990000]"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Sparkles size={15} />
          {review.is_featured ? "ยกเลิกหน้าแรก" : "แสดงหน้าแรก"}
        </button>

        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="ลบ"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
