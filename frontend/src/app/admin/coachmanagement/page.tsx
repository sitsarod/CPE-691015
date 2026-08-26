"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useCoachManagement,
  CoachManagementDesktop,
  CoachManagementMobile,
} from "./components";

/**
 * หน้าจัดการโค้ช (แอดมิน)
 *
 * ทำแค่สามอย่าง: เรียกสมอง เช็คขนาดจอ เลือกหน้าจอที่ตรงกับขนาดนั้น
 * ของจริงอยู่ที่ ./components
 *
 * ⚠️ ต้องเรียก hook ก่อนแล้วค่อยเลือกหน้าจอเสมอ
 *
 * กฎของ React ห้ามเรียก hook แบบมีเงื่อนไข และถ้าย้ายการเรียกเข้าไปในแต่ละหน้าจอ
 * สองฝั่งจะมีสถานะคนละชุด พอหมุนจอทีข้อมูลที่โหลดไว้จะหายที
 *
 * ⚠️ CoachManagementMobile ยังเป็นโครงเปล่า
 * ถ้าอยากให้มือถือใช้งานได้ไปพลางก่อน เปลี่ยนบรรทัดล่างเป็น
 * <CoachManagementDesktop manager={manager} /> อย่างเดียว
 */
export default function CoachManagementPage() {
  const manager = useCoachManagement();
  const isMobile = useIsMobile();

  return isMobile ? <CoachManagementMobile manager={manager} /> : <CoachManagementDesktop manager={manager} />;
}
