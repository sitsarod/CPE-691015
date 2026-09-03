"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useStudentManagement,
  StudentManagementDesktop,
  StudentManagementMobile,
} from "./components";

/**
 * หน้าจัดการนักเรียน (แอดมิน)
 *
 * ทำแค่สามอย่าง: เรียกสมอง เช็คขนาดจอ เลือกหน้าจอที่ตรงกับขนาดนั้น
 * ของจริงอยู่ที่ ./components
 *
 * ⚠️ ต้องเรียก hook ก่อนแล้วค่อยเลือกหน้าจอเสมอ
 * กฎของ React ห้ามเรียก hook แบบมีเงื่อนไข และถ้าแยกกันเรียกในแต่ละหน้าจอ
 * สองฝั่งจะมีสถานะคนละชุด พอหมุนจอทีข้อมูลที่โหลดไว้จะหายที
 *
 * ⚠️ StudentManagementMobile ยังเป็นโครงเปล่า
 * ถ้าอยากให้มือถือใช้งานได้ไปพลางก่อน เปลี่ยนบรรทัดล่างเป็น
 * <StudentManagementDesktop manager={manager} /> อย่างเดียว
 */
export default function StudentManagementPage() {
  const manager = useStudentManagement();
  const isMobile = useIsMobile();

  return isMobile ? <StudentManagementMobile manager={manager} /> : <StudentManagementDesktop manager={manager} />;
}
