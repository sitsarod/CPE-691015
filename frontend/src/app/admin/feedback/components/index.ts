/**
 * หน้ารีวิวฝั่งแอดมิน — ทางเข้าเดียวของโฟลเดอร์นี้
 *
 *   useAdminReviews.ts        สมอง — สถานะ เรียก API และตัวกรอง (ไม่มี JSX)
 *   AdminReviewCard.tsx       การ์ดรีวิวที่มีปุ่มจัดการของแอดมิน
 *   AdminReviewsDesktop.tsx   หน้าจอคอมพิวเตอร์
 *   AdminReviewsMobile.tsx    หน้าจอมือถือ — ยังเป็นโครงเปล่า
 */

export { useAdminReviews } from "./useAdminReviews";
export type { AdminReviews } from "./useAdminReviews";
export { AdminReviewsDesktop } from "./AdminReviewsDesktop";
export { AdminReviewsMobile } from "./AdminReviewsMobile";
