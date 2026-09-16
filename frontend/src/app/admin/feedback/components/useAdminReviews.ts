"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { reviewAPI } from "@/services/reviewAPI";
import { Review, ReviewCategory } from "@/types/review";
import { useToast } from "@/hooks/useToast";
import { customerName } from "@/components/review/reviewFormat";

import { useConfirm } from "@/components/ConfirmProvider";
/**
 * สมองของหน้ารีวิวฝั่งแอดมิน
 *
 * ไม่มี JSX ในไฟล์นี้เลย ทั้งหน้าจอคอมพิวเตอร์และมือถือใช้ค่าจากที่นี่ชุดเดียวกัน
 */

export type FilterTab = "all" | "featured" | ReviewCategory;

export function useAdminReviews() {
  const confirmAction = useConfirm();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const { toast, showToast, clearToast } = useToast();

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const data = await reviewAPI.getAllReviews();
      setReviews(data || []);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      showToast("ไม่สามารถโหลดข้อมูลรีวิวได้ โปรดตรวจสอบการเชื่อมต่อของคุณ", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReviews();
  }, [fetchReviews]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const featured = reviews.filter((r) => r.is_featured).length;
    const avg = total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    return { total, featured, avg };
  }, [reviews]);

  const counts = useMemo(
    () => ({
      all: reviews.length,
      featured: reviews.filter((r) => r.is_featured).length,
      course: reviews.filter((r) => r.category === "course").length,
      coach: reviews.filter((r) => r.category === "coach").length,
      place: reviews.filter((r) => r.category === "place").length,
      service: reviews.filter((r) => r.category === "service").length,
      other: reviews.filter((r) => r.category === "other").length,
    }),
    [reviews],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (tab === "featured" && !r.is_featured) return false;
      if (tab !== "all" && tab !== "featured" && r.category !== tab) return false;
      if (!q) return true;

      return (
        customerName(r).toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        (r.course?.course_name.toLowerCase().includes(q) ?? false) ||
        (r.coach?.nickname.toLowerCase().includes(q) ?? false)
      );
    });
  }, [reviews, tab, search]);

  /**
   * สลับสถานะ "แสดงหน้าแรก"
   *
   * เปลี่ยนหน้าจอทันทีก่อนเซิร์ฟเวอร์ตอบ เพื่อให้ปุ่มตอบสนองไว
   * แล้วย้อนกลับถ้าล้มเหลว — ผู้ใช้จะไม่เห็นสถานะที่ไม่ตรงกับของจริงค้างอยู่
   */
  const toggleFeatured = async (review: Review) => {
    const next = !review.is_featured;
    setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, is_featured: next } : r)));

    try {
      await reviewAPI.setFeatured(review.id, next);
      showToast(next ? "เพิ่มรีวิวไปแสดงหน้าแรกแล้ว" : "นำรีวิวออกจากหน้าแรกแล้ว");
    } catch (error: unknown) {
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, is_featured: !next } : r)));
      const message = error instanceof Error ? error.message : "ไม่ทราบสาเหตุ";
      showToast(`ไม่สามารถอัปเดตสถานะการแสดงผลได้: ${message}`, "error");
    }
  };

  const deleteReview = async (id: number) => {
    if (!(await confirmAction({
      message: "คุณแน่ใจหรือไม่ว่าต้องการลบรีวิวนี้?\n\nการกระทำนี้ไม่สามารถยกเลิกได้",
      tone: "danger",
    }))) return;

    try {
      await reviewAPI.deleteReview(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast("ลบรีวิวเรียบร้อยแล้ว");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "ไม่ทราบสาเหตุ";
      showToast(`เกิดข้อผิดพลาดในการลบรีวิว: ${message}`, "error");
    }
  };

  return {
    reviews,
    filtered,
    loading,
    stats,
    counts,

    tab,
    setTab,
    search,
    setSearch,

    toast,
    clearToast,

    toggleFeatured,
    deleteReview,
  };
}

export type AdminReviews = ReturnType<typeof useAdminReviews>;
