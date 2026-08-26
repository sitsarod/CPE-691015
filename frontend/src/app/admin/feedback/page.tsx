"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import { useAdminReviews, AdminReviewsDesktop, AdminReviewsMobile } from "./components";

/**
 * หน้ารีวิวและข้อเสนอแนะ (แอดมิน)
 *
 * ทำแค่สามอย่าง: เรียกสมอง เช็คขนาดจอ เลือกหน้าจอที่ตรงกับขนาดนั้น
 * ของจริงอยู่ที่ ./components
 *
 * ⚠️ ต้องเรียก hook ก่อนแล้วค่อยเลือกหน้าจอเสมอ
 * กฎของ React ห้ามเรียก hook แบบมีเงื่อนไข และถ้าแยกกันเรียกในแต่ละหน้าจอ
 * สองฝั่งจะมีสถานะคนละชุด พอหมุนจอทีข้อมูลที่โหลดไว้จะหายที
 */
export default function AdminFeedbackPage() {
  const manager = useAdminReviews();
  const isMobile = useIsMobile();

  return isMobile ? <AdminReviewsMobile manager={manager} /> : <AdminReviewsDesktop manager={manager} />;
}
